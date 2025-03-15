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
from src.services.ohlc import OHLCService
from src.models.price_feed_models import (
    PythPriceData,
    FeedSubscription,
    OHLCSubscription,
    OHLCBar,
    TimeInterval,
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


class OHLCSubscriptionInfo(NamedTuple):
    """Represents an OHLC subscription for a client."""
    feed_id: str                      # Pyth feed ID
    intervals: Tuple[TimeInterval, ...] # Time intervals as a tuple (hashable)


class PriceFeedWebsocketServer:
    """
    Websocket server that allows clients to connect and subscribe to Pyth price feeds.
    It forwards price updates from Pyth to subscribed clients and supports OHLC bars.
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
        
        # OHLC-specific variables
        self.ohlc_service = OHLCService()
        self.ohlc_subscriptions: Dict[str, Set[OHLCSubscriptionInfo]] = {}  # client_id -> set of subscriptions
        
        # Track active price feeds
        self.active_pyth_feeds: Set[str] = set()
        
        # Cache to store last received data
        self.latest_pyth_data: Dict[str, PythPriceData] = {}
        
        # Feed symbol mappings (for nicer display names)
        self.feed_symbols: Dict[str, str] = {}  # feed_id -> symbol name
        
        # Server instance
        self.server: Optional[WebSocketServer] = None

    async def start(self) -> None:
        """Start the websocket server and register callbacks for Pyth."""
        # Register callback for Pyth price updates
        # Check if register_price_callback is a coroutine function or a regular method
        if asyncio.iscoroutinefunction(self.pyth_client.register_price_callback):
            await self.pyth_client.register_price_callback(self.handle_pyth_price_update)
        else:
            self.pyth_client.register_price_callback(self.handle_pyth_price_update)
        
        # Register OHLC bar update callback
        self.ohlc_service.register_callback(self.handle_ohlc_bar_update)
        
        # Start the OHLC service
        await self.ohlc_service.start()
        
        # Start the websocket server
        self.server = await websockets.server.serve(
            self.handle_client_connection,
            self.host,
            self.port,
            # Set ping_interval and ping_timeout to keep connections alive
            ping_interval=30,  # Send ping every 30 seconds
            ping_timeout=10,   # Wait 10 seconds for pong response
        )
        
        # Subscribe to all available Pyth price feeds at startup
        await self.subscribe_to_all_pyth_feeds()
        
        self.logger.info(f"Websocket server started on ws://{self.host}:{self.port}")
        
    async def subscribe_to_all_pyth_feeds(self) -> None:
        """Subscribe to all available Pyth price feeds to build historical data."""
        self.logger.info("Subscribing to all available Pyth price feeds...")
        
        # Get list of available price feeds
        try:
            # Fetch available feeds from Pyth
            available_feeds = await self.pyth_client.get_available_price_feeds()
            feed_count = len(available_feeds)
            self.logger.info(f"Found {feed_count} available Pyth price feeds")
            
            # If we can't get feeds from Pyth, use a fallback list of known popular feeds
            if not available_feeds:
                self.logger.warning("No feeds received from Pyth API, using fallback list of common feeds")
                # Define a set of common crypto feeds
                fallback_feeds = [
                    {"id": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", "symbol": "BTC/USD"},  # BTC/USD
                    {"id": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", "symbol": "ETH/USD"},  # ETH/USD
                    {"id": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", "symbol": "SOL/USD"},  # SOL/USD
                ]
                available_feeds = fallback_feeds
                feed_count = len(fallback_feeds)
                self.logger.info(f"Using {feed_count} fallback feeds")
            
            # First collect all feed IDs and symbols
            feeds_to_subscribe = []
            for feed in available_feeds:
                feed_id = feed.get("id")
                symbol = feed.get("symbol", "")
                
                if feed_id:
                    # Clean the feed ID
                    feed_id = sanitize_feed_id(feed_id)
                    
                    # Store symbol mapping
                    if symbol:
                        self.feed_symbols[feed_id] = symbol
                    
                    # Add to our active feeds set
                    self.active_pyth_feeds.add(feed_id)
                    
                    # Add to list for batch subscription
                    feeds_to_subscribe.append((feed_id, symbol))
                    
                    # Log each feed we're subscribing to
                    self.logger.info(f"Adding feed to subscription: {symbol or 'Unknown'} ({feed_id})")
            
            # Set up a single SSE connection with all feeds
            # This is more efficient than subscribing to each feed individually
            if feeds_to_subscribe:
                # Create a list of feed IDs for subscription
                feed_ids = [feed_id for feed_id, _ in feeds_to_subscribe]
                
                # Subscribe to all feeds in a single connection
                # This avoids multiple reconnections
                self.logger.info(f"Subscribing to {len(feed_ids)} feeds: {feed_ids[:3]}... (and more)")
                await self.pyth_client.subscribe_to_feeds(feed_ids)
                
                self.logger.info(f"Successfully subscribed to {len(feeds_to_subscribe)} Pyth feeds in a single connection")
                
                # Wait for a short time to allow initial data to come in
                self.logger.info(f"Waiting for initial price data...")
                await asyncio.sleep(5)
                
                # Log the number of feeds with actual price data
                price_data_count = len(self.latest_pyth_data)
                self.logger.info(f"Received initial price data for {price_data_count} feeds")
                
                # Log the specific feeds we've received data for
                if price_data_count > 0:
                    received_feeds = list(self.latest_pyth_data.keys())
                    self.logger.info(f"Received data for feeds: {received_feeds[:min(5, len(received_feeds))]}")
                else:
                    self.logger.warning("No price data received for any feeds during startup")
            
            self.logger.info(f"Finished subscribing to {feed_count} Pyth feeds")
        except Exception as e:
            self.logger.error(f"Error subscribing to Pyth feeds: {e}")
            # Continue despite errors, we'll try again when clients connect

    async def stop(self) -> None:
        """Stop the websocket server."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None
            
        # Stop the OHLC service
        await self.ohlc_service.stop()
            
        # Clear client data
        self.clients = {}
        self.client_subscriptions = {}
        self.feed_subscribers = {}
        self.ohlc_subscriptions = {}
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
                
                # Check if this is an OHLC subscription
                is_ohlc = data.get("ohlc", False)
                
                if is_ohlc:
                    # OHLC subscription
                    intervals_str = data.get("intervals", ["1m"])
                    if isinstance(intervals_str, str):
                        intervals_str = [intervals_str]
                        
                    # Convert string interval names to TimeInterval enum values
                    intervals = []
                    for interval_str in intervals_str:
                        try:
                            # Match the interval string to an enum value
                            found = False
                            for interval in TimeInterval:
                                if interval.value == interval_str:
                                    intervals.append(interval)
                                    found = True
                                    break
                            
                            if not found:
                                self.logger.warning(f"Invalid interval: {interval_str}, ignoring")
                        except Exception as e:
                            self.logger.error(f"Error parsing interval: {interval_str}: {e}")
                    
                    if not intervals:
                        # Default to 1-minute interval if none were valid
                        intervals = [TimeInterval.ONE_MINUTE]
                        
                    # Get symbol for this feed if available
                    symbol = data.get("symbol")
                    if symbol:
                        self.feed_symbols[feed_id] = symbol
                        
                    # Subscribe to OHLC bars
                    await self.subscribe_client_to_ohlc(client_id, feed_id, intervals)
                else:
                    # Regular price feed subscription
                    subscription = FeedSubscriptionInfo(feed_id=feed_id)
                    await self.subscribe_client_to_feed(client_id, subscription)
                    
            elif message_type == "unsubscribe":
                # Handle unsubscription request
                feed_id = data.get("feed_id")
                
                if not feed_id:
                    await self.clients[client_id].send(json.dumps({
                        "type": "error",
                        "message": "Feed ID is required for unsubscribe"
                    }))
                    return
                
                # Sanitize feed ID by removing 0x prefix if present
                feed_id = sanitize_feed_id(feed_id)
                
                # Check if this is an OHLC unsubscription
                is_ohlc = data.get("ohlc", False)
                
                if is_ohlc:
                    # OHLC unsubscription
                    intervals_str = data.get("intervals")
                    
                    if intervals_str:
                        if isinstance(intervals_str, str):
                            intervals_str = [intervals_str]
                            
                        # Convert string interval names to TimeInterval enum values
                        intervals = []
                        for interval_str in intervals_str:
                            try:
                                for interval in TimeInterval:
                                    if interval.value == interval_str:
                                        intervals.append(interval)
                                        break
                            except Exception:
                                pass
                        
                        await self.unsubscribe_client_from_ohlc(client_id, feed_id, intervals)
                    else:
                        # Unsubscribe from all intervals
                        await self.unsubscribe_client_from_ohlc(client_id, feed_id)
                else:
                    # Regular feed unsubscription
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
                        
                        # Check if this is an OHLC subscription
                        is_ohlc = sub_data.get("ohlc", False)
                        
                        if is_ohlc:
                            # OHLC subscription
                            intervals_str = sub_data.get("intervals", ["1m"])
                            if isinstance(intervals_str, str):
                                intervals_str = [intervals_str]
                                
                            # Convert string interval names to TimeInterval enum values
                            intervals = []
                            for interval_str in intervals_str:
                                try:
                                    for interval in TimeInterval:
                                        if interval.value == interval_str:
                                            intervals.append(interval)
                                            break
                                except Exception:
                                    pass
                            
                            if not intervals:
                                # Default to 1-minute interval if none were valid
                                intervals = [TimeInterval.ONE_MINUTE]
                                
                            # Get symbol for this feed if available
                            symbol = sub_data.get("symbol")
                            if symbol:
                                self.feed_symbols[feed_id] = symbol
                                
                            # Subscribe to OHLC bars
                            await self.subscribe_client_to_ohlc(client_id, feed_id, intervals)
                        else:
                            # Regular price feed subscription
                            subscription = FeedSubscriptionInfo(feed_id=feed_id)
                            await self.subscribe_client_to_feed(client_id, subscription)
                
            elif message_type == "get_available_feeds":
                # Handle request for available feeds
                await self.send_available_feeds(client_id)
                
            # Removed get_ohlc_history message handling
                
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
            
            # We should already be subscribed to the Pyth feed from startup
            # Just store the symbol if it's provided and we don't already have it
            if feed_id not in self.feed_symbols:
                symbol = None
                for sub in self.client_subscriptions[client_id]:
                    if hasattr(sub, 'symbol') and sub.symbol:
                        symbol = sub.symbol
                        self.feed_symbols[feed_id] = symbol
                        break
            
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
                
                # Keep the feed subscription active with Pyth even if no clients are subscribed
                # This allows us to maintain historical data
                
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
            
            # For each subscription, clean up the feed subscribers, but keep Pyth feeds active
            for subscription in subscriptions_to_remove:
                feed_id = subscription.feed_id
                
                # Remove client from feed subscribers
                if feed_id in self.feed_subscribers and client_id in self.feed_subscribers[feed_id]:
                    self.feed_subscribers[feed_id].remove(client_id)
                    
                    # Keep all Pyth feed subscriptions active even when clients disconnect
                    # This ensures we maintain historical data for all feeds
                    
                    # Remove empty feed subscriber set
                    if not self.feed_subscribers[feed_id]:
                        del self.feed_subscribers[feed_id]
            
            # Remove client from client_subscriptions
            del self.client_subscriptions[client_id]
            
        self.logger.info(f"Cleaned up resources for client {client_id}")

    async def subscribe_client_to_ohlc(self, client_id: str, feed_id: str, intervals: List[TimeInterval]) -> None:
        """
        Subscribe a client to OHLC bars for a specific feed and intervals.
        
        Args:
            client_id: The unique ID of the client
            feed_id: Pyth feed ID
            intervals: List of time intervals to subscribe to
        """
        # Check if we have price data for this feed
        has_price_data = feed_id in self.latest_pyth_data
        if has_price_data:
            self.logger.info(f"Feed {feed_id} has price data in the cache")
        else:
            self.logger.warning(f"Feed {feed_id} does not have any price data in the cache yet")
        
        # Check if feed is in active feeds and subscribe if not
        is_active = feed_id in self.active_pyth_feeds
        self.logger.info(f"Feed {feed_id} is {'active' if is_active else 'not active'} in Pyth subscriptions")
        
        # If feed is not active, subscribe to it now
        if not is_active:
            self.logger.info(f"Subscribing to feed {feed_id} now")
            self.active_pyth_feeds.add(feed_id)
            await self.pyth_client.subscribe_to_feed(feed_id)
            
            # Wait a moment for the first price update to come in
            self.logger.info(f"Waiting for initial price data from feed {feed_id}...")
            await asyncio.sleep(1)
            
            # Check if we received data
            if feed_id in self.latest_pyth_data:
                self.logger.info(f"Successfully received initial price data for feed {feed_id}")
            else:
                self.logger.warning(f"No initial price data received yet for feed {feed_id}")
        
        # Initialize client's OHLC subscriptions if not already
        if client_id not in self.ohlc_subscriptions:
            self.ohlc_subscriptions[client_id] = set()
            
        # Create and add the subscription (convert list to tuple for hashability)
        subscription = OHLCSubscriptionInfo(feed_id=feed_id, intervals=tuple(intervals))
        self.ohlc_subscriptions[client_id].add(subscription)
        
        # Add client to the raw price feed subscribers list without reconnecting Pyth
        regular_sub = FeedSubscriptionInfo(feed_id=feed_id)
        if client_id not in self.client_subscriptions:
            self.client_subscriptions[client_id] = set()
        
        self.client_subscriptions[client_id].add(regular_sub)
        
        # Add client to feed subscribers
        if feed_id not in self.feed_subscribers:
            self.feed_subscribers[feed_id] = set()
        self.feed_subscribers[feed_id].add(client_id)
        
        # Get symbol for this feed if we have it
        symbol = self.feed_symbols.get(feed_id, feed_id)
        
        # Check the OHLC service for existing bars for this feed
        for interval in intervals:
            # Directly access the bars without adding a subscription yet
            interval_bars = []
            if feed_id in self.ohlc_service.bars and interval in self.ohlc_service.bars[feed_id]:
                interval_bars = self.ohlc_service.bars[feed_id][interval]
                self.logger.info(f"OHLC service has {len(interval_bars)} bars for feed {feed_id}, interval {interval.value}")
            else:
                self.logger.warning(f"OHLC service has no bars for feed {feed_id}, interval {interval.value}")
                
                # If we have price data but no bars, trigger a bar creation now
                if feed_id in self.latest_pyth_data:
                    price_data = self.latest_pyth_data[feed_id]
                    self.logger.info(f"Triggering immediate bar creation for feed {feed_id} using latest price")
                    # Update OHLC service with the latest price data to create initial bar
                    await self.ohlc_service.update_price(price_data, symbol)
        
        # Subscribe to OHLC bars in the OHLC service
        await self.ohlc_service.subscribe(client_id, feed_id, intervals)
        
        # Fetch historical bars for each interval (limit to 100 by default)
        historical_bars_by_interval = {}
        for interval in intervals:
            bars = await self.ohlc_service.get_latest_bars(feed_id, interval, 100)
            historical_bars_by_interval[interval.value] = [bar.model_dump(mode="json") for bar in bars]
        
        # Log the number of historical bars we're sending
        for interval, bars in historical_bars_by_interval.items():
            self.logger.info(f"Sending {len(bars)} historical bars for {feed_id}, interval {interval} to client {client_id}")
            
            if not bars:
                # If we still don't have any bars, but we have price data, create a bar immediately
                if feed_id in self.latest_pyth_data:
                    price_data = self.latest_pyth_data[feed_id]
                    price = price_data.price * (10 ** price_data.expo)
                    
                    self.logger.info(f"Creating a first bar now using current price {price} for feed {feed_id}")
                    
                    # Create a bar with current time
                    current_time = datetime.now()
                    interval_obj = next((i for i in intervals if i.value == interval), None)
                    
                    if interval_obj:
                        # Create normalized timestamp for the interval
                        normalized_time = self.ohlc_service._normalize_time(current_time, interval_obj)
                        
                        # Create a new bar
                        new_bar = OHLCBar(
                            feed_id=feed_id,
                            symbol=symbol,
                            interval=interval_obj,
                            timestamp=normalized_time,
                            open=price,
                            high=price,
                            low=price,
                            close=price,
                            confirmed=False
                        )
                        
                        # Add to historical data response
                        historical_bars_by_interval[interval] = [new_bar.model_dump(mode="json")]
                        
                        # Log the action
                        self.logger.info(f"Created and added initial bar for {feed_id}, interval {interval}")
                        
                        # Add to OHLC service (this is a bit of a hack, but ensures consistency)
                        if feed_id not in self.ohlc_service.bars:
                            self.ohlc_service.bars[feed_id] = defaultdict(list)
                        self.ohlc_service.bars[feed_id][interval_obj].append(new_bar)
        
        # Notify the client with subscription confirmation and historical bars
        await self.clients[client_id].send(json.dumps({
            "type": "subscription_confirmed",
            "ohlc": True,
            "feed_id": feed_id,
            "symbol": symbol,
            "intervals": [interval.value for interval in intervals],
            "historical_data": historical_bars_by_interval
        }))
        
        self.logger.info(f"Client {client_id} subscribed to OHLC bars for feed {feed_id} with intervals {[i.value for i in intervals]}")
    
    async def unsubscribe_client_from_ohlc(self, client_id: str, feed_id: str, intervals: List[TimeInterval] = None) -> None:
        """
        Unsubscribe a client from OHLC bars.
        
        Args:
            client_id: The unique ID of the client
            feed_id: Pyth feed ID
            intervals: Optional list of time intervals to unsubscribe from (if None, unsubscribe from all intervals)
        """
        if client_id not in self.ohlc_subscriptions:
            return
            
        # Find the subscription for this feed
        existing_sub = None
        for sub in self.ohlc_subscriptions[client_id]:
            if sub.feed_id == feed_id:
                existing_sub = sub
                break
                
        if not existing_sub:
            return
            
        # Remove the subscription
        self.ohlc_subscriptions[client_id].remove(existing_sub)
        
        # Unsubscribe from the OHLC service
        await self.ohlc_service.unsubscribe(client_id, feed_id, intervals)
        
        # Notify the client
        await self.clients[client_id].send(json.dumps({
            "type": "unsubscription_confirmed",
            "ohlc": True,
            "feed_id": feed_id,
            "intervals": [interval.value for interval in (intervals or [])]
        }))
        
        self.logger.info(f"Client {client_id} unsubscribed from OHLC bars for feed {feed_id}")
        
        # Clean up empty sets
        if not self.ohlc_subscriptions[client_id]:
            del self.ohlc_subscriptions[client_id]
    
    async def handle_ohlc_bar_update(self, bar: OHLCBar, event_type: str, subscribers: Set[str], history_message=None) -> None:
        """
        Handle an OHLC bar update and forward to subscribed clients.
        
        Args:
            bar: The updated or new OHLC bar
            event_type: Type of event ("bar_update" or "new_bar")
            subscribers: Set of client IDs to notify
            history_message: Deprecated and unused
        """
        # Create the update message
        update_json = json.dumps({
            "type": event_type,
            "data": bar.model_dump(mode="json")
        })
        
        # Send to all subscribed clients
        send_tasks = []
        for client_id in subscribers:
            if client_id in self.clients:
                send_tasks.append(self.send_to_client(client_id, update_json))
        
        # Send messages in parallel
        if send_tasks:
            await asyncio.gather(*send_tasks, return_exceptions=True)
            
    async def handle_pyth_price_update(self, price_data: PythPriceData) -> None:
        """
        Handle a price update from Pyth and forward to clients.
        
        Args:
            price_data: The price data received from Pyth
        """
        feed_id = price_data.id
        
        # Track if this is the first update for this feed
        is_first_update = feed_id not in self.latest_pyth_data
        
        # Store the latest Pyth data
        self.latest_pyth_data[feed_id] = price_data
        
        # Log the first few updates we receive for each feed
        # This helps us track when feeds start getting data
        price_count = len(self.latest_pyth_data)
        
        # For the first 10 feeds, log when we first get their data
        if is_first_update and price_count <= 10:
            price_value = price_data.price * (10 ** price_data.expo)
            self.logger.info(f"First price update for feed {feed_id}: ${price_value:.6f} (total feeds with data: {price_count})")
            
        # Update OHLC bars if applicable
        symbol = self.feed_symbols.get(feed_id, feed_id)
        
        # Check OHLC service's bar count before update
        before_bars_count = 0
        if feed_id in self.ohlc_service.bars:
            for interval, bars in self.ohlc_service.bars[feed_id].items():
                before_bars_count += len(bars)
                
        # Update OHLC bars with the price data
        await self.ohlc_service.update_price(price_data, symbol)
        
        # Check if we created any new bars (only log for a low number of feeds to avoid excessive logging)
        if price_count <= 10:
            after_bars_count = 0
            if feed_id in self.ohlc_service.bars:
                for interval, bars in self.ohlc_service.bars[feed_id].items():
                    after_bars_count += len(bars)
                    
            if after_bars_count > before_bars_count:
                self.logger.info(f"Created {after_bars_count - before_bars_count} new OHLC bars for feed {feed_id}")
        
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