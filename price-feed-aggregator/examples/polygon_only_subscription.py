#!/usr/bin/env python3
"""
Simple example client for using Polygon-only subscriptions from the price feed aggregator.
This client demonstrates how to receive pure candlestick data for charts without Pyth data.
"""

import asyncio
import json
import logging
import websockets
import sys
from datetime import datetime
from typing import Dict, List, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("polygon_client")

# Websocket server configuration
WS_SERVER = "localhost"
WS_PORT = 8765
WS_URL = f"ws://{WS_SERVER}:{WS_PORT}"

# Crypto tickers to subscribe to - default to BTC and ETH
DEFAULT_TICKERS = ["X:BTC-USD", "X:ETH-USD"]

async def polygon_only_client(tickers=None):
    """
    Simple client that subscribes to Polygon-only candlestick data.
    
    Args:
        tickers: List of Polygon tickers to subscribe to (default: BTC and ETH)
    """
    if tickers is None:
        tickers = DEFAULT_TICKERS
        
    logger.info(f"Connecting to websocket server at {WS_URL}")
    
    try:
        async with websockets.connect(WS_URL) as websocket:
            logger.info("Connected to websocket server")
            
            # Wait for connection established message
            response = await websocket.recv()
            data = json.loads(response)
            if data.get("type") == "connection_established":
                client_id = data.get("client_id")
                logger.info(f"Connection established with client ID: {client_id}")
            else:
                logger.warning(f"Unexpected initial message: {data}")
            
            # Subscribe to tickers with polygon_only subscription type
            for ticker in tickers:
                subscription = {
                    "type": "subscribe",
                    "subscription_type": "polygon_only",
                    "ticker": ticker,
                    "timespan": "minute"
                }
                
                logger.info(f"Subscribing to ticker: {ticker}")
                await websocket.send(json.dumps(subscription))
            
            # Handle incoming messages
            while True:
                try:
                    message = await websocket.recv()
                    data = json.loads(message)
                    message_type = data.get("type")
                    
                    if message_type == "subscription_confirmed":
                        if data.get("subscription_type") == "polygon_only":
                            logger.info(f"Successfully subscribed to {data.get('ticker')}")
                    
                    elif message_type == "polygon_candle_update":
                        candle = data.get("data", {})
                        symbol = candle.get("symbol", "Unknown")
                        timestamp = candle.get("timestamp", "Unknown")
                        open_price = candle.get("open", 0)
                        high = candle.get("high", 0)
                        low = candle.get("low", 0)
                        close = candle.get("close", 0)
                        volume = candle.get("volume", 0)

                        # This is where you would process candle data for your chart
                        logger.info(f"[{symbol}] OHLC: {open_price:.2f}/{high:.2f}/{low:.2f}/{close:.2f} Vol: {volume:.2f} Time: {timestamp}")
                    
                    elif message_type == "error":
                        logger.error(f"Server error: {data.get('message')}")
                        
                    else:
                        logger.debug(f"Received message: {message_type}")
                        
                except (websockets.exceptions.ConnectionClosed, 
                        websockets.exceptions.ConnectionClosedError):
                    logger.error("Connection closed")
                    break
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
    
    except Exception as e:
        logger.error(f"Error connecting to websocket server: {e}")
        
async def main():
    """Main function to run the example client."""
    # Get tickers from command line arguments or use defaults
    tickers = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_TICKERS
    
    logger.info(f"Starting Polygon-only subscription client for tickers: {', '.join(tickers)}")
    try:
        await polygon_only_client(tickers)
    except KeyboardInterrupt:
        logger.info("Client stopped by user")

if __name__ == "__main__":
    # Run the client
    asyncio.run(main())