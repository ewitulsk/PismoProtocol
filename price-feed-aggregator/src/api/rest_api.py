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
    REST API for the Pyth Price Feed Service.
    Provides endpoints for retrieving available feeds and status information.
    """
    
    def __init__(
        self,
        pyth_client: PythHermesClient,
        websocket_server_status: Callable[[], Dict[str, Any]] = None,
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
            title="Pyth Price Feed API",
            description="API for the Pyth Price Feed service",
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
            summary="Get service status",
            description="Returns the current status of the price feed service.",
        )
        async def get_status() -> StatusResponse:
            """
            Get the current status of the price feed service.
            """
            try:
                if self.get_websocket_status:
                    status_info = self.get_websocket_status()
                    return StatusResponse(
                        status="running",
                        active_feeds=status_info.get("active_feeds", 0),
                        connected_clients=status_info.get("connected_clients", 0),
                    )
                else:
                    return StatusResponse(
                        status="running",
                        active_feeds=0,
                        connected_clients=0,
                    )
            except Exception as e:
                self.logger.error(f"Error retrieving status: {e}")
                raise HTTPException(
                    status_code=500,
                    detail="Failed to retrieve status information",
                )