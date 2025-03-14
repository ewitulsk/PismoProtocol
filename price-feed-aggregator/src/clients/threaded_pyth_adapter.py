import asyncio
import logging
from typing import Dict, List, Set, Callable, Any, Awaitable

from src.clients.threaded_pyth_client import ThreadedPythClient
from src.models.price_feed_models import PythPriceData

class ThreadedPythAdapter:
    """
    Adapter class that makes the ThreadedPythClient compatible with the async API
    expected by the websocket server and other components.
    """
    
    def __init__(self, threaded_client: ThreadedPythClient) -> None:
        self.logger = logging.getLogger("threaded_pyth_adapter")
        self.threaded_client = threaded_client
        self.price_callbacks: List[Callable[[PythPriceData], Awaitable[None]]] = []
        self._callback_lock = asyncio.Lock()  # Lock for thread-safe callback operations
        
    async def start(self) -> None:
        """Start the Pyth client adapter (and the underlying threaded client)."""
        self.threaded_client.register_price_callback(self._handle_price_update)
        self.threaded_client.start()
        
    async def stop(self) -> None:
        """Stop the Pyth client adapter (and the underlying threaded client)."""
        self.threaded_client.stop()
        
    def _handle_price_update(self, price_data: PythPriceData) -> None:
        """
        Handle a price update from the threaded client.
        This method is called in the threaded client's thread, so we need to
        dispatch the async callbacks to the event loop.
        """
        # Make a thread-safe copy of callbacks to prevent dictionary changing during iteration
        callbacks_snapshot = list(self.price_callbacks)
        
        # Process each callback with the price data
        for callback in callbacks_snapshot:
            asyncio.create_task(self._execute_callback(callback, price_data))
            
    async def _execute_callback(
        self, callback: Callable[[PythPriceData], Awaitable[None]], price_data: PythPriceData
    ) -> None:
        """Execute a single callback with error handling."""
        try:
            await callback(price_data)
        except Exception as e:
            self.logger.error(f"Error in price callback: {e}")
            
    async def subscribe_to_feed(self, feed_id: str) -> None:
        """Subscribe to a Pyth price feed."""
        self.threaded_client.subscribe_to_feed(feed_id)
        
    async def unsubscribe_from_feed(self, feed_id: str) -> None:
        """Unsubscribe from a Pyth price feed."""
        self.threaded_client.unsubscribe_from_feed(feed_id)
        
    async def get_available_price_feeds(self) -> List[Dict[str, Any]]:
        """Get a list of available price feeds from Pyth."""
        return self.threaded_client.get_available_price_feeds()
        
    async def register_price_callback(
        self, callback: Callable[[PythPriceData], Awaitable[None]]
    ) -> None:
        """Register a callback for price updates."""
        # Use the lock to safely modify the callbacks list
        async with self._callback_lock:
            self.price_callbacks.append(callback)