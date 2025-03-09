#!/usr/bin/env python3
"""
Example client that connects to the Price Feed Aggregator websocket server and
subscribes to BTC/USD and ETH/USD price feeds.

This client demonstrates how to:
1. Connect to the websocket server
2. Subscribe to price feeds
3. Process incoming price updates
"""

import asyncio
import json
import websockets
import argparse
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional


logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger("websocket_client")


async def subscribe_to_feeds(websocket, feed_ids: List[str]) -> None:
    """
    Subscribe to the specified price feeds.
    
    Args:
        websocket: The websocket connection
        feed_ids: List of feed IDs to subscribe to
    """
    if len(feed_ids) == 1:
        # Single feed subscription
        logger.info(f"Subscribing to feed: {feed_ids[0]}")
        await websocket.send(json.dumps({
            "type": "subscribe",
            "feed_id": feed_ids[0],
        }))
    else:
        # Multiple feed subscription
        logger.info(f"Subscribing to multiple feeds: {', '.join(feed_ids)}")
        await websocket.send(json.dumps({
            "type": "subscribe_multiple",
            "feed_ids": feed_ids,
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
            logger.info(f"Subscription confirmed for feed: {data.get('feed_id')}")
            
        elif message_type == "unsubscription_confirmed":
            logger.info(f"Unsubscription confirmed for feed: {data.get('feed_id')}")
            
        elif message_type == "available_feeds":
            feeds = data.get("feeds", [])
            logger.info(f"Available feeds ({len(feeds)}):")
            
            for feed in feeds[:10]:  # Show first 10 feeds
                feed_id = feed.get("id", "Unknown")
                symbol = feed.get("symbol", "Unknown")
                logger.info(f"  - {symbol}: {feed_id}")
                
            if len(feeds) > 10:
                logger.info(f"  - ... and {len(feeds) - 10} more")
            
        elif message_type == "price_update":
            price_data = data.get("data", {})
            feed_id = price_data.get("feed_id", "Unknown")
            price = price_data.get("price", 0)
            confidence = price_data.get("confidence", 0)
            exponent = price_data.get("exponent", 0)
            
            # Format price with exponent
            formatted_price = price * (10 ** exponent)
            formatted_confidence = confidence * (10 ** exponent)
            
            logger.info(
                f"Price update for {feed_id}: "
                f"${formatted_price:.2f} ± ${formatted_confidence:.2f} "
            )
            
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
        "--feeds",
        nargs="*",
        default=[],
        help="Feed IDs to subscribe to (if empty, will get list of available feeds)"
    )
    
    args = parser.parse_args()
    server_url = f"ws://{args.host}:{args.port}"
    feed_ids = args.feeds
    
    logger.info(f"Connecting to server at {server_url}")
    
    try:
        async with websockets.connect(server_url) as websocket:
            # If no feeds specified, get available feeds
            if not feed_ids:
                await get_available_feeds(websocket)
                
                # Wait a bit to receive the available feeds response
                await asyncio.sleep(2)
                
                # Then subscribe to BTC/USD and ETH/USD as example feeds
                # Note: These feed IDs might change, so they should be looked up first
                logger.info("No feed IDs specified. Subscribing to default feeds...")
                feed_ids = [
                    "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",  # BTC/USD
                    "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",  # ETH/USD
                ]
            
            # Subscribe to specified feeds
            await subscribe_to_feeds(websocket, feed_ids)
            
            # Process incoming messages
            async for message in websocket:
                await process_message(message)
                
    except ConnectionRefusedError:
        logger.error(f"Connection refused. Make sure the server is running at {server_url}")
    except Exception as e:
        logger.error(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())