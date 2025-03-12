#!/usr/bin/env python3
"""
OHLC Chart Viewer

A terminal-based chart viewer that connects to the Pyth price feed service
and displays real-time OHLC (candlestick) charts using ASCII art.

Usage:
  python ohlc_chart_viewer.py --symbol btc
  python ohlc_chart_viewer.py --symbol eth --interval 5m
  python ohlc_chart_viewer.py --multi btc,eth,sol --interval 1m

Interactive Controls:
  q                 - Quit the application
  h                 - Display help
  space             - Toggle auto-refresh on/off
  + or =            - Increase refresh rate (more frequent updates)
  -                 - Decrease refresh rate (less frequent updates)
  1-7               - Quick switch to different time intervals:
                      1=1m, 2=5m, 3=15m, 4=30m, 5=1h, 6=4h, 7=1d
  :                 - Enter command mode (type a command and press Enter)

Command Mode:
  :interval 1m      - Change to 1-minute interval
  :interval 1h      - Change to 1-hour interval
  :help             - Show available commands
  :quit             - Exit the application
"""

import asyncio
import argparse
import json
import logging
import os
import select
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple, Set
from collections import defaultdict, deque

import websockets
from websockets.client import WebSocketClientProtocol

# Add the parent directory to the path so we can import from src
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Configure logging - less verbose for the chart display
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger('ohlc_chart_viewer')

# Common Pyth Network price feed IDs for cryptocurrencies
PRICE_FEEDS = {
    "btc": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",  # BTC/USD
}

# Valid time intervals
INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]

# ANSI color codes for chart display
COLORS = {
    "reset": "\033[0m",
    "bold": "\033[1m",
    "green": "\033[32m",
    "red": "\033[31m",
    "blue": "\033[34m",
    "yellow": "\033[33m",
    "magenta": "\033[35m",
    "cyan": "\033[36m",
    "white": "\033[37m",
    "bg_black": "\033[40m",
}

# Chart settings
CHART_WIDTH = 80
CHART_HEIGHT = 20
MAX_BARS = 40  # Maximum number of bars to display


class OHLCBar:
    """Simple class to represent an OHLC bar"""
    def __init__(self, feed_id: str, symbol: str, interval: str, timestamp: str,
                 open_price: float, high_price: float, low_price: float, close_price: float,
                 confirmed: bool = False):
        self.feed_id = feed_id
        self.symbol = symbol
        self.interval = interval
        self.timestamp = timestamp
        self.open_price = open_price
        self.high_price = high_price
        self.low_price = low_price
        self.close_price = close_price
        self.confirmed = confirmed
        
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'OHLCBar':
        """Create an OHLCBar from a dictionary"""
        return cls(
            feed_id=data.get("feed_id", ""),
            symbol=data.get("symbol", ""),
            interval=data.get("interval", ""),
            timestamp=data.get("timestamp", ""),
            open_price=data.get("open", 0.0),
            high_price=data.get("high", 0.0),
            low_price=data.get("low", 0.0),
            close_price=data.get("close", 0.0),
            confirmed=data.get("confirmed", False)
        )
        
    @property
    def is_up(self) -> bool:
        """Returns True if this is an up bar (close >= open)"""
        return self.close_price >= self.open_price
        
    @property
    def price_range(self) -> float:
        """Returns the total price range (high - low)"""
        return self.high_price - self.low_price
        
    @property
    def body_size(self) -> float:
        """Returns the size of the candle body (abs(close - open))"""
        return abs(self.close_price - self.open_price)
        
    @property
    def upper_wick(self) -> float:
        """Returns the size of the upper wick"""
        return self.high_price - max(self.open_price, self.close_price)
        
    @property
    def lower_wick(self) -> float:
        """Returns the size of the lower wick"""
        return min(self.open_price, self.close_price) - self.low_price


class ChartRenderer:
    """Renders OHLC bars as ASCII charts"""
    
    def __init__(self, width: int = CHART_WIDTH, height: int = CHART_HEIGHT):
        self.width = width
        self.height = height
        self.charts = {}  # (symbol, interval) -> list of bars
        self.min_max_prices = {}  # (symbol, interval) -> (min_price, max_price)
        
    def add_bar(self, bar: OHLCBar) -> None:
        """Add or update a bar in the chart"""
        key = (bar.symbol, bar.interval)
        
        # Initialize if not exists
        if key not in self.charts:
            self.charts[key] = deque(maxlen=MAX_BARS)
            self.min_max_prices[key] = (float('inf'), float('-inf'))
        
        # Check if this bar already exists (by timestamp)
        found = False
        for i, existing_bar in enumerate(self.charts[key]):
            if existing_bar.timestamp == bar.timestamp:
                # Replace the existing bar
                self.charts[key][i] = bar
                found = True
                break
                
        # Add new bar if not found
        if not found:
            self.charts[key].append(bar)
            
        # Update min/max prices
        min_price, max_price = self.min_max_prices[key]
        min_price = min(min_price, bar.low_price)
        max_price = max(max_price, bar.high_price)
        self.min_max_prices[key] = (min_price, max_price)
        
    def render_chart(self, symbol: str, interval: str) -> str:
        """Render a chart for a specific symbol and interval"""
        key = (symbol, interval)
        if key not in self.charts or not self.charts[key]:
            return f"No data available for {symbol} ({interval})"
            
        bars = list(self.charts[key])
        min_price, max_price = self.min_max_prices[key]
        
        # Add some padding to min/max for better display
        price_range = max_price - min_price
        if price_range == 0:
            price_range = max_price * 0.01  # 1% if all prices are the same
            
        padding = price_range * 0.1  # 10% padding
        min_price -= padding
        max_price += padding
        
        # Calculate price per row
        price_per_row = (max_price - min_price) / (self.height - 1)
        
        # Get latest price
        latest_bar = bars[-1]
        latest_price = latest_bar.close_price
        price_change = latest_price - bars[0].open_price
        price_change_pct = (price_change / bars[0].open_price) * 100
        
        # Get 24h price change if available (assuming 1d interval data or multiple bars covering 24h)
        day_change = 0
        day_change_pct = 0
        if len(bars) > 1:
            # Try to find a bar approximately 24h ago
            earliest_price = bars[0].open_price
            day_change = latest_price - earliest_price
            day_change_pct = (day_change / earliest_price) * 100 if earliest_price else 0
        
        # Create the chart header
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        header = [
            f"{COLORS['bold']}{symbol.upper()} - {interval} - {current_time}{COLORS['reset']}",
            f"Last: {COLORS['bold']}{COLORS['green'] if price_change >= 0 else COLORS['red']}${latest_price:.2f}{COLORS['reset']} "
            f"({'+' if price_change >= 0 else ''}{price_change:.2f} / {price_change_pct:.2f}%) "
            f"24h: ({'+' if day_change >= 0 else ''}{day_change:.2f} / {day_change_pct:.2f}%)",
            f"O: ${bars[0].open_price:.2f}  H: ${max_price:.2f}  L: ${min_price:.2f}  C: ${latest_price:.2f}  Bars: {len(bars)}",
            f"{'-' * self.width}"
        ]
        
        # Create the chart body
        chart_rows = []
        for y in range(self.height):
            # Calculate the price at this row (top row = highest price)
            row_price = max_price - (y * price_per_row)
            
            # Build the row
            row = []
            for bar in bars:
                # Determine if this row intersects with the bar
                if bar.low_price <= row_price <= bar.high_price:
                    # Determine what part of the bar we're drawing
                    if row_price >= max(bar.open_price, bar.close_price):
                        # Upper wick
                        row.append("│")
                    elif row_price <= min(bar.open_price, bar.close_price):
                        # Lower wick
                        row.append("│")
                    else:
                        # Body - use different characters based on bar type
                        if bar.is_up:
                            row.append(f"{COLORS['green']}█{COLORS['reset']}")
                        else:
                            row.append(f"{COLORS['red']}█{COLORS['reset']}")
                else:
                    # No intersection, draw space or volume indicator
                    row.append(" ")
            
            # Add price scale on the right side at regular intervals
            if y == 0 or y == self.height // 2 or y == self.height - 1:
                row_str = "".join(row)
                price_str = f" ${row_price:.2f}"
                chart_rows.append(row_str + price_str)
            else:
                chart_rows.append("".join(row))
        
        # Create the time axis with more timestamps if space allows
        time_axis = []
        num_bars = len(bars)
        if num_bars > 1:
            # Add timestamps at regular intervals
            markers = []
            
            # Always show first and last time
            first_time = self._format_timestamp(bars[0].timestamp)
            last_time = self._format_timestamp(bars[-1].timestamp)
            
            # Calculate positions
            positions = []
            if num_bars >= 40:
                # Add 3 more timestamps for larger charts
                positions = [0, num_bars // 4, num_bars // 2, 3 * num_bars // 4, num_bars - 1]
            elif num_bars >= 20:
                # Add 1 more timestamp for medium charts
                positions = [0, num_bars // 2, num_bars - 1]
            else:
                # Just first and last for small charts
                positions = [0, num_bars - 1]
            
            # Create axis with position markers
            axis_line = [" " for _ in range(num_bars)]
            for p in positions:
                if p < num_bars:
                    axis_line[p] = "│"
            
            # Create time labels
            time_labels = ""
            current_pos = 0
            for p in positions:
                if p < num_bars:
                    time_str = self._format_timestamp(bars[p].timestamp)
                    if p > 0:
                        # Add spacing based on position
                        space_needed = p - current_pos - len(time_labels)
                        time_labels += " " * max(0, space_needed)
                    time_labels += time_str
                    current_pos = p + len(time_str)
            
            time_axis = ["".join(axis_line), time_labels]
        
        # Combine all parts
        return "\n".join(header + chart_rows + time_axis)
        
    def _format_timestamp(self, timestamp_str: str) -> str:
        """Format a timestamp string for display in the chart"""
        try:
            # Handle both string and datetime inputs
            if isinstance(timestamp_str, str):
                if "T" in timestamp_str:
                    # ISO format like "2023-03-15T14:30:00.000Z"
                    time_part = timestamp_str.split("T")[1].split(".")[0]
                    return time_part
                return timestamp_str
            elif isinstance(timestamp_str, datetime):
                return timestamp_str.strftime("%H:%M:%S")
            return str(timestamp_str)
        except Exception:
            return str(timestamp_str)
        
    def clear_screen(self) -> None:
        """Clear the terminal screen"""
        os.system('cls' if os.name == 'nt' else 'clear')
        
    def display_all_charts(self) -> None:
        """Display all charts"""
        self.clear_screen()
        
        for key in sorted(self.charts.keys()):
            symbol, interval = key
            chart = self.render_chart(symbol, interval)
            print(chart)
            print("\n")


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
        "intervals": [interval]
    }
    
    # Add symbol if provided
    if symbol:
        subscription_msg["symbol"] = symbol
    
    # Send subscription message
    await websocket.send(json.dumps(subscription_msg))
    logger.info(f"Subscribed to OHLC: {feed_id}, interval: {interval}")


async def get_ohlc_history(
    websocket: WebSocketClientProtocol,
    feed_id: str,
    interval: str,
    limit: int = 100
) -> None:
    """
    Request historical OHLC bars for a specific feed and interval.
    
    Args:
        websocket: The websocket connection
        feed_id: Pyth feed ID
        interval: Time interval for the OHLC bars
        limit: Maximum number of bars to retrieve
    """
    # Remove 0x prefix if present
    if feed_id.startswith('0x'):
        feed_id = feed_id[2:]
        
    # Create request message
    request_msg = {
        "type": "get_ohlc_history",
        "feed_id": feed_id,
        "interval": interval,
        "limit": limit
    }
    
    # Send request message
    await websocket.send(json.dumps(request_msg))
    logger.info(f"Requested OHLC history: {feed_id}, interval: {interval}")


class KeyboardController:
    """Handles keyboard input for interactive chart control"""
    
    def __init__(self):
        self.command_mode = False
        self.current_command = ""
        self.interval_index = 0  # Index into INTERVALS list
        self.should_exit = False
        self.auto_refresh = True
        self.message = ""
        self.message_time = 0
        self.refresh_rate = 1.0  # Default refresh rate in seconds
        self.min_refresh_rate = 0.1  # Minimum refresh rate (10 updates per second)
        self.max_refresh_rate = 10.0  # Maximum refresh rate (1 update per 10 seconds)
        
    def process_key(self, key: str) -> bool:
        """Process a keypress and return True if display needs updating"""
        if self.command_mode:
            # Handle command mode
            if key == '\n':  # Enter
                self.execute_command()
                self.command_mode = False
                return True
            elif key == '\x1b':  # Escape
                self.command_mode = False
                self.current_command = ""
                self.show_message("Command mode canceled")
                return True
            elif key == '\x7f':  # Backspace
                self.current_command = self.current_command[:-1]
                return True
            else:
                self.current_command += key
                return True
        else:
            # Normal mode
            if key == 'q':
                self.should_exit = True
                return False
            elif key == ':':
                self.command_mode = True
                self.current_command = ""
                return True
            elif key in ['+', '=']:
                # Increase refresh rate (decrease the interval between updates)
                self.refresh_rate = max(self.min_refresh_rate, self.refresh_rate / 1.5)
                self.show_message(f"Refresh rate: {1.0/self.refresh_rate:.1f} updates/sec")
                return True
            elif key == '-':
                # Decrease refresh rate (increase the interval between updates)
                self.refresh_rate = min(self.max_refresh_rate, self.refresh_rate * 1.5)
                self.show_message(f"Refresh rate: {1.0/self.refresh_rate:.1f} updates/sec")
                return True
            elif key == ' ':
                # Toggle auto-refresh
                self.auto_refresh = not self.auto_refresh
                self.show_message(f"Auto-refresh: {'ON' if self.auto_refresh else 'OFF'}")
                return True
            elif key in ['1', '2', '3', '4', '5', '6', '7']:
                # Quick interval change (1-7 correspond to intervals)
                idx = int(key) - 1
                if idx < len(INTERVALS):
                    self.interval_index = idx
                    self.show_message(f"Interval changed to {INTERVALS[self.interval_index]}")
                return True
            elif key == 'h':
                # Show help
                self.show_message("Help: q:quit, space:toggle refresh, 1-7:change interval, +:speed up, -:slow down")
                return True
        return False
        
    def execute_command(self):
        """Execute the current command"""
        cmd = self.current_command.strip().lower()
        if cmd.startswith("int ") or cmd.startswith("interval "):
            # Change interval
            interval = cmd.split(" ")[1]
            if interval in INTERVALS:
                self.interval_index = INTERVALS.index(interval)
                self.show_message(f"Changed interval to {interval}")
            else:
                self.show_message(f"Invalid interval: {interval}")
        elif cmd == "help":
            self.show_message("Commands: interval [1m|5m|15m|30m|1h|4h|1d], quit, help")
        elif cmd in ["quit", "exit"]:
            self.should_exit = True
        else:
            self.show_message(f"Unknown command: {cmd}")
        
        self.current_command = ""
    
    def show_message(self, msg: str):
        """Show a temporary message"""
        self.message = msg
        self.message_time = time.time()
    
    def get_command_display(self) -> str:
        """Get the current command display string"""
        if self.command_mode:
            return f":{self.current_command}_"
        elif time.time() - self.message_time < 3:  # Show message for 3 seconds
            return self.message
        return ""


async def run_ohlc_viewer(args) -> None:
    """
    Run the OHLC chart viewer.
    
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
        
    # Initialize chart renderer and keyboard controller
    renderer = ChartRenderer(width=args.width, height=args.height)
    controller = KeyboardController()
    
    # Initialize with the specified interval
    initial_interval = args.interval
    if initial_interval in INTERVALS:
        controller.interval_index = INTERVALS.index(initial_interval)
    
    # Setup refresh timer for terminal display
    last_render_time = time.time()
    controller.refresh_rate = args.refresh_rate  # Initialize with command-line value
    
    # Connect to the websocket server
    try:
        async with websockets.connect(args.server_url) as websocket:
            logger.info(f"Connected to {args.server_url}")
            
            # Initial subscription
            await subscribe_all_feeds(websocket, feed_ids, symbols, INTERVALS[controller.interval_index], args.history_limit)
            
            # Set up raw terminal mode for key capture
            if os.name == 'posix':
                import termios
                fd = sys.stdin.fileno()
                old_settings = termios.tcgetattr(fd)
                try:
                    import tty
                    tty.setraw(fd)
                    
                    # Display initial help message
                    controller.show_message("Press 'h' for help, 'q' to quit")
                    
                    # Process messages
                    while not controller.should_exit:
                        # Check for keyboard input
                        if select.select([sys.stdin], [], [], 0)[0]:
                            key = sys.stdin.read(1)
                            if controller.process_key(key):
                                # Update display immediately if key changed something
                                renderer.display_all_charts()
                                print(controller.get_command_display())
                                last_render_time = time.time()
                                
                                # Check if we need to change interval
                                current_interval = INTERVALS[controller.interval_index]
                                if current_interval != args.interval:
                                    args.interval = current_interval
                                    # Re-subscribe with new interval
                                    await subscribe_all_feeds(websocket, feed_ids, symbols, current_interval, args.history_limit)
                                
                        try:
                            # Wait for a message with a short timeout
                            message = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                            
                            # Parse the message
                            data = json.loads(message)
                            message_type = data.get("type")
                            
                            # Handle different message types
                            if message_type == "connection_established":
                                client_id = data.get("client_id")
                                logger.info(f"Connected with client ID: {client_id}")
                            
                            elif message_type == "ohlc_history":
                                bars = data.get("bars", [])
                                if bars:
                                    for bar_data in bars:
                                        bar = OHLCBar.from_dict(bar_data)
                                        renderer.add_bar(bar)
                            
                            elif message_type in ["bar_update", "new_bar"]:
                                bar_data = data.get("data", {})
                                bar = OHLCBar.from_dict(bar_data)
                                renderer.add_bar(bar)
                            
                        except asyncio.TimeoutError:
                            # This is expected, we use a short timeout for regular updates
                            pass
                        
                        # Check if it's time to render
                        current_time = time.time()
                        if controller.auto_refresh and (current_time - last_render_time >= controller.refresh_rate):
                            renderer.display_all_charts()
                            print(controller.get_command_display())
                            last_render_time = current_time
                            
                        # Short sleep to prevent high CPU usage
                        await asyncio.sleep(0.01)
                finally:
                    termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
            else:
                # Non-POSIX systems (Windows) - use simplified polling
                # Process messages without keyboard interaction
                while True:
                    try:
                        # Wait for a message with a short timeout
                        message = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                        
                        # Parse the message
                        data = json.loads(message)
                        message_type = data.get("type")
                        
                        # Handle different message types
                        if message_type == "connection_established":
                            client_id = data.get("client_id")
                            logger.info(f"Connected with client ID: {client_id}")
                        
                        elif message_type == "ohlc_history":
                            bars = data.get("bars", [])
                            if bars:
                                for bar_data in bars:
                                    bar = OHLCBar.from_dict(bar_data)
                                    renderer.add_bar(bar)
                        
                        elif message_type in ["bar_update", "new_bar"]:
                            bar_data = data.get("data", {})
                            bar = OHLCBar.from_dict(bar_data)
                            renderer.add_bar(bar)
                        
                    except asyncio.TimeoutError:
                        # This is expected, we use a short timeout for regular screen updates
                        pass
                    
                    # Check if it's time to render
                    current_time = time.time()
                    if current_time - last_render_time >= controller.refresh_rate:
                        renderer.display_all_charts()
                        last_render_time = current_time
                        
                    # Short sleep to prevent high CPU usage
                    await asyncio.sleep(0.01)
                
    except KeyboardInterrupt:
        print("\nExiting on user request")
    except ConnectionRefusedError:
        print(f"Could not connect to {args.server_url} - is the server running?")
    except Exception as e:
        print(f"Error: {e}")


async def subscribe_all_feeds(
    websocket: WebSocketClientProtocol,
    feed_ids: List[str],
    symbols: Dict[str, str],
    interval: str,
    history_limit: int
) -> None:
    """Subscribe to all feeds with the given interval"""
    for feed_id in feed_ids:
        symbol = symbols.get(feed_id, feed_id)
        await subscribe_to_ohlc(
            websocket, 
            feed_id, 
            interval,
            symbol
        )
        
        # Request historical bars
        await get_ohlc_history(
            websocket,
            feed_id,
            interval,
            history_limit
        )


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="ASCII OHLC Chart Viewer for Pyth price feeds")
    
    feed_group = parser.add_mutually_exclusive_group()
    feed_group.add_argument("feed_id", nargs="?", help="Pyth feed ID to subscribe to")
    feed_group.add_argument("--symbol", help="Feed symbol (e.g., 'btc', 'eth', 'sol')")
    feed_group.add_argument("--multi", help="Comma-separated list of feed symbols (e.g., 'btc,eth,sol')")
    
    parser.add_argument("--interval", default="1m", choices=INTERVALS,
                        help="Time interval for OHLC bars (default: 1m)")
    parser.add_argument("--server-url", default="ws://localhost:8765", 
                        help="WebSocket server URL (default: ws://localhost:8765)")
    parser.add_argument("--history-limit", type=int, default=40,
                        help="Number of historical bars to retrieve (default: 40)")
    parser.add_argument("--width", type=int, default=CHART_WIDTH,
                        help=f"Chart width in characters (default: {CHART_WIDTH})")
    parser.add_argument("--height", type=int, default=CHART_HEIGHT,
                        help=f"Chart height in characters (default: {CHART_HEIGHT})")
    parser.add_argument("--refresh-rate", type=float, default=1.0,
                        help="Chart refresh rate in seconds (default: 1.0)")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    # Set log level
    if args.verbose:
        logging.getLogger().setLevel(logging.INFO)
        
    return args


if __name__ == "__main__":
    args = parse_args()
    try:
        asyncio.run(run_ohlc_viewer(args))
    except KeyboardInterrupt:
        print("\nExiting on user request")