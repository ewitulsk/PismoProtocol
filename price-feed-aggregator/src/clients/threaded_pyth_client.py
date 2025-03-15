import asyncio
import logging
import threading
import time
from typing import Dict, List, Set, Optional, Callable, Any

from src.clients.pyth_client import PythHermesClient
from src.models.price_feed_models import PythPriceData
from src.utils.constants import PRICE_FEEDS

class ThreadedPythClient:
    """
    Client that runs Pyth price feed subscriptions in a separate thread.
    This allows the main application to continue running while price feeds are being processed.
    """

    def __init__(
        self,
        hermes_sse_url: str = "https://hermes.pyth.network/v2/updates/price/stream",
        price_service_url: str = "https://hermes.pyth.network/v2",
        reconnect_delay: int = 5,
        auto_subscribe_feeds: Dict[str, str] = None
    ) -> None:
        self.logger = logging.getLogger("threaded_pyth_client")
        self.hermes_sse_url = hermes_sse_url
        self.price_service_url = price_service_url
        self.reconnect_delay = reconnect_delay
        self.auto_subscribe_feeds = auto_subscribe_feeds or {}
        
        # Internal state
        self._thread: Optional[threading.Thread] = None
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None
        self._pyth_client: Optional[PythHermesClient] = None
        self._running = False
        self._shutdown_event = threading.Event()
        
        # Callback management
        self._callbacks: List[Callable[[PythPriceData], None]] = []
        self._callback_lock = threading.Lock()
        
        # Track subscribed feeds
        self.subscribed_feeds: Set[str] = set()

    def start(self) -> None:
        """
        Start the threaded Pyth client.
        This creates a new thread that runs the Pyth client's event loop.
        """
        if self._running:
            return
            
        self._running = True
        self._shutdown_event.clear()
        
        # Create and start the thread
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()
        
        self.logger.info("ThreadedPythClient started")
        
    def stop(self) -> None:
        """
        Stop the threaded Pyth client.
        This signals the thread to shut down and waits for it to complete.
        """
        if not self._running:
            return
            
        self._running = False
        self._shutdown_event.set()
        
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5.0)
            
        self.logger.info("ThreadedPythClient stopped")
        
    def _run_event_loop(self) -> None:
        """
        Main function that runs in the separate thread.
        Creates and runs an event loop for the Pyth client.
        """
        try:
            # Create a new event loop for this thread
            self._event_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._event_loop)
            
            # Run the async client in this event loop
            self._event_loop.run_until_complete(self._run_pyth_client())
            
        except Exception as e:
            self.logger.error(f"Error in Pyth client thread: {e}")
        finally:
            # Clean up the event loop
            if self._event_loop:
                self._event_loop.close()
                self._event_loop = None
                
            self.logger.info("Pyth client thread terminated")
            
    async def _run_pyth_client(self) -> None:
        """
        Async function that runs the Pyth client.
        Handles initialization, auto-subscription, and shutdown.
        """
        try:
            # Create and start the Pyth client
            self._pyth_client = PythHermesClient(
                hermes_sse_url=self.hermes_sse_url,
                price_service_url=self.price_service_url,
                reconnect_delay=self.reconnect_delay
            )
            
            # Register our price callback
            self._pyth_client.register_price_callback(self._handle_price_update)
            
            # Start the client
            await self._pyth_client.start()
            
            # Auto-subscribe to feeds if configured
            await self._auto_subscribe()
            
            # Wait for shutdown event
            while not self._shutdown_event.is_set():
                await asyncio.sleep(0.1)
                
        except Exception as e:
            self.logger.error(f"Error running Pyth client: {e}")
        finally:
            # Clean up the Pyth client
            if self._pyth_client:
                await self._pyth_client.stop()
                self._pyth_client = None
                
    async def _auto_subscribe(self) -> None:
        """
        Subscribe to pre-configured feeds automatically on startup.
        """
        if not self._pyth_client or not self.auto_subscribe_feeds:
            return
            
        self.logger.info(f"Auto-subscribing to {len(self.auto_subscribe_feeds)} Pyth feeds")
        
        for symbol, feed_id in self.auto_subscribe_feeds.items():
            try:
                self.logger.info(f"Auto-subscribing to {symbol} feed ({feed_id})")
                await self._pyth_client.subscribe_to_feed(feed_id)
                self.subscribed_feeds.add(feed_id)
            except Exception as e:
                self.logger.error(f"Error auto-subscribing to feed {symbol} ({feed_id}): {e}")
                
    async def _handle_price_update(self, price_data: PythPriceData) -> None:
        """
        Handle a price update from the Pyth client.
        This forwards the update to all registered callbacks.
        """
        # Execute all callbacks with the price data
        with self._callback_lock:
            for callback in self._callbacks:
                try:
                    callback(price_data)
                except Exception as e:
                    self.logger.error(f"Error in price callback: {e}")
                    
    def register_price_callback(self, callback: Callable[[PythPriceData], None]) -> None:
        """
        Register a callback function to be called when price updates are received.
        
        Args:
            callback: A function that takes a PythPriceData object as input.
        """
        with self._callback_lock:
            self._callbacks.append(callback)
            
    def subscribe_to_feed(self, feed_id: str) -> None:
        """
        Subscribe to a specific price feed.
        
        Args:
            feed_id: Pyth feed ID to subscribe to
        """
        if not self._pyth_client or feed_id in self.subscribed_feeds:
            return
            
        if self._event_loop:
            # Create a future to run the subscription in the client's event loop
            future = asyncio.run_coroutine_threadsafe(
                self._pyth_client.subscribe_to_feed(feed_id),
                self._event_loop
            )
            # Wait for the subscription to complete
            future.result(timeout=5.0)
            self.subscribed_feeds.add(feed_id)
            
    def unsubscribe_from_feed(self, feed_id: str) -> None:
        """
        Unsubscribe from a specific price feed.
        
        Args:
            feed_id: Pyth feed ID to unsubscribe from
        """
        if not self._pyth_client or feed_id not in self.subscribed_feeds:
            return
            
        if self._event_loop:
            # Create a future to run the unsubscription in the client's event loop
            future = asyncio.run_coroutine_threadsafe(
                self._pyth_client.unsubscribe_from_feed(feed_id),
                self._event_loop
            )
            # Wait for the unsubscription to complete
            future.result(timeout=5.0)
            self.subscribed_feeds.discard(feed_id)
            
    def get_available_price_feeds(self) -> List[Dict[str, Any]]:
        """
        Get a list of available price feeds from the Pyth Network.
        Executed synchronously, blocking until result is available.
        
        Returns:
            List of feed information with IDs, symbols, and other metadata.
        """
        if not self._pyth_client or not self._event_loop:
            return []
            
        # Run the async call in the event loop and wait for result
        future = asyncio.run_coroutine_threadsafe(
            self._pyth_client.get_available_price_feeds(),
            self._event_loop
        )
        
        try:
            # Wait for the result with a timeout
            return future.result(timeout=10.0)
        except Exception as e:
            self.logger.error(f"Error getting available price feeds: {e}")
            return []