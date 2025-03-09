import logging
from typing import Dict, List, Any, Optional, Callable

from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel

from src.clients.pyth_client import PythHermesClient


class FeedListResponse(BaseModel):
    """Response model for listing available feeds."""
    feeds: List[Dict[str, Any]]


class StatusResponse(BaseModel):
    """Response model for status information."""
    status: str
    active_feeds: int
    connected_clients: int


class PriceFeedAPI:
    """
    REST API for the Price Feed Aggregator.
    Provides endpoints for retrieving available feeds and status information.
    """
    
    def __init__(
        self,
        pyth_client: PythHermesClient,
        websocket_server_status: Callable[[], Dict[str, Any]],
    ) -> None:
        """
        Initialize the REST API.
        
        Args:
            pyth_client: The Pyth client for retrieving feed information
            websocket_server_status: Callable that returns websocket server status info
        """
        self.logger = logging.getLogger("price_feed_api")
        self.pyth_client = pyth_client
        self.get_websocket_status = websocket_server_status
        
        # Create FastAPI application
        self.app = FastAPI(
            title="Price Feed Aggregator API",
            description="API for the Price Feed Aggregator service",
            version="1.0.0",
        )
        
        # Register routes
        self._register_routes()
        
    def _register_routes(self) -> None:
        """Register API routes."""
        
        @self.app.get("/health", status_code=200)
        async def health_check() -> Dict[str, str]:
            """Simple health check endpoint."""
            return {"status": "ok"}
        
        @self.app.get(
            "/feeds",
            response_model=FeedListResponse,
            summary="Get available price feeds",
            description="Returns a list of all available price feeds from Pyth Network.",
        )
        async def get_feeds() -> FeedListResponse:
            """
            Get a list of all available price feeds.
            """
            try:
                feeds = await self.pyth_client.get_available_price_feeds()
                return FeedListResponse(feeds=feeds)
            except Exception as e:
                self.logger.error(f"Error retrieving feeds: {e}")
                raise HTTPException(
                    status_code=500,
                    detail="Failed to retrieve available feeds",
                )
        
        @self.app.get(
            "/status",
            response_model=StatusResponse,
            summary="Get aggregator status",
            description="Returns the current status of the price feed aggregator.",
        )
        async def get_status() -> StatusResponse:
            """
            Get the current status of the price feed aggregator.
            """
            try:
                status_info = self.get_websocket_status()
                return StatusResponse(
                    status="running",
                    active_feeds=status_info.get("active_feeds", 0),
                    connected_clients=status_info.get("connected_clients", 0),
                )
            except Exception as e:
                self.logger.error(f"Error retrieving status: {e}")
                raise HTTPException(
                    status_code=500,
                    detail="Failed to retrieve status information",
                )