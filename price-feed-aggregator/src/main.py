import asyncio
import argparse
import logging
import signal
import threading
import os
import uvicorn
from pathlib import Path
from typing import Optional, Set, Dict, Any, cast
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from src.clients.pyth_client import PythHermesClient
from src.services.websocket_server import PriceFeedWebsocketServer
from src.api.rest_api import PriceFeedAPI
from src.utils.logging_config import setup_logging


class PythPriceFeedService:
    """
    Main application class that sets up and coordinates the Pyth price feed service.
    """
    
    def __init__(
        self,
        host: str = "localhost",
        port: int = 8765,
        api_host: str = "localhost",
        api_port: int = 8080,
        pyth_sse_url: str = "https://hermes.pyth.network/v2/updates/price/stream",
        log_level: int = logging.INFO,
    ) -> None:
        self.host = host
        self.port = port
        self.api_host = api_host
        self.api_port = api_port
        self.pyth_sse_url = pyth_sse_url
        self.log_level = log_level
        
        # Setup logging
        setup_logging(level=log_level)
        
        self.logger = logging.getLogger("pyth_price_feed_service")
        self.shutdown_event = asyncio.Event()
        
        # Initialize components
        self.pyth_client = PythHermesClient(hermes_sse_url=pyth_sse_url)
        
        self.websocket_server = PriceFeedWebsocketServer(
            pyth_client=self.pyth_client,
            host=host,
            port=port
        )
        
        self.rest_api = PriceFeedAPI(
            pyth_client=self.pyth_client,
            websocket_server_status=self.get_websocket_status,
        )
        
        # API server and thread
        self.api_process: Optional[threading.Thread] = None

    def get_websocket_status(self) -> Dict[str, Any]:
        """Get current status of the websocket server for API."""
        return {
            "active_feeds": len(self.websocket_server.active_pyth_feeds),
            "connected_clients": len(self.websocket_server.clients),
            "feed_subscribers": {feed_id: len(subscribers) for feed_id, subscribers in self.websocket_server.feed_subscribers.items()},
        }

    async def start(self) -> None:
        """Start all components of the price feed service."""
        self.logger.info("Starting Pyth Price Feed Service")
        
        # Initialize the Pyth client but don't start the connection yet
        await self.pyth_client.start()
        self.logger.info("Pyth client started (will connect when clients subscribe to feeds)")
        
        # Start websocket server
        await self.websocket_server.start()
        self.logger.info(f"Websocket server listening on ws://{self.host}:{self.port}")
        
        # Start REST API in a separate process
        # This is a non-blocking call that runs uvicorn in its own thread
        self.api_server = None  # Reset server if it exists
        self.api_process = threading.Thread(
            target=uvicorn.run,
            kwargs={
                "app": self.rest_api.app,
                "host": self.api_host,
                "port": self.api_port,
                "log_level": "info",
            },
            daemon=True,
        )
        self.api_process.start()
        self.logger.info(f"REST API started on http://{self.api_host}:{self.api_port}")
        
        # Wait for shutdown signal
        await self.shutdown_event.wait()

    async def stop(self) -> None:
        """Stop all components gracefully."""
        self.logger.info("Shutting down Pyth Price Feed Service")
        
        # Stop components in reverse order
        # Note: The API thread is a daemon thread so it will exit when the main process exits
        self.logger.info("REST API will shut down with the main process")
            
        await self.websocket_server.stop()
        self.logger.info("Websocket server stopped")
        
        await self.pyth_client.stop()
        self.logger.info("Pyth client stopped")
        
        self.shutdown_event.set()
        self.logger.info("Pyth Price Feed Service shutdown complete")

    def handle_shutdown(self) -> None:
        """Handle shutdown signals."""
        self.logger.info("Received shutdown signal")
        asyncio.create_task(self.stop())


async def main() -> None:
    """Main entry point for the price feed service."""
    parser = argparse.ArgumentParser(description="Pyth Price Feed Service")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind the websocket server to")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind the websocket server to")
    parser.add_argument("--api-host", default="0.0.0.0", help="Host to bind the REST API to")
    parser.add_argument("--api-port", type=int, default=8080, help="Port to bind the REST API to")
    parser.add_argument(
        "--pyth-sse-url", 
        default="https://hermes.pyth.network/v2/updates/price/stream", 
        help="Pyth Hermes SSE stream URL"
    )
    parser.add_argument(
        "--log-level", 
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Logging level"
    )
    
    args = parser.parse_args()
    
    # Convert string log level to numeric value
    log_level = getattr(logging, args.log_level)
    
    # Create and run the service
    service = PythPriceFeedService(
        host=args.host,
        port=args.port,
        api_host=args.api_host,
        api_port=args.api_port,
        pyth_sse_url=args.pyth_sse_url,
        log_level=log_level,
    )
    
    # Setup signal handlers
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, service.handle_shutdown)
    
    # Start the service
    await service.start()


def main_cli() -> None:
    """CLI entry point for the Pyth price feed service."""
    asyncio.run(main())


if __name__ == "__main__":
    main_cli()