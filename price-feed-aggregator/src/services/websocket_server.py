import asyncio
import json
import logging
import uuid
from typing import Dict, Set, Optional, Any, List, Tuple, cast, NamedTuple
from datetime import datetime, timedelta

import websockets
import websockets.server
from websockets.server import WebSocketServerProtocol, WebSocketServer
from websockets.exceptions import ConnectionClosed

from src.clients.pyth_client import PythHermesClient
from src.models.price_feed_models import (
    PythPriceData, 
    FeedSubscription,
    MessageType
)


class FeedSubscriptionInfo(NamedTuple):
    """Represents a feed subscription for Pyth data."""
    feed_id: str  # Pyth feed ID


def sanitize_feed_id(feed_id: str) -> str:
    """
    Sanitize the feed ID by removing the '0x' prefix if present.
    
    Args:
        feed_id: The feed ID to sanitize
        
    Returns:
        The sanitized feed ID
    """
    if feed_id and isinstance(feed_id, str) and feed_id.startswith("0x"):
        return feed_id[2:]
    return feed_id


class PriceFeedWebsocketServer:
    """
    Websocket server that allows clients to connect and subscribe to Pyth price feeds.
    It forwards price updates from Pyth to subscribed clients.
    """

    def __init__(
        self,
        pyth_client: PythHermesClient,
        host: str = "localhost",
        port: int = 8765,
    ) -> None:
        self.pyth_client: PythHermesClient = pyth_client
        self.host: str = host
        self.port: int = port
        self.logger = logging.getLogger("websocket_server")
        
        # Client connections and their subscriptions
        self.clients: Dict[str, WebSocketServerProtocol] = {}
        self.client_subscriptions: Dict[str, Set[FeedSubscriptionInfo]] = {}
        self.feed_subscribers: Dict[str, Set[str]] = {}  # feed_id -> client_ids
        
        # Track active price feeds
        self.active_pyth_feeds: Set[str] = set()
        
        # Cache to store last received data
        self.latest_pyth_data: Dict[str, PythPriceData] = {}
        
        # Server instance
        self.server: Optional[WebSocketServer] = None

    async def start(self) -> None:
        """Start the websocket server and register callbacks for Pyth."""
        # Register callback for Pyth price updates
        self.pyth_client.register_price_callback(self.handle_pyth_price_update)
        
        # Start the websocket server
        self.server = await websockets.server.serve(
            self.handle_client_connection,
            self.host,
            self.port,
            # Set ping_interval and ping_timeout to keep connections alive
            ping_interval=30,  # Send ping every 30 seconds
            ping_timeout=10,   # Wait 10 seconds for pong response
        )
        
        self.logger.info(f"Websocket server started on ws://{self.host}:{self.port}")

    async def stop(self) -> None:
        """Stop the websocket server."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None
            
        # Clear client data
        self.clients = {}
        self.client_subscriptions = {}
        self.feed_subscribers = {}
        self.latest_pyth_data = {}
        
        self.logger.info("Websocket server stopped")

    async def handle_client_connection(self, websocket: WebSocketServerProtocol, path: str) -> None:
        """
        Handle a new client connection.
        
        Args:
            websocket: The client's websocket connection
            path: The connection path
        """
        # Generate a unique ID for this client
        client_id = str(uuid.uuid4())
        self.clients[client_id] = websocket
        self.client_subscriptions[client_id] = set()
        
        try:
            # Send welcome message with connection info
            try:
                await websocket.send(json.dumps({
                    "type": "connection_established",
                    "client_id": client_id,
                    "message": "Connected to Pyth Price Feed Websocket Server"
                }))
            except Exception as e:
                self.logger.error(f"Failed to send welcome message to client {client_id}: {e}")
                # If we can't send the welcome message, the connection might be broken
                # Clean up and return
                await self.handle_client_disconnect(client_id)
                return
            
            # Process messages from this client
            async for message in websocket:
                if isinstance(message, str):
                    try:
                        await self.process_client_message(client_id, message)
                    except Exception as e:
                        self.logger.error(f"Error processing message from client {client_id}: {e}")
                        # Continue processing messages even if one fails
                else:
                    # Handle binary messages if needed or log a warning
                    self.logger.warning(f"Received binary message from client {client_id}, ignoring")
                
        except ConnectionClosed:
            self.logger.info(f"Client {client_id} disconnected")
        except Exception as e:
            self.logger.error(f"Error handling client {client_id}: {e}")
        finally:
            # Make sure client ID is removed from client dictionaries
            try:
                # This might throw exceptions if called multiple times,
                # so we catch any errors during cleanup
                await self.handle_client_disconnect(client_id)
            except Exception as e:
                self.logger.error(f"Error during client disconnect cleanup for {client_id}: {e}")
                # Remove client directly if handle_client_disconnect fails
                if client_id in self.clients:
                    del self.clients[client_id]
                if client_id in self.client_subscriptions:
                    del self.client_subscriptions[client_id]

    async def process_client_message(self, client_id: str, message: str) -> None:
        """
        Process a message from a client.
        
        Args:
            client_id: The unique ID of the client
            message: The message received from the client
        """
        try:
            data = json.loads(message)
            message_type = data.get("type", "")
            
            if message_type == "subscribe":
                # Handle subscription request
                feed_id = data.get("feed_id")
                
                # We need a feed_id for all subscriptions
                if not feed_id:
                    await self.clients[client_id].send(json.dumps({
                        "type": "error",
                        "message": "Feed ID is required for subscriptions"
                    }))
                    return
                    
                # Sanitize feed ID by removing 0x prefix if present
                feed_id = sanitize_feed_id(feed_id)
                
                # Create a subscription
                subscription = FeedSubscriptionInfo(feed_id=feed_id)
                await self.subscribe_client_to_feed(client_id, subscription)
                    
            elif message_type == "unsubscribe":
                # Handle unsubscription request
                feed_id = data.get("feed_id")
                
                if feed_id:
                    # Sanitize feed ID by removing 0x prefix if present
                    feed_id = sanitize_feed_id(feed_id)
                    
                    # Find the subscription with this feed_id
                    for subscription in self.client_subscriptions.get(client_id, set()):
                        if subscription.feed_id == feed_id:
                            await self.unsubscribe_client_from_feed(client_id, subscription)
                            break
                
            elif message_type == "subscribe_multiple":
                # Handle subscription to multiple feeds
                subscriptions = data.get("subscriptions", [])
                if subscriptions and isinstance(subscriptions, list):
                    for sub_data in subscriptions:
                        feed_id = sub_data.get("feed_id")
                        
                        # We need a feed_id for all subscriptions
                        if not feed_id:
                            continue
                            
                        # Sanitize feed ID by removing 0x prefix if present
                        feed_id = sanitize_feed_id(feed_id)
                        
                        subscription = FeedSubscriptionInfo(feed_id=feed_id)
                        await self.subscribe_client_to_feed(client_id, subscription)
                
            elif message_type == "get_available_feeds":
                # Handle request for available feeds
                await self.send_available_feeds(client_id)
                
            else:
                # Unknown message type
                await self.clients[client_id].send(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }))
                
        except json.JSONDecodeError:
            await self.clients[client_id].send(json.dumps({
                "type": "error",
                "message": "Invalid JSON message"
            }))
        except Exception as e:
            self.logger.error(f"Error processing message from client {client_id}: {e}")
            try:
                await self.clients[client_id].send(json.dumps({
                    "type": "error",
                    "message": "Error processing your request"
                }))
            except:
                pass

    async def subscribe_client_to_feed(self, client_id: str, subscription: FeedSubscriptionInfo) -> None:
        """
        Subscribe a client to a specific price feed.
        
        Args:
            client_id: The unique ID of the client
            subscription: The feed subscription details
        """
        feed_id = subscription.feed_id
        
        # Add subscription for this client
        if client_id in self.client_subscriptions:
            self.client_subscriptions[client_id].add(subscription)

            # Add client to feed subscribers
            if feed_id not in self.feed_subscribers:
                self.feed_subscribers[feed_id] = set()
            self.feed_subscribers[feed_id].add(client_id)
            
            # Subscribe to Pyth feed if this is the first client for this feed
            if feed_id not in self.active_pyth_feeds:
                self.active_pyth_feeds.add(feed_id)
                await self.pyth_client.subscribe_to_feed(feed_id)
            
            # Notify client of successful subscription
            await self.clients[client_id].send(json.dumps({
                "type": MessageType.SUBSCRIPTION_CONFIRMED.value,
                "feed_id": feed_id
            }))
            
            self.logger.info(f"Client {client_id} subscribed to feed {feed_id}")

    async def unsubscribe_client_from_feed(self, client_id: str, subscription: FeedSubscriptionInfo) -> None:
        """
        Unsubscribe a client from a specific price feed.
        
        Args:
            client_id: The unique ID of the client
            subscription: The feed subscription to unsubscribe from
        """
        feed_id = subscription.feed_id
        
        # Remove subscription for this client
        if client_id in self.client_subscriptions:
            self.client_subscriptions[client_id].discard(subscription)
            
            # Remove client from feed subscribers
            if feed_id in self.feed_subscribers and client_id in self.feed_subscribers[feed_id]:
                self.feed_subscribers[feed_id].remove(client_id)
                
                # If no more clients are subscribed to this feed, unsubscribe from Pyth
                if not self.feed_subscribers[feed_id] and feed_id in self.active_pyth_feeds:
                    self.active_pyth_feeds.remove(feed_id)
                    await self.pyth_client.unsubscribe_from_feed(feed_id)
                
                # Remove empty feed subscriber set
                if not self.feed_subscribers[feed_id]:
                    del self.feed_subscribers[feed_id]
            
            # Only notify client if they're still connected
            if client_id in self.clients:
                try:
                    await self.clients[client_id].send(json.dumps({
                        "type": MessageType.UNSUBSCRIPTION_CONFIRMED.value,
                        "feed_id": feed_id
                    }))
                except Exception as e:
                    # Client might have disconnected during this operation
                    self.logger.warning(f"Failed to send unsubscription confirmation to client {client_id}: {e}")
            
            self.logger.info(f"Client {client_id} unsubscribed from feed {feed_id}")

    async def handle_client_disconnect(self, client_id: str) -> None:
        """
        Handle a client disconnection, cleaning up all subscriptions.
        
        Args:
            client_id: The unique ID of the client that disconnected
        """
        # Remove client from clients dictionary if present
        if client_id in self.clients:
            del self.clients[client_id]
        
        # Clean up feed subscribers directly
        if client_id in self.client_subscriptions:
            # Get all subscriptions for this client
            subscriptions_to_remove = list(self.client_subscriptions[client_id])
            
            # For each subscription, clean up the feed subscribers and data sources
            for subscription in subscriptions_to_remove:
                feed_id = subscription.feed_id
                
                # Remove client from feed subscribers
                if feed_id in self.feed_subscribers and client_id in self.feed_subscribers[feed_id]:
                    self.feed_subscribers[feed_id].remove(client_id)
                    
                    # If no more clients are subscribed to this feed, unsubscribe from Pyth
                    if not self.feed_subscribers[feed_id] and feed_id in self.active_pyth_feeds:
                        self.active_pyth_feeds.remove(feed_id)
                        try:
                            await self.pyth_client.unsubscribe_from_feed(feed_id)
                        except Exception as e:
                            self.logger.error(f"Error unsubscribing from Pyth feed {feed_id}: {e}")
                    
                    # Remove empty feed subscriber set
                    if not self.feed_subscribers[feed_id]:
                        del self.feed_subscribers[feed_id]
            
            # Remove client from client_subscriptions
            del self.client_subscriptions[client_id]
            
        self.logger.info(f"Cleaned up resources for client {client_id}")

    async def handle_pyth_price_update(self, price_data: PythPriceData) -> None:
        """
        Handle a price update from Pyth and forward to clients.
        
        Args:
            price_data: The price data received from Pyth
        """
        feed_id = price_data.id
        
        # Store the latest Pyth data
        self.latest_pyth_data[feed_id] = price_data
        
        # Check if any clients are subscribed to this feed
        if feed_id in self.feed_subscribers and self.feed_subscribers[feed_id]:
            # Create price update message
            update_json = json.dumps({
                "type": MessageType.PRICE_UPDATE.value,
                "data": price_data.model_dump(mode="json")
            })
            
            # Send to all subscribed clients
            send_tasks = []
            for client_id in self.feed_subscribers[feed_id]:
                if client_id in self.clients:
                    send_tasks.append(self.send_to_client(client_id, update_json))
            
            # Send messages in parallel
            if send_tasks:
                await asyncio.gather(*send_tasks, return_exceptions=True)

    async def send_to_client(self, client_id: str, message: str) -> None:
        """
        Send a message to a specific client, handling any errors.
        
        Args:
            client_id: The unique ID of the client
            message: The message to send
        """
        # Skip if client not in our active clients
        if client_id not in self.clients:
            return
            
        try:
            await self.clients[client_id].send(message)
        except ConnectionClosed:
            # Handle case where client disconnected but we haven't processed it yet
            self.logger.info(f"Client {client_id} connection closed, cleaning up")
            try:
                await self.handle_client_disconnect(client_id)
            except Exception as e:
                self.logger.error(f"Error during client disconnect cleanup: {e}")
                # Make sure client is removed even if cleanup fails
                if client_id in self.clients:
                    del self.clients[client_id]
        except Exception as e:
            self.logger.error(f"Error sending message to client {client_id}: {e}")
            # The connection might be broken in unexpected ways
            try:
                await self.handle_client_disconnect(client_id)
            except Exception as cleanup_error:
                self.logger.error(f"Error during cleanup after send failure: {cleanup_error}")
                # Make sure client is removed even if cleanup fails
                if client_id in self.clients:
                    del self.clients[client_id]

    async def send_available_feeds(self, client_id: str) -> None:
        """
        Send a list of available price feeds to a client.
        
        Args:
            client_id: The unique ID of the client
        """
        try:
            pyth_feeds = await self.pyth_client.get_available_price_feeds()
            
            await self.clients[client_id].send(json.dumps({
                "type": "available_feeds",
                "feeds": pyth_feeds
            }))
            
        except Exception as e:
            self.logger.error(f"Error retrieving available feeds for client {client_id}: {e}")
            await self.clients[client_id].send(json.dumps({
                "type": "error",
                "message": "Failed to retrieve available feeds"
            }))