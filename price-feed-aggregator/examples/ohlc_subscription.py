#!/usr/bin/env python3
"""
Example script demonstrating how to subscribe to OHLC bars from the Pyth price feed service.

This script connects to the Pyth Price Feed service websocket server
and subscribes to OHLC bars for a specific feed and time interval.
It displays real-time bar updates and new bars as they are created.

Usage:
  python ohlc_subscription.py [feed_id] [interval]
  python ohlc_subscription.py --symbol btc 1m
  python ohlc_subscription.py --multi btc,eth,sol --interval 5m
  python ohlc_subscription.py --symbol sol --interval 1s
  python ohlc_subscription.py --multi btc,eth --interval 1d
  python ohlc_subscription.py --help
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
logger = logging.getLogger('ohlc_subscription')

# Common Pyth Network price feed IDs for cryptocurrencies
PRICE_FEEDS = {
    "btc": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",  # BTC/USD
    "eth": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",  # ETH/USD
    "sol": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",  # SOL/USD
    "avax": "93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7",  # AVAX/USD
    "matic": "5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52",  # MATIC/USD
    "link": "8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221",  # LINK/USD
    "doge": "dcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c",  # DOGE/USD
    "uni": "78d185a741d7b3e43748f63e2ffbb10bd8d575e9cad8e6159daa2a60f5c68c17",   # UNI/USD
}

# Valid time intervals
INTERVALS = ["1s", "10s", "30s", "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]


async def subscribe_to_ohlc(
    websocket: WebSocketClientProtocol,
    feed_id: str,
    interval: str,
    symbol: Optional[str] = None
) -> None:
    """
    Subscribe to OHLC bars for a specific feed and interval.
    
    Args:
        websocket: The websocket connection
        feed_id: Pyth feed ID to subscribe to
        interval: Time interval for the OHLC bars (e.g., "1m", "5m", "15m", etc.)
        symbol: Optional symbol name for the feed (for display purposes)
    """
    # Remove 0x prefix if present
    if feed_id.startswith('0x'):
        feed_id = feed_id[2:]
        
    # Create subscription message
    subscription_msg = {
        "type": "subscribe",
        "feed_id": feed_id,
        "ohlc": True,
        "intervals": interval
    }
    
    # Add symbol if provided
    if symbol:
        subscription_msg["symbol"] = symbol
    
    # Send subscription message
    await websocket.send(json.dumps(subscription_msg))
    logger.info(f"Sent OHLC subscription request for feed ID: {feed_id}, interval: {interval}")


# Removed get_ohlc_history function - historical data now comes with subscription confirmation


async def handle_messages(
    websocket: WebSocketClientProtocol,
    timeout: float = 30.0
) -> None:
    """
    Handle messages from the websocket server.
    
    Args:
        websocket: The websocket connection
        timeout: Timeout in seconds for waiting for messages
    """
    last_update_time = datetime.now()
    
    # Track current bars for each feed and interval
    current_bars = {}  # {(feed_id, interval): bar_data}
    
    while True:
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
                is_ohlc = data.get("ohlc", False)
                
                if is_ohlc:
                    intervals = data.get("intervals", [])
                    intervals_str = ", ".join(intervals)
                    symbol = data.get("symbol", feed_id)
                    logger.info(f"OHLC subscription confirmed for {symbol} ({feed_id}), intervals: {intervals_str}")
                    
                    # Process historical data that comes with subscription confirmation
                    historical_data = data.get("historical_data", {})
                    for interval, bars in historical_data.items():
                        if bars:
                            # Display summary of bars (oldest and newest)
                            oldest_bar = bars[-1]  # Oldest bar
                            latest_bar = bars[0]   # Newest bar (the bars should be in reverse order, newest first)
                            
                            # Latest bar details
                            open_price = latest_bar.get("open", 0)
                            high_price = latest_bar.get("high", 0)
                            low_price = latest_bar.get("low", 0)
                            close_price = latest_bar.get("close", 0)
                            
                            # Display bar count prominently
                            bar_count = len(bars)
                            bar_count_str = f"===== RECEIVED {bar_count} HISTORICAL BARS FOR {interval} ====="
                            logger.info("=" * len(bar_count_str))
                            logger.info(bar_count_str)
                            logger.info("=" * len(bar_count_str))
                            
                            logger.info(f"Symbol: {symbol} ({interval})")
                            oldest_time = oldest_bar.get("timestamp")
                            newest_time = latest_bar.get("timestamp")
                            logger.info(f"Date range: {oldest_time} to {newest_time}")
                            logger.info(f"Latest bar: ${open_price:.2f}, ${high_price:.2f}, ${low_price:.2f}, ${close_price:.2f} (OHLC)")
                            
                            # Store this as the current bar
                            current_bars[(feed_id, interval)] = latest_bar
                            
                            # Initialize bar counter for this feed/interval with number of bars received
                            if not hasattr(run_client, "bar_counters"):
                                run_client.bar_counters = {}
                            
                            key = (feed_id, interval)
                            run_client.bar_counters[key] = bar_count
                        else:
                            logger.info(f"No historical OHLC bars available for {feed_id}, interval: {interval}")
                else:
                    logger.info(f"Price feed subscription confirmed for feed ID: {feed_id}")
                
            # Removed ohlc_history message handling
                
            elif message_type == "bar_update":
                # This is an update to an existing bar
                bar_data = data.get("data", {})
                feed_id = bar_data.get("feed_id")
                interval = bar_data.get("interval")
                symbol = bar_data.get("symbol", feed_id)
                timestamp = bar_data.get("timestamp")
                open_price = bar_data.get("open", 0)
                high_price = bar_data.get("high", 0)
                low_price = bar_data.get("low", 0)
                close_price = bar_data.get("close", 0)
                confirmed = bar_data.get("confirmed", False)
                
                # Store or update current bar
                key = (feed_id, interval)
                current_bars[key] = bar_data
                
                status = "CONFIRMED" if confirmed else "UPDATING"
                logger.info(f"BAR UPDATE - {symbol} ({interval}) {status}:")
                logger.info(f"  Time: {timestamp}")
                logger.info(f"  OHLC: ${open_price:.2f}, ${high_price:.2f}, ${low_price:.2f}, ${close_price:.2f}")
                
            elif message_type == "new_bar":
                # This is a new bar
                bar_data = data.get("data", {})
                feed_id = bar_data.get("feed_id")
                interval = bar_data.get("interval")
                symbol = bar_data.get("symbol", feed_id)
                timestamp = bar_data.get("timestamp")
                open_price = bar_data.get("open", 0)
                high_price = bar_data.get("high", 0)
                low_price = bar_data.get("low", 0)
                close_price = bar_data.get("close", 0)
                
                # Store as current bar
                key = (feed_id, interval)
                current_bars[key] = bar_data
                
                # Get the bar count for this feed/interval
                # Add a counter for each feed/interval combination
                if not hasattr(run_client, "bar_counters"):
                    run_client.bar_counters = {}
                
                if key not in run_client.bar_counters:
                    run_client.bar_counters[key] = 1
                else:
                    run_client.bar_counters[key] += 1
                
                bar_number = run_client.bar_counters[key]
                
                logger.info(f"NEW BAR #{bar_number} - {symbol} ({interval}):")
                logger.info(f"  Time: {timestamp}")
                logger.info(f"  OHLC: ${open_price:.2f}, ${high_price:.2f}, ${low_price:.2f}, ${close_price:.2f}")
                
            elif message_type == "price_update":
                # Regular price update (not OHLC), just log the price
                price_data = data.get("data", {})
                feed_id = price_data.get("id")
                price = price_data.get("price", 0)
                expo = price_data.get("expo", 0)
                
                # Apply exponent to price
                actual_price = price * (10 ** expo) if price and expo else 0
                
                # Quietly log price updates
                logger.debug(f"Price update for {feed_id}: ${actual_price:.6f}")
                
            elif message_type == "error":
                logger.error(f"Error from server: {data.get('message')}")
                
            else:
                logger.debug(f"Received message type: {message_type}")
                
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
    Run the OHLC websocket client with specified arguments.
    
    Args:
        args: Command line arguments
    """
    # Determine which feeds to subscribe to
    feed_ids = []
    symbols = {}  # feed_id -> symbol
    
    if args.multi:
        # Parse comma-separated list of feed symbols
        symbol_names = [s.strip().lower() for s in args.multi.split(",")]
        for symbol in symbol_names:
            if symbol in PRICE_FEEDS:
                feed_id = PRICE_FEEDS[symbol]
                feed_ids.append(feed_id)
                symbols[feed_id] = symbol.upper()
            else:
                logger.warning(f"Unknown symbol: {symbol}")
    elif args.symbol:
        # Single symbol
        symbol = args.symbol.lower()
        if symbol in PRICE_FEEDS:
            feed_id = PRICE_FEEDS[symbol]
            feed_ids.append(feed_id)
            symbols[feed_id] = symbol.upper()
        else:
            logger.warning(f"Unknown symbol: {symbol}")
    elif args.feed_id:
        # Single feed ID provided directly
        feed_ids.append(args.feed_id)
    else:
        # Default to BTC/USD
        feed_id = PRICE_FEEDS["btc"]
        feed_ids.append(feed_id)
        symbols[feed_id] = "BTC"
    
    if not feed_ids:
        logger.error("No valid feeds to subscribe to")
        return
    
    # Connect to the websocket server
    try:
        async with websockets.connect(args.server_url) as websocket:
            logger.info(f"Connected to {args.server_url}")
            
            # Subscribe to OHLC for each feed
            for feed_id in feed_ids:
                symbol = symbols.get(feed_id)
                await subscribe_to_ohlc(
                    websocket, 
                    feed_id, 
                    args.interval,
                    symbol
                )
                
                # Historical bars are now automatically received with subscription confirmation
            
            # Handle incoming messages
            await handle_messages(websocket, args.timeout)
            
    except ConnectionRefusedError:
        logger.error(f"Failed to connect to {args.server_url} - is the server running?")
    except Exception as e:
        logger.error(f"Error: {e}")


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Subscribe to OHLC bars from Pyth price feeds")
    
    feed_group = parser.add_mutually_exclusive_group()
    feed_group.add_argument("feed_id", nargs="?", help="Pyth feed ID to subscribe to")
    feed_group.add_argument("--symbol", help="Feed symbol (e.g., 'btc', 'eth', 'sol')")
    feed_group.add_argument("--multi", help="Comma-separated list of feed symbols (e.g., 'btc,eth,sol')")
    
    parser.add_argument("--interval", default="1m", choices=INTERVALS,
                        help="Time interval for OHLC bars (default: 1m)")
    parser.add_argument("--server-url", default="ws://localhost:8765", 
                        help="WebSocket server URL (default: ws://localhost:8765)")
    parser.add_argument("--history", action="store_true",
                        help="Request historical OHLC bars")
    parser.add_argument("--history-limit", type=int, default=200,
                        help="Maximum number of historical bars to retrieve (default: 200)")
    parser.add_argument("--timeout", type=float, default=30.0, 
                        help="Timeout in seconds for receiving updates (default: 30.0)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    
    args = parser.parse_args()
    
    # Set log level
    if args.debug:
        logging.getLogger('ohlc_subscription').setLevel(logging.DEBUG)
        
    return args


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(run_client(args))