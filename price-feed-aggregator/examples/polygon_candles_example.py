#!/usr/bin/env python3
"""
Example client for accessing Polygon-only candle data from the price feed aggregator service.
This client demonstrates how to subscribe to Polygon candlestick data without requiring Pyth data.
"""

import asyncio
import json
import logging
import websockets
import sys
from datetime import datetime
from typing import Dict, List, Optional, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("polygon_candles_client")

# Websocket server URL (adjust as needed)
WS_SERVER_URL = "ws://localhost:8765"  # Default URL for local server

# Available crypto tickers (adjust based on your needs)
AVAILABLE_TICKERS = [
    "X:BTCUSD",
    "X:ETHUSD",
    "X:SOLUSD",
    "X:AVAXUSD",
    "X:MATICUSD",
]

class PolygonCandlesClient:
    """Client for subscribing to and receiving Polygon candlestick data."""
    
    def __init__(self, server_url: str) -> None:
        self.server_url = server_url
        self.websocket = None
        self.subscribed_tickers = set()
        self.candlestick_data = {}  # Store historical candles by ticker
        self.running = False
        
    async def connect(self) -> None:
        """Connect to the websocket server."""
        try:
            self.websocket = await websockets.connect(self.server_url)
            self.running = True
            logger.info(f"Connected to server at {self.server_url}")
            
            # Start message handler
            asyncio.create_task(self.handle_messages())
            
        except Exception as e:
            logger.error(f"Error connecting to server: {e}")
            self.running = False
            
    async def disconnect(self) -> None:
        """Disconnect from the websocket server."""
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
            self.running = False
            logger.info("Disconnected from server")
            
    async def subscribe_to_ticker(self, ticker: str) -> None:
        """
        Subscribe to Polygon candle data for a specific ticker.
        
        Args:
            ticker: The Polygon ticker to subscribe to (e.g., "X:BTCUSD")
        """
        if not self.websocket or not self.running:
            logger.error("Cannot subscribe: Not connected to server")
            return
            
        try:
            # Send subscription message
            subscription_message = {
                "type": "subscribe",
                "subscription_type": "polygon_only",
                "ticker": ticker,
                "timespan": "minute"  # Default to minute bars
            }
            
            await self.websocket.send(json.dumps(subscription_message))
            logger.info(f"Sent subscription request for {ticker}")
            
            # Add to our local tracking
            self.subscribed_tickers.add(ticker)
            
        except Exception as e:
            logger.error(f"Error subscribing to {ticker}: {e}")
            
    async def unsubscribe_from_ticker(self, ticker: str) -> None:
        """
        Unsubscribe from Polygon candle data for a specific ticker.
        
        Args:
            ticker: The Polygon ticker to unsubscribe from (e.g., "X:BTCUSD")
        """
        if not self.websocket or not self.running:
            logger.error("Cannot unsubscribe: Not connected to server")
            return
            
        try:
            # Send unsubscription message
            unsubscription_message = {
                "type": "unsubscribe",
                "subscription_type": "polygon_only",
                "ticker": ticker
            }
            
            await self.websocket.send(json.dumps(unsubscription_message))
            logger.info(f"Sent unsubscription request for {ticker}")
            
            # Remove from our local tracking
            self.subscribed_tickers.discard(ticker)
            
        except Exception as e:
            logger.error(f"Error unsubscribing from {ticker}: {e}")
            
    async def get_available_tickers(self) -> List[Dict[str, Any]]:
        """Get a list of available Polygon tickers from the server."""
        if not self.websocket or not self.running:
            logger.error("Cannot get tickers: Not connected to server")
            return []
            
        try:
            # Request available tickers
            request_message = {
                "type": "get_available_polygon_tickers"
            }
            
            await self.websocket.send(json.dumps(request_message))
            logger.info("Requested available Polygon tickers")
            
            # Wait for response (in a real implementation, you'd handle this more elegantly)
            response = await asyncio.wait_for(self.websocket.recv(), timeout=5)
            response_data = json.loads(response)
            
            if response_data.get("type") == "available_polygon_tickers":
                return response_data.get("tickers", [])
            else:
                logger.error(f"Unexpected response: {response_data}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting available tickers: {e}")
            return []
            
    async def handle_messages(self) -> None:
        """Handle incoming websocket messages."""
        if not self.websocket:
            return
            
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    message_type = data.get("type", "")
                    
                    if message_type == "polygon_candle_update":
                        candle_data = data.get("data", {})
                        ticker = candle_data.get("ticker")
                        
                        if ticker:
                            # Store or update candle data
                            if ticker not in self.candlestick_data:
                                self.candlestick_data[ticker] = []
                            
                            # Add to our historical data (in a real implementation, you might want to limit this)
                            self.candlestick_data[ticker].append(candle_data)
                            
                            # Display the update
                            timestamp = candle_data.get("timestamp", "")
                            symbol = candle_data.get("symbol", ticker)
                            open_price = candle_data.get("open", 0)
                            high_price = candle_data.get("high", 0)
                            low_price = candle_data.get("low", 0)
                            close_price = candle_data.get("close", 0)
                            
                            logger.info(f"Received candle for {symbol}: Open={open_price}, High={high_price}, Low={low_price}, Close={close_price}, Time={timestamp}")
                            
                    elif message_type == "subscription_confirmed":
                        subscription_type = data.get("subscription_type")
                        ticker = data.get("ticker")
                        
                        if subscription_type == "polygon_only" and ticker:
                            logger.info(f"Subscription confirmed for {ticker}")
                            
                    elif message_type == "unsubscription_confirmed":
                        subscription_type = data.get("subscription_type")
                        ticker = data.get("ticker")
                        
                        if subscription_type == "polygon_only" and ticker:
                            logger.info(f"Unsubscription confirmed for {ticker}")
                            
                    elif message_type == "error":
                        logger.error(f"Server error: {data.get('message', 'Unknown error')}")
                        
                    elif message_type == "connection_established":
                        client_id = data.get("client_id", "unknown")
                        logger.info(f"Connection established, client ID: {client_id}")
                        
                    else:
                        logger.debug(f"Received message of type {message_type}")
                        
                except json.JSONDecodeError:
                    logger.error(f"Received invalid JSON: {message[:100]}...")
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket connection closed")
            self.running = False
        except Exception as e:
            logger.error(f"Error in message handler: {e}")
            self.running = False

async def main() -> None:
    """Main function demonstrating the Polygon Candles client."""
    # Connect to server
    client = PolygonCandlesClient(WS_SERVER_URL)
    await client.connect()
    
    try:
        # Subscribe to a few tickers
        for ticker in AVAILABLE_TICKERS[:2]:  # Just subscribe to the first two
            await client.subscribe_to_ticker(ticker)
            
        # Keep the connection alive to receive candle updates
        while client.running:
            await asyncio.sleep(1)
            
    except KeyboardInterrupt:
        logger.info("User interrupted, shutting down")
    finally:
        # Clean up
        for ticker in list(client.subscribed_tickers):
            await client.unsubscribe_from_ticker(ticker)
            
        await client.disconnect()

if __name__ == "__main__":
    # Run the example
    asyncio.run(main())