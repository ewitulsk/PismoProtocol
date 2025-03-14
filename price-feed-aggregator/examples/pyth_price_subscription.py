#!/usr/bin/env python3
"""
Example script demonstrating how to subscribe to Pyth price feeds.

This script connects to the Pyth Price Feed service websocket server
and subscribes to one or more price feeds. It then receives and
displays real-time price updates.

Usage:
  python pyth_price_subscription.py [feed_id]
  python pyth_price_subscription.py --multi btc,eth,sol
  python pyth_price_subscription.py --all
  python pyth_price_subscription.py --help
"""

import asyncio
import argparse
import json
import logging
import os
import sys
from datetime import datetime
from typing import Dict, Any, Optional, List, Set

import websockets
from websockets.client import WebSocketClientProtocol

# Add the parent directory to the path so we can import from src
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger('pyth_subscription')

# Common Pyth Network price feed IDs for cryptocurrencies
PRICE_FEEDS = {
    "btc": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",  # BTC/USD
}


async def get_available_feeds(websocket: WebSocketClientProtocol) -> List[Dict[str, Any]]:
    """
    Get a list of all available price feeds from the server.
    
    Args:
        websocket: The websocket connection
        
    Returns:
        List of available price feeds
    """
    request = {
        "type": "get_available_feeds"
    }
    await websocket.send(json.dumps(request))
    
    # Wait for response
    response = await websocket.recv()
    data = json.loads(response)
    
    if data.get("type") == "available_feeds":
        return data.get("feeds", [])
    return []


async def subscribe_to_price_feed(
    websocket: WebSocketClientProtocol,
    feed_id: str
) -> None:
    """
    Subscribe to a specific price feed.
    
    Args:
        websocket: The websocket connection
        feed_id: The feed ID to subscribe to
    """
    # Remove 0x prefix if present
    if feed_id.startswith('0x'):
        feed_id = feed_id[2:]
        
    # Create subscription message
    subscription_msg = {
        "type": "subscribe",
        "feed_id": feed_id
    }
    
    # Send subscription message
    await websocket.send(json.dumps(subscription_msg))
    logger.info(f"Sent subscription request for feed ID: {feed_id}")


async def subscribe_to_multiple_feeds(
    websocket: WebSocketClientProtocol,
    feed_ids: List[str]
) -> None:
    """
    Subscribe to multiple price feeds at once.
    
    Args:
        websocket: The websocket connection
        feed_ids: List of feed IDs to subscribe to
    """
    subscriptions = []
    for feed_id in feed_ids:
        # Remove 0x prefix if present
        if feed_id.startswith('0x'):
            feed_id = feed_id[2:]
        subscriptions.append({"feed_id": feed_id})
    
    # Create subscription message
    subscription_msg = {
        "type": "subscribe_multiple",
        "subscriptions": subscriptions
    }
    
    # Send subscription message
    await websocket.send(json.dumps(subscription_msg))
    logger.info(f"Sent subscription request for {len(feed_ids)} feeds")


async def handle_price_updates(
    websocket: WebSocketClientProtocol,
    max_updates: Optional[int] = None,
    timeout: float = 5.0,
    feed_filter: Optional[Set[str]] = None
) -> None:
    """
    Handle price updates from the websocket server.
    
    Args:
        websocket: The websocket connection
        max_updates: Maximum number of updates to process before exiting (None for unlimited)
        timeout: Timeout in seconds for waiting for updates
        feed_filter: Optional set of feed IDs to filter updates by
    """
    update_count = 0
    last_update_time = datetime.now()
    
    # Keep track of latest prices for summary
    latest_prices = {}
    subscription_confirmations = set()
    
    while True:
        # Set a timeout for receiving messages
        try:
            # Wait for a message with timeout
            message = await asyncio.wait_for(websocket.recv(), timeout=timeout)
            last_update_time = datetime.now()
            
            # Parse the message
            data = json.loads(message)
            message_type = data.get("type")
            
            # Handle different message types
            if message_type == "connection_established":
                client_id = data.get("client_id")
                logger.info(f"Connected to server with client ID: {client_id}")
                
            elif message_type == "subscription_confirmed":
                feed_id = data.get("feed_id")
                subscription_confirmations.add(feed_id)
                logger.info(f"Subscription confirmed for feed ID: {feed_id}")
                
            elif message_type == "price_update":
                # This is the Pyth price data
                price_data = data.get("data", {})
                feed_id = price_data.get("id")
                
                # Skip if we're filtering and this feed isn't in our filter
                if feed_filter and feed_id not in feed_filter:
                    continue
                
                price = price_data.get("price")
                expo = price_data.get("expo")
                conf = price_data.get("conf")
                status = price_data.get("status")
                publish_time = price_data.get("publish_time")
                
                # Apply exponent to price and confidence
                if price is not None and expo is not None:
                    actual_price = price * (10 ** expo)
                    actual_conf = conf * (10 ** expo) if conf is not None else None
                    
                    # Save latest price
                    latest_prices[feed_id] = {
                        "price": actual_price,
                        "confidence": actual_conf,
                        "status": status,
                        "time": publish_time
                    }
                    
                    # Print nicely formatted price update
                    symbol = next((k for k, v in PRICE_FEEDS.items() if v == feed_id), feed_id)
                    logger.info(f"PRICE UPDATE - {symbol.upper()}:")
                    logger.info(f"  Price: ${actual_price:.6f}")
                    if actual_conf:
                        logger.info(f"  Confidence: ±${actual_conf:.6f}")
                    logger.info(f"  Status: {status}")
                    logger.info(f"  Time: {datetime.now().strftime('%H:%M:%S.%f')[:-3]}")
                
                # Count the update
                update_count += 1
                if max_updates and update_count >= max_updates:
                    logger.info(f"Received {max_updates} updates, exiting")
                    
                    # Print summary of latest prices
                    if latest_prices:
                        logger.info("\nSUMMARY OF LATEST PRICES:")
                        for feed_id, price_info in latest_prices.items():
                            symbol = next((k for k, v in PRICE_FEEDS.items() if v == feed_id), feed_id)
                            logger.info(f"  {symbol.upper()}: ${price_info['price']:.6f} (±${price_info.get('confidence', 0):.6f})")
                    
                    break
                    
            elif message_type == "error":
                logger.error(f"Error from server: {data.get('message')}")
                
            else:
                logger.debug(f"Received message of type {message_type}: {data}")
                
        except asyncio.TimeoutError:
            # Check how long since the last update
            time_since_last = (datetime.now() - last_update_time).total_seconds()
            logger.warning(f"No updates received for {time_since_last:.1f} seconds")
            
            # Reconnect if no data for too long
            if time_since_last > timeout * 2:
                logger.error("Connection may be stale, exiting")
                break
                
        except websockets.ConnectionClosed:
            logger.error("Connection to server closed")
            break
            
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            break


async def run_client(args) -> None:
    """
    Run the websocket client with specified arguments.
    
    Args:
        args: Command line arguments
    """
    # Determine which feeds to subscribe to
    feed_ids = []
    feed_filter = None
    
    if args.all:
        # We'll get all available feeds from the server
        feed_ids = []
    elif args.multi:
        # Parse comma-separated list of feed symbols
        symbols = [s.strip().lower() for s in args.multi.split(",")]
        feed_ids = [PRICE_FEEDS.get(symbol) for symbol in symbols if symbol in PRICE_FEEDS]
        feed_filter = set(feed_ids)
    elif args.feed_id:
        # Single feed ID provided directly
        feed_ids = [args.feed_id]
        feed_filter = {args.feed_id}
    else:
        # Default to BTC/USD
        feed_ids = [PRICE_FEEDS["btc"]]
        feed_filter = {PRICE_FEEDS["btc"]}
    
    # Connect to the websocket server
    try:
        async with websockets.connect(args.server_url) as websocket:
            logger.info(f"Connected to {args.server_url}")
            
            if args.all:
                # Get all available feeds
                available_feeds = await get_available_feeds(websocket)
                feed_ids = [feed["id"] for feed in available_feeds if "id" in feed]
                logger.info(f"Discovered {len(feed_ids)} available feeds")
            
            # Subscribe to feeds
            if len(feed_ids) > 1:
                await subscribe_to_multiple_feeds(websocket, feed_ids)
            elif len(feed_ids) == 1:
                await subscribe_to_price_feed(websocket, feed_ids[0])
            else:
                logger.warning("No valid feeds to subscribe to")
                return
            
            # Handle price updates
            await handle_price_updates(
                websocket, 
                max_updates=args.max_updates, 
                timeout=args.timeout,
                feed_filter=feed_filter
            )
            
    except ConnectionRefusedError:
        logger.error(f"Failed to connect to {args.server_url} - is the server running?")
    except Exception as e:
        logger.error(f"Error: {e}")


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Subscribe to Pyth price feeds")
    
    feed_group = parser.add_mutually_exclusive_group()
    feed_group.add_argument("feed_id", nargs="?", help="Pyth feed ID to subscribe to")
    feed_group.add_argument("--multi", help="Comma-separated list of feed symbols (e.g., 'btc,eth,sol')")
    feed_group.add_argument("--all", action="store_true", help="Subscribe to all available feeds")
    
    parser.add_argument("--server-url", default="ws://localhost:8765", 
                        help="WebSocket server URL (default: ws://localhost:8765)")
    parser.add_argument("--max-updates", type=int, default=None, 
                        help="Maximum number of updates to receive before exiting")
    parser.add_argument("--timeout", type=float, default=30.0, 
                        help="Timeout in seconds for receiving updates (default: 30.0)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    
    args = parser.parse_args()
    
    # Set log level
    if args.debug:
        logging.getLogger('pyth_subscription').setLevel(logging.DEBUG)
        
    return args


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(run_client(args))