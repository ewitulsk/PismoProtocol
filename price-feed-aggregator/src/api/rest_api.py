import logging
from typing import Dict, List, Any, Optional, Callable

from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel

from src.clients.pyth_client import PythHermesClient
from src.clients.polygon_client import PolygonStreamClient


class FeedListResponse(BaseModel):
    """Response model for listing available feeds."""
    feeds: List[Dict[str, Any]]


class PolygonTickerResponse(BaseModel):
    """Response model for listing available Polygon tickers."""
    tickers: List[Dict[str, Any]]


class StatusResponse(BaseModel):
    """Response model for status information."""
    status: str
    active_feeds: int
    active_polygon_tickers: int
    connected_clients: int


class PriceFeedAPI:
    """
    REST API for the Price Feed Aggregator.
    Provides endpoints for retrieving available feeds and status information.
    """
    
    def __init__(
        self,
        pyth_client: PythHermesClient,
        polygon_client: Optional[PolygonStreamClient] = None,
        websocket_server_status: Callable[[], Dict[str, Any]] = None,
    ) -> None:
        """
        Initialize the REST API.
        
        Args:
            pyth_client: The Pyth client for retrieving feed information
            polygon_client: Optional Polygon client for retrieving ticker information
            websocket_server_status: Callable that returns websocket server status info
        """
        self.logger = logging.getLogger("price_feed_api")
        self.pyth_client = pyth_client
        self.polygon_client = polygon_client
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
            "/polygon/tickers",
            response_model=PolygonTickerResponse,
            summary="Get available Polygon tickers",
            description="Returns a list of all available Polygon.io tickers for cryptocurrency data.",
        )
        async def get_polygon_tickers() -> PolygonTickerResponse:
            """
            Get a list of all available Polygon tickers.
            """
            if not self.polygon_client:
                raise HTTPException(
                    status_code=503,
                    detail="Polygon client is not available",
                )
                
            try:
                # In a real implementation, you might fetch this from Polygon API
                # For now, we'll return a predefined list of common crypto tickers
                common_tickers = [
                    {"ticker": "X:BTCUSD", "name": "Bitcoin/USD", "symbol": "BTC/USD"},
                    {"ticker": "X:ETHUSD", "name": "Ethereum/USD", "symbol": "ETH/USD"},
                    {"ticker": "X:SOLUSD", "name": "Solana/USD", "symbol": "SOL/USD"},
                    {"ticker": "X:DOTUSD", "name": "Polkadot/USD", "symbol": "DOT/USD"},
                    {"ticker": "X:AVAXUSD", "name": "Avalanche/USD", "symbol": "AVAX/USD"},
                    {"ticker": "X:NEARUSD", "name": "NEAR Protocol/USD", "symbol": "NEAR/USD"},
                    {"ticker": "X:MATICUSD", "name": "Polygon/USD", "symbol": "MATIC/USD"},
                ]
                
                return PolygonTickerResponse(tickers=common_tickers)
            except Exception as e:
                self.logger.error(f"Error retrieving Polygon tickers: {e}")
                raise HTTPException(
                    status_code=500,
                    detail="Failed to retrieve available Polygon tickers",
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
                if self.get_websocket_status:
                    status_info = self.get_websocket_status()
                    return StatusResponse(
                        status="running",
                        active_feeds=status_info.get("active_feeds", 0),
                        active_polygon_tickers=status_info.get("active_polygon_tickers", 0),
                        connected_clients=status_info.get("connected_clients", 0),
                    )
                else:
                    return StatusResponse(
                        status="running",
                        active_feeds=0,
                        active_polygon_tickers=0,
                        connected_clients=0,
                    )
            except Exception as e:
                self.logger.error(f"Error retrieving status: {e}")
                raise HTTPException(
                    status_code=500,
                    detail="Failed to retrieve status information",
                )