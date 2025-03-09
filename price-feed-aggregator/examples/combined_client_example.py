#!/usr/bin/env python3
"""
Example client that connects to the Price Feed Aggregator websocket server and
subscribes to combined price data from both Pyth and Polygon.

This client demonstrates how to:
1. Connect to the websocket server
2. Subscribe to price feeds with both Pyth feed IDs and Polygon tickers
3. Process incoming aggregated price updates
"""

import os
import sys
import asyncio
import json
import websockets
import argparse
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

# Add the parent directory to the Python path so we can import 'src'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger("combined_client")


async def subscribe_to_combined_feed(websocket, pyth_feed_id: str, polygon_ticker: str, timespan: str = "minute") -> None:
    """
    Subscribe to a combined price feed with data from both Pyth and Polygon.
    
    Args:
        websocket: The websocket connection
        pyth_feed_id: The Pyth feed ID
        polygon_ticker: The Polygon ticker symbol
        timespan: The Polygon timeframe (e.g., minute, hour, day)
    """
    logger.info(f"Subscribing to combined feed: Pyth={pyth_feed_id}, Polygon={polygon_ticker}, Timespan={timespan}")
    
    await websocket.send(json.dumps({
        "type": "subscribe",
        "feed_id": pyth_feed_id,
        "ticker": polygon_ticker,
        "timespan": timespan
    }))


async def subscribe_to_multiple_feeds(websocket, subscriptions: List[Dict[str, str]]) -> None:
    """
    Subscribe to multiple combined feeds at once.
    
    Args:
        websocket: The websocket connection
        subscriptions: List of subscription details with feed_id, ticker, and timespan
    """
    logger.info(f"Subscribing to multiple feeds: {len(subscriptions)} feeds")
    
    await websocket.send(json.dumps({
        "type": "subscribe_multiple",
        "subscriptions": subscriptions
    }))


async def get_available_feeds(websocket) -> None:
    """
    Request available price feeds from the server.
    
    Args:
        websocket: The websocket connection
    """
    logger.info("Requesting available feeds...")
    await websocket.send(json.dumps({
        "type": "get_available_feeds",
    }))


async def process_message(message: str) -> None:
    """
    Process a message received from the server.
    
    Args:
        message: The message received from the server
    """

    # logger.info(message)

    try:
        data = json.loads(message)
        message_type = data.get("type", "")
        
        if message_type == "connection_established":
            logger.info(f"Connected to server with client ID: {data.get('client_id')}")
            
        elif message_type == "subscription_confirmed":
            logger.info(f"Subscription confirmed for feed: {data.get('feed_id')} with ticker: {data.get('ticker', 'N/A')}")
            
        elif message_type == "unsubscription_confirmed":
            logger.info(f"Unsubscription confirmed for feed: {data.get('feed_id')} with ticker: {data.get('ticker', 'N/A')}")
            
        elif message_type == "available_feeds":
            feeds = data.get("feeds", [])
            logger.info(f"Available feeds ({len(feeds)}):")
            
            for feed in feeds[:10]:  # Show first 10 feeds
                feed_id = feed.get("id", "Unknown")
                symbol = feed.get("symbol", "Unknown")
                polygon_ticker = feed.get("polygon_ticker", "Not available")
                
                if polygon_ticker != "Not available":
                    logger.info(f"  - {symbol}: {feed_id} (Polygon: {polygon_ticker})")
                else:
                    logger.info(f"  - {symbol}: {feed_id}")
                
            if len(feeds) > 10:
                logger.info(f"  - ... and {len(feeds) - 10} more")
            
        elif message_type == "price_update":
            update_data = data.get("data", {})
                        
            # Extract key information
            symbol = update_data.get("symbol", "Unknown")
            price = update_data.get("price", 0)
            timestamp = update_data.get("timestamp", "Unknown")
            
            # Check which data sources are available
            has_pyth = update_data.get("pyth_data") is not None
            has_polygon = update_data.get("polygon_data") is not None
            source_priority = update_data.get("source_priority", "Unknown")
            
            # Format the output based on available data
            sources_text = []
            if has_pyth:
                sources_text.append("Pyth")
            if has_polygon:
                sources_text.append("Polygon")
            
            sources_str = " + ".join(sources_text)
            
            logger.info(
                f"Price update for {symbol}: ${price:.2f} "
                f"[{sources_str}, priority: {source_priority}]"
            )
            
            # If we have Polygon data, show OHLC information
            if has_polygon:
                polygon_data = update_data.get("polygon_data", {})
                ohlc = (
                    f"O: ${polygon_data.get('open', 0):.2f}, "
                    f"H: ${polygon_data.get('high', 0):.2f}, "
                    f"L: ${polygon_data.get('low', 0):.2f}, "
                    f"C: ${polygon_data.get('close', 0):.2f}, "
                    f"V: {polygon_data.get('volume', 0):.2f}"
                )
                logger.info(f"  OHLCV: {ohlc}")
            
        elif message_type == "error":
            logger.error(f"Error from server: {data.get('message')}")
            
        else:
            logger.warning(f"Unknown message type: {message_type}")
            
    except json.JSONDecodeError:
        logger.error(f"Failed to parse message: {message[:100]}...")
    except Exception as e:
        logger.error(f"Error processing message: {e}")


async def main() -> None:
    """Main entry point for the example client."""
    parser = argparse.ArgumentParser(description="Combined Price Feed Aggregator Websocket Client")
    
    parser.add_argument(
        "--host", 
        default="localhost",
        help="Host to connect to"
    )
    
    parser.add_argument(
        "--port", 
        type=int, 
        default=8765,
        help="Port to connect to"
    )
    
    parser.add_argument(
        "--feed-ids",
        nargs="*",
        default=[],
        help="Pyth feed IDs to subscribe to"
    )
    
    parser.add_argument(
        "--tickers",
        nargs="*",
        default=[],
        help="Polygon tickers to subscribe to (should match with feed-ids)"
    )
    
    parser.add_argument(
        "--timespan",
        default="minute",
        choices=["minute", "hour", "day", "week", "month"],
        help="Polygon timeframe for bar data"
    )
    
    args = parser.parse_args()
    server_url = f"ws://{args.host}:{args.port}"
    feed_ids = args.feed_ids
    tickers = args.tickers
    timespan = args.timespan
    
    # Validate inputs
    if len(feed_ids) != len(tickers) and len(feed_ids) > 0 and len(tickers) > 0:
        logger.error("Number of feed IDs must match number of tickers")
        return
    
    logger.info(f"Connecting to server at {server_url}")
    
    try:
        # Connect with ping_interval and ping_timeout to match server settings
        async with websockets.connect(
            server_url,
            ping_interval=30,
            ping_timeout=10
        ) as websocket:
            # First, get available feeds
            await get_available_feeds(websocket)
            
            # Wait a bit to receive the available feeds response
            await asyncio.sleep(2)
            
            # If no feeds specified, use default examples
            if not feed_ids:
                logger.info("No feed IDs specified. Subscribing to default feeds...")
                
                # Default subscriptions for BTC and ETH
                subscriptions = [
                    # {
                    #     "feed_id": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",  # BTC/USD
                    #     "ticker": "X:BTC-USD",
                    #     "timespan": timespan
                    # },
                    {
                        "feed_id": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",  # ETH/USD
                        "ticker": "X:ETH-USD",
                        "timespan": timespan
                    }
                ]
                
                # Subscribe to all default feeds at once
                await subscribe_to_multiple_feeds(websocket, subscriptions)
            else:
                # Create subscriptions from provided arguments
                subscriptions = []
                
                # If only feed IDs are provided (no tickers), subscribe to Pyth only
                if feed_ids and not tickers:
                    for feed_id in feed_ids:
                        subscriptions.append({"feed_id": feed_id})
                else:
                    # Both feed IDs and tickers provided
                    for i in range(len(feed_ids)):
                        subscriptions.append({
                            "feed_id": feed_ids[i],
                            "ticker": tickers[i] if i < len(tickers) else None,
                            "timespan": timespan
                        })
                
                # Subscribe to all feeds at once
                await subscribe_to_multiple_feeds(websocket, subscriptions)
            
            # Process incoming messages
            async for message in websocket:
                await process_message(message)
                
    except ConnectionRefusedError:
        logger.error(f"Connection refused. Make sure the server is running at {server_url}")
    except Exception as e:
        logger.error(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())