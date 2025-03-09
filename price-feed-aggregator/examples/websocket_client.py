#!/usr/bin/env python3
"""
Example client that connects to the Price Feed Aggregator websocket server and
subscribes to BTC/USD and ETH/USD price feeds with both Pyth and Polygon data.

This client demonstrates how to:
1. Connect to the websocket server
2. Subscribe to price feeds with combined Pyth and Polygon data
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
from typing import Dict, Any, List, Optional, Tuple

# Add the parent directory to the Python path so we can import 'src'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger("websocket_client")


# Common feed subscriptions (Pyth feed ID, Polygon ticker)
COMMON_SUBSCRIPTIONS = {
    "BTC/USD": ("e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", "X:BTCUSD"),
    "ETH/USD": ("ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", "X:ETHUSD"),
    "SOL/USD": ("ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", "X:SOLUSD"),
}


async def subscribe_to_feed(websocket, feed_id: str, ticker: Optional[str] = None, timespan: str = "minute") -> None:
    """
    Subscribe to a price feed with optional Polygon ticker and timeframe.
    
    Args:
        websocket: The websocket connection
        feed_id: Pyth feed ID to subscribe to
        ticker: Optional Polygon ticker (e.g., "X:BTCUSD")
        timespan: Polygon timeframe (e.g., "minute", "hour", "day")
    """
    subscription = {
        "type": "subscribe",
        "feed_id": feed_id,
    }
    
    # Add Polygon parameters if provided
    if ticker:
        subscription["ticker"] = ticker
        subscription["timespan"] = timespan
    
    logger.info(f"Subscribing to feed: {feed_id}" + (f" with ticker {ticker}" if ticker else ""))
    await websocket.send(json.dumps(subscription))


async def subscribe_to_multiple_feeds(
    websocket, 
    subscriptions: List[Tuple[str, Optional[str], Optional[str]]]
) -> None:
    """
    Subscribe to multiple price feeds with their respective Polygon tickers.
    
    Args:
        websocket: The websocket connection
        subscriptions: List of tuples (feed_id, ticker, timespan)
    """
    subscription_data = []
    
    for feed_id, ticker, timespan in subscriptions:
        sub = {
            "feed_id": feed_id,
        }
        
        if ticker:
            sub["ticker"] = ticker
            sub["timespan"] = timespan or "minute"
            
        subscription_data.append(sub)
    
    feed_list = ", ".join([f"{sub['feed_id']}" + (f" ({sub.get('ticker', '')})" if "ticker" in sub else "") 
                           for sub in subscription_data])
    logger.info(f"Subscribing to multiple feeds: {feed_list}")
    
    await websocket.send(json.dumps({
        "type": "subscribe_multiple",
        "subscriptions": subscription_data,
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
    try:
        data = json.loads(message)
        message_type = data.get("type", "")
        
        if message_type == "connection_established":
            logger.info(f"Connected to server with client ID: {data.get('client_id')}")
            
        elif message_type == "subscription_confirmed":
            feed_id = data.get("feed_id", "Unknown")
            ticker = data.get("ticker")
            logger.info(f"Subscription confirmed for feed: {feed_id}" + 
                        (f" with ticker {ticker}" if ticker else ""))
            
        elif message_type == "unsubscription_confirmed":
            feed_id = data.get("feed_id", "Unknown")
            ticker = data.get("ticker")
            logger.info(f"Unsubscription confirmed for feed: {feed_id}" + 
                        (f" with ticker {ticker}" if ticker else ""))
            
        elif message_type == "available_feeds":
            feeds = data.get("feeds", [])
            logger.info(f"Available feeds ({len(feeds)}):")
            
            # Find feeds with Polygon data available
            feeds_with_polygon = [feed for feed in feeds if feed.get("has_polygon_data", False)]
            
            # First show feeds that have Polygon data
            if feeds_with_polygon:
                logger.info(f"Feeds with Polygon data available ({len(feeds_with_polygon)}):")
                for feed in feeds_with_polygon[:5]:
                    feed_id = feed.get("id", "Unknown")
                    symbol = feed.get("symbol", "Unknown")
                    ticker = feed.get("polygon_ticker", "Unknown")
                    logger.info(f"  - {symbol}: {feed_id} (Polygon ticker: {ticker})")
                
                if len(feeds_with_polygon) > 5:
                    logger.info(f"  - ... and {len(feeds_with_polygon) - 5} more")
            
            # Show a selection of other feeds
            logger.info(f"Other available feeds:")
            feeds_without_polygon = [feed for feed in feeds if not feed.get("has_polygon_data", False)]
            for feed in feeds_without_polygon[:5]:  # Show first 5 feeds
                feed_id = feed.get("id", "Unknown")
                symbol = feed.get("symbol", "Unknown")
                logger.info(f"  - {symbol}: {feed_id}")
                
            if len(feeds_without_polygon) > 5:
                logger.info(f"  - ... and {len(feeds_without_polygon) - 5} more")
            
        elif message_type == "price_update":
            price_data = data.get("data", {})
            symbol = price_data.get("symbol", "Unknown")
            price = price_data.get("price", 0)
            timestamp = price_data.get("timestamp", "")
            
            # Check if we have Pyth data
            pyth_data = price_data.get("pyth_data")
            
            # Check if we have Polygon data
            polygon_data = price_data.get("polygon_data")
            
            # Build log message
            log_parts = [f"Price update for {symbol}: ${price:.2f}"]
            
            if pyth_data:
                confidence = pyth_data.get("conf", 0) * (10 ** pyth_data.get("expo", 0))
                log_parts.append(f"Pyth confidence: ±${confidence:.2f}")
            
            if polygon_data:
                vwap = polygon_data.get("vwap")
                if vwap:
                    log_parts.append(f"Polygon VWAP: ${vwap:.2f}")
                volume = polygon_data.get("volume", 0)
                log_parts.append(f"Volume: {volume:.2f}")
            
            # Add source information
            source_priority = price_data.get("source_priority", "")
            if source_priority:
                log_parts.append(f"Priority source: {source_priority}")
            
            logger.info(" | ".join(log_parts))
            
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
    parser = argparse.ArgumentParser(description="Price Feed Aggregator Websocket Client")
    
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
        "--symbol",
        choices=list(COMMON_SUBSCRIPTIONS.keys()) + ["ALL"],
        default="BTC/USD",
        help="Symbol to subscribe to (e.g., BTC/USD, ETH/USD), or ALL for all"
    )
    
    parser.add_argument(
        "--pyth-only",
        action="store_true",
        help="Subscribe to Pyth data only (no Polygon)"
    )
    
    parser.add_argument(
        "--timespan",
        default="minute",
        choices=["minute", "hour", "day", "week", "month"],
        help="Polygon data timespan (only applicable if not using --pyth-only)"
    )
    
    args = parser.parse_args()
    server_url = f"ws://{args.host}:{args.port}"
    
    # Determine subscriptions based on args
    subscriptions = []
    if args.symbol == "ALL":
        for sym, (feed_id, ticker) in COMMON_SUBSCRIPTIONS.items():
            if args.pyth_only:
                subscriptions.append((feed_id, None, None))
            else:
                subscriptions.append((feed_id, ticker, args.timespan))
    else:
        feed_id, ticker = COMMON_SUBSCRIPTIONS.get(args.symbol, (None, None))
        if feed_id:
            if args.pyth_only:
                subscriptions.append((feed_id, None, None))
            else:
                subscriptions.append((feed_id, ticker, args.timespan))
    
    logger.info(f"Connecting to server at {server_url}")
    
    try:
        async with websockets.connect(server_url) as websocket:
            # First get available feeds
            await get_available_feeds(websocket)
            
            # Wait a bit to receive the available feeds response
            await asyncio.sleep(2)
            
            # Subscribe to specified feeds
            if len(subscriptions) == 1:
                await subscribe_to_feed(websocket, *subscriptions[0])
            elif subscriptions:
                await subscribe_to_multiple_feeds(websocket, subscriptions)
            else:
                logger.error("No valid subscriptions specified. Please check your arguments.")
                return
            
            # Process incoming messages
            async for message in websocket:
                await process_message(message)
                
    except ConnectionRefusedError:
        logger.error(f"Connection refused. Make sure the server is running at {server_url}")
    except Exception as e:
        logger.error(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())