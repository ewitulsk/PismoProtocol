import asyncio
import json
import logging
from typing import Dict, List, Optional, Set, Callable, Any, Awaitable
from datetime import datetime

import aiohttp
from aiohttp import ClientSession

from src.models.price_feed_models import PythPriceData, PriceStatus


class PythHermesClient:
    """
    Client for connecting to the Pyth Network's Hermes service using Server-Sent Events (SSE).
    This client handles subscription to price feeds and processes incoming data.
    """

    def __init__(
        self,
        hermes_sse_url: str = "https://hermes.pyth.network/v2/updates/price/stream",
        price_service_url: str = "https://hermes.pyth.network/v2",
        reconnect_delay: int = 5,
    ) -> None:
        self.hermes_sse_url: str = hermes_sse_url
        self.price_service_url: str = price_service_url
        self.reconnect_delay: int = reconnect_delay
        self.session: Optional[ClientSession] = None
        self.sse_response: Optional[aiohttp.ClientResponse] = None
        self.subscribed_feeds: Set[str] = set()
        self.price_callbacks: List[Callable[[PythPriceData], Awaitable[None]]] = []
        self.is_running: bool = False
        self.logger = logging.getLogger("pyth_client")

    async def start(self) -> None:
        """
        Start the Pyth client but don't establish an SSE connection yet.
        The connection will be established when subscribe_to_feed is called.
        """
        if self.is_running:
            return

        self.is_running = True
        self.session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False))
        # Connection will be established on demand when feeds are subscribed

    async def stop(self) -> None:
        """Stop the Pyth client and close all connections."""
        self.is_running = False
        
        if self.sse_response:
            self.sse_response.close()
            self.sse_response = None
            
        if self.session:
            await self.session.close()
            self.session = None
            
        self.subscribed_feeds = set()

    async def _connect_sse(self) -> None:
        """Establish an SSE connection to the Hermes service."""
        # Don't even try to connect if there are no feed subscriptions
        if not self.subscribed_feeds:
            self.logger.info("No subscribed feeds, skipping SSE connection")
            return
            
        while self.is_running:
            try:
                # Check again if we still have subscriptions (might have changed while waiting)
                if not self.subscribed_feeds:
                    self.logger.info("No more subscribed feeds, stopping SSE connection")
                    break
                    
                if not self.session:
                    self.session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False))
                
                # Build the URL with query parameters for subscribed feeds
                url = self._build_sse_url()
                
                self.logger.info(f"Connecting to Pyth Hermes SSE at {url}")
                self.sse_response = await self.session.get(
                    url,
                    headers={"Accept": "text/event-stream"},
                    timeout=aiohttp.ClientTimeout(total=None),  # No timeout for streaming connection
                )
                
                if self.sse_response.status != 200:
                    error_text = await self.sse_response.text()
                    self.logger.error(f"Failed to connect to SSE: {self.sse_response.status}, {error_text}")
                    self.sse_response.close()
                    self.sse_response = None
                    
                    # Before retrying, check if we still have subscriptions
                    if not self.subscribed_feeds:
                        self.logger.info("No more subscribed feeds, stopping SSE connection attempts")
                        break
                        
                    await asyncio.sleep(self.reconnect_delay)
                    continue
                
                self.logger.info("Connected to Pyth Hermes SSE stream")
                
                await self._listen_for_sse_events()
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"SSE connection error: {e}")
                if self.sse_response:
                    self.sse_response.close()
                    self.sse_response = None
                
                # Before retrying, check if we still have subscriptions
                if not self.subscribed_feeds:
                    self.logger.info("No more subscribed feeds, stopping SSE connection attempts")
                    break
                    
                await asyncio.sleep(self.reconnect_delay)
    
    def _build_sse_url(self) -> str:
        """Build the SSE URL with query parameters for subscribed feeds."""
        base_url = self.hermes_sse_url
        
        # If we have no subscribed feeds, we shouldn't connect at all
        # But if the code gets here anyway, make sure we provide at least one ID parameter
        # to avoid the "missing field `ids`" error
        if not self.subscribed_feeds:
            self.logger.warning("Attempting to build SSE URL with no subscribed feeds")
            return f"{base_url}?ids[]=dummy-id-for-empty-subscription"
        
        # Add feed IDs as query parameters
        query_params = []
        for feed_id in self.subscribed_feeds:
            query_params.append(f"ids[]={feed_id}")
        
        url = f"{base_url}?{'&'.join(query_params)}"
        return url

    async def _listen_for_sse_events(self) -> None:
        """Listen for Server-Sent Events from the Hermes stream."""
        if not self.sse_response:
            return
            
        try:
            # Read the SSE stream line by line
            async for line_bytes in self.sse_response.content:
                line = line_bytes.decode('utf-8').strip()
                
                # SSE format: lines starting with "data:" contain the event data
                if line.startswith('data:'):
                    data = line[5:].strip()  # Remove "data:" prefix
                    await self._process_message(data)
                    
        except Exception as e:
            self.logger.error(f"Error while processing SSE events: {e}")
        finally:
            # Reconnect if disconnected and still running
            if self.is_running:
                asyncio.create_task(self._connect_sse())

    async def _process_message(self, message_data: str) -> None:
        """Process incoming message from the Hermes SSE stream."""
        try:
            # Parse JSON from SSE data payload
            message = json.loads(message_data)
            
            # SSE from Hermes has a different format - it has binary and parsed sections
            if "parsed" in message:
                parsed_feeds = message.get("parsed", [])
                processed_count = 0
                
                for feed_data in parsed_feeds:
                    feed_id = feed_data.get("id")
                    
                    if feed_id and feed_id in self.subscribed_feeds:
                        # Create price data object from the feed data
                        price_obj = self._parse_price_data(feed_data)
                        processed_count += 1
                        
                        # Notify all registered callbacks
                        await asyncio.gather(
                            *[callback(price_obj) for callback in self.price_callbacks],
                            return_exceptions=True
                        )
                
                # Log every 100 messages or when the batch is small for debugging
                if processed_count > 0 and (processed_count < 5 or processed_count % 100 == 0):
                    self.logger.debug(f"Processed {processed_count} price updates from batch of {len(parsed_feeds)} feeds")
                    
        except json.JSONDecodeError:
            self.logger.error(f"Invalid JSON received: {message_data[:100]}...")
        except Exception as e:
            self.logger.error(f"Error processing message: {e}")

    def _parse_price_data(self, data: Dict[str, Any]) -> PythPriceData:
        """Parse raw price data from Pyth into our internal model."""
        # Check if we have a nested price structure or flat structure
        has_nested_price = isinstance(data.get("price"), dict)
        
        # Get values based on the structure
        if has_nested_price:
            # Nested structure (typical for SSE format)
            price_data = data.get("price", {})
            status_str = data.get("status", "unknown")
            price_value = price_data.get("price", 0)
            conf_value = price_data.get("conf", 0)
            expo_value = price_data.get("expo", 0)
            publish_time_value = price_data.get("publish_time", 0)
            
            # Handle EMA values
            ema_data = data.get("ema_price", {})
            ema_price_value = ema_data.get("price") if ema_data else None
            ema_conf_value = ema_data.get("conf") if ema_data else None
        else:
            # Flat structure (legacy format)
            price_value = data.get("price", 0)
            conf_value = data.get("conf", 0)
            expo_value = data.get("expo", 0)
            status_str = data.get("status", "unknown")
            publish_time_value = data.get("publish_time", 0)
            
            # Handle EMA values directly
            ema_price_value = data.get("ema_price")
            ema_conf_value = data.get("ema_conf")
        
        # Convert status string to enum
        status = PriceStatus.UNKNOWN
        if status_str == "trading":
            status = PriceStatus.TRADING
        elif status_str == "halted":
            status = PriceStatus.HALTED
        elif status_str == "auction":
            status = PriceStatus.AUCTION
            
        # Convert timestamp to datetime
        publish_time = datetime.fromtimestamp(publish_time_value)
        
        # Safely convert numeric values
        price = float(price_value) if price_value is not None else 0
        conf = float(conf_value) if conf_value is not None else 0
        expo = int(expo_value) if expo_value is not None else 0
        ema_price = float(ema_price_value) if ema_price_value is not None else None
        ema_conf = float(ema_conf_value) if ema_conf_value is not None else None
        
        return PythPriceData(
            id=data.get("id", ""),
            price=price,
            conf=conf,
            expo=expo,
            publish_time=publish_time,
            status=status,
            ema_price=ema_price,
            ema_conf=ema_conf,
            raw_price_data=data,
        )

    async def subscribe_to_feeds(self, feed_ids: List[str]) -> None:
        """
        Subscribe to multiple price feeds at once.
        More efficient than subscribing to feeds one by one.
        
        Args:
            feed_ids: List of Pyth feed IDs to subscribe to
        """
        if not feed_ids:
            return
            
        # Add all feeds to our subscription list
        new_feeds = False
        for feed_id in feed_ids:
            if feed_id not in self.subscribed_feeds:
                self.subscribed_feeds.add(feed_id)
                new_feeds = True
                
        if not new_feeds:
            # We're already subscribed to all these feeds
            return
            
        self.logger.info(f"Added {len(feed_ids)} feeds to subscribed price feeds")
        
        # If we don't have an active connection, start one
        if not self.sse_response:
            # Start a connection with all feeds
            asyncio.create_task(self._connect_sse())
        else:
            # Close current connection to force reconnect with the complete feed list
            self.sse_response.close()
            self.sse_response = None
            
            # Reconnect with the complete subscription list
            asyncio.create_task(self._connect_sse())
    
    async def subscribe_to_feed(self, feed_id: str) -> None:
        """Subscribe to a specific price feed."""
        # Check if we're already subscribed
        if feed_id in self.subscribed_feeds:
            return
            
        # Add to our subscription list
        self.subscribed_feeds.add(feed_id)
        self.logger.info(f"Added {feed_id} to subscribed price feeds")
        
        # If this is the first feed subscription, start the connection
        if len(self.subscribed_feeds) == 1 and not self.sse_response:
            asyncio.create_task(self._connect_sse())
        # For SSE, we need to reconnect with the updated feed list if already connected
        elif self.sse_response:
            # Close current connection to force reconnect with new feed list
            self.sse_response.close()
            self.sse_response = None
            
            # Reconnect with the new subscription list
            asyncio.create_task(self._connect_sse())

    async def unsubscribe_from_feed(self, feed_id: str) -> None:
        """Unsubscribe from a specific price feed."""
        if feed_id not in self.subscribed_feeds:
            return
            
        # Remove from our subscription list
        self.subscribed_feeds.remove(feed_id)
        self.logger.info(f"Removed {feed_id} from subscribed price feeds")
        
        # Check if we have any remaining subscriptions
        if not self.subscribed_feeds:
            self.logger.info("No more subscribed feeds, closing the Pyth SSE connection")
            # Close the SSE connection and don't reconnect
            if self.sse_response:
                self.sse_response.close()
                self.sse_response = None
            # No need to reconnect since we don't have any subscriptions
            return
            
        # If we still have subscriptions, reconnect with the updated feed list
        if self.sse_response:
            # Close current connection to force reconnect with new feed list
            self.sse_response.close()
            self.sse_response = None
            
            # Reconnect with the remaining feeds
            asyncio.create_task(self._connect_sse())

    async def get_available_price_feeds(self) -> List[Dict[str, Any]]:
        """
        Retrieve a list of available price feeds from the Hermes REST API.
        
        Returns:
            List of feed information with IDs, symbols, and other metadata.
        """
        if not self.session:
            self.session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False))
            
        try:
            response = await self.session.get(f"{self.price_service_url}/feeds")
            if response.status == 200:
                feeds_data = await response.json()
                await response.release()
                # Explicitly cast to the correct return type
                feeds: List[Dict[str, Any]] = feeds_data
                return feeds
            else:
                error_text = await response.text()
                await response.release()
                self.logger.error(f"Failed to get price feeds: {error_text}")
                return []
        except Exception as e:
            self.logger.error(f"Error retrieving price feeds: {e}")
            return []

    def register_price_callback(
        self, callback: Callable[[PythPriceData], Awaitable[None]]
    ) -> None:
        """
        Register a callback function that will be called when price updates are received.
        
        Args:
            callback: An async function that takes a PythPriceData object as input.
        """
        self.price_callbacks.append(callback)