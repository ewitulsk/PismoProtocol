#!/usr/bin/env python3
"""
Simple websocket client for interacting with the Pyth Price Feed service.

This is a more generic client that shows all incoming messages in raw format,
useful for debugging and exploring the API.

Usage:
  python websocket_client.py 
  python websocket_client.py --host <host> --port <port>
  python websocket_client.py --subscribe btc,eth,sol
  python websocket_client.py --feed-id <feed_id>
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

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger("websocket_client")

# Common Pyth Network price feed IDs for cryptocurrencies
PRICE_FEEDS = {
    "btc": "8dc863a70143ff4a1655a471a2b4a9d86697b07b4bd1e33e9ad66e851ba5e44b",  # BTC/USD
    "eth": "440f0b95ef4a8a04c312ccc604a8c7438b3903a804c5d6e5aed31e40d9c907e1",  # ETH/USD
    "sol": "72a929f5b0f2f4e775441d3d00e74fb5a66c78be46be322657c82418e3047395",  # SOL/USD
    "avax": "3bbad82dff4f218b458bbb24f15f7b7d80a4e4db6dacb8c22322650aeabbbd27", # AVAX/USD
    "bnb": "85520765cf1dbc6bb8ec15fe7a0a2a925d7a7c2dfa6a4aad5716567b8317e30a",  # BNB/USD 
}


async def subscribe_to_feed(websocket, feed_id: str) -> None:
    """
    Subscribe to a specific price feed.
    
    Args:
        websocket: The websocket connection
        feed_id: Pyth feed ID to subscribe to
    """
    # Remove 0x prefix if present
    if feed_id.startswith('0x'):
        feed_id = feed_id[2:]
        
    subscription = {
        "type": "subscribe",
        "feed_id": feed_id,
    }
    
    logger.info(f"Subscribing to feed: {feed_id}")
    await websocket.send(json.dumps(subscription))


async def subscribe_to_multiple_feeds(
    websocket, 
    feed_ids: List[str]
) -> None:
    """
    Subscribe to multiple price feeds.
    
    Args:
        websocket: The websocket connection
        feed_ids: List of feed IDs to subscribe to
    """
    subscription_data = []
    
    for feed_id in feed_ids:
        # Remove 0x prefix if present
        if feed_id.startswith('0x'):
            feed_id = feed_id[2:]
            
        subscription_data.append({"feed_id": feed_id})
    
    feed_list = ", ".join([sub["feed_id"] for sub in subscription_data])
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
            logger.info(f"Subscription confirmed for feed: {feed_id}")
            
        elif message_type == "unsubscription_confirmed":
            feed_id = data.get("feed_id", "Unknown")
            logger.info(f"Unsubscription confirmed for feed: {feed_id}")
            
        elif message_type == "available_feeds":
            feeds = data.get("feeds", [])
            logger.info(f"Available feeds ({len(feeds)}):")
            
            for feed in feeds[:10]:  # Show only the first 10 feeds
                feed_id = feed.get("id", "Unknown")
                symbol = feed.get("symbol", "Unknown")
                price = feed.get("price", 0)
                expo = feed.get("expo", 0)
                
                # Apply exponent to price
                if price and expo:
                    price_adjusted = price * (10 ** expo)
                    logger.info(f"  - {symbol}: {feed_id} (${price_adjusted:.6f})")
                else:
                    logger.info(f"  - {symbol}: {feed_id}")
                
            if len(feeds) > 10:
                logger.info(f"  - ... and {len(feeds) - 10} more")
            
        elif message_type == "price_update":
            price_data = data.get("data", {})
            feed_id = price_data.get("id", "Unknown")
            price = price_data.get("price", 0)
            expo = price_data.get("expo", 0)
            conf = price_data.get("conf", 0)
            status = price_data.get("status", "unknown")
            
            # Apply exponent to price and confidence
            price_adjusted = price * (10 ** expo) if price and expo else 0
            conf_adjusted = conf * (10 ** expo) if conf and expo else 0
            
            # Try to find a friendly symbol
            symbol = next((k for k, v in PRICE_FEEDS.items() if v == feed_id), "unknown")
            
            # Format the message
            now = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            logger.info(f"[{now}] Price update for {symbol.upper()} (${price_adjusted:.6f} ±${conf_adjusted:.6f}) - Status: {status}")
            
        elif message_type == "error":
            logger.error(f"Error from server: {data.get('message')}")
            
        else:
            # For any other message type, just dump the raw JSON
            logger.info(f"Received ({message_type}): {json.dumps(data, indent=2)}")
            
    except json.JSONDecodeError:
        logger.error(f"Failed to parse message: {message[:100]}...")
    except Exception as e:
        logger.error(f"Error processing message: {e}")


async def main() -> None:
    """Main entry point for the generic client."""
    parser = argparse.ArgumentParser(description="Pyth Price Feed Websocket Client")
    
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
        "--feed-id", 
        help="Specific feed ID to subscribe to"
    )
    
    parser.add_argument(
        "--subscribe",
        help="Comma-separated list of feed symbols to subscribe to (e.g., btc,eth,sol)"
    )
    
    parser.add_argument(
        "--list-only",
        action="store_true",
        help="Only list available feeds without subscribing"
    )
    
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging"
    )
    
    args = parser.parse_args()
    
    # Set debug logging if requested
    if args.debug:
        logger.setLevel(logging.DEBUG)
    
    server_url = f"ws://{args.host}:{args.port}"
    
    # Determine subscriptions based on args
    feed_ids = []
    
    if args.feed_id:
        feed_ids.append(args.feed_id)
    elif args.subscribe:
        symbols = [s.strip().lower() for s in args.subscribe.split(",")]
        for symbol in symbols:
            if symbol in PRICE_FEEDS:
                feed_ids.append(PRICE_FEEDS[symbol])
            else:
                logger.warning(f"Unknown symbol: {symbol}")
    
    logger.info(f"Connecting to server at {server_url}")
    
    try:
        # Connect with ping_interval and ping_timeout settings
        async with websockets.connect(
            server_url,
            ping_interval=30,
            ping_timeout=10
        ) as websocket:
            # First get available feeds
            await get_available_feeds(websocket)
            
            # Wait a bit to receive the available feeds response
            await asyncio.sleep(1)
            
            # Exit if we only want to list feeds
            if args.list_only:
                logger.info("List-only mode, not subscribing to any feeds")
            # Subscribe to specified feeds if any
            elif feed_ids:
                if len(feed_ids) == 1:
                    await subscribe_to_feed(websocket, feed_ids[0])
                else:
                    await subscribe_to_multiple_feeds(websocket, feed_ids)
            # Default: subscribe to BTC/USD
            else:
                logger.info("No feeds specified, subscribing to BTC/USD by default")
                await subscribe_to_feed(websocket, PRICE_FEEDS["btc"])
            
            # Process incoming messages
            async for message in websocket:
                await process_message(message)
                
    except ConnectionRefusedError:
        logger.error(f"Connection refused. Make sure the server is running at {server_url}")
    except Exception as e:
        logger.error(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())