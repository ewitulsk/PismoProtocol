import os
import logging
import json
import asyncio
import websockets
import websockets.client  # Add explicit import for type checking
from typing import Dict, List, Optional, Any, Union, Callable, Awaitable, Set, MutableSequence
from datetime import datetime, date

import aiohttp
from aiohttp import ClientSession

from src.models.price_feed_models import PolygonBarData


class PolygonClient:
    """
    Client for connecting to the Polygon.io API for cryptocurrency price data.
    This client handles authentication and retrieval of historical bar data.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.polygon.io",
    ) -> None:
        # Use provided API key or get from environment variable
        self.api_key = api_key or os.environ.get("POLYGON_API_KEY")
        if not self.api_key:
            raise ValueError("Polygon API key must be provided or set as POLYGON_API_KEY environment variable")
            
        self.base_url = base_url
        self.session: Optional[ClientSession] = None
        self.logger = logging.getLogger("polygon_client")

    async def start(self) -> None:
        """
        Initialize the HTTP session for making requests to the Polygon API.
        """
        if not self.session:
            # Disable SSL verification since we're just getting price data
            self.session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(verify_ssl=False))
            self.logger.info("Polygon client session initialized (SSL verification disabled)")

    async def stop(self) -> None:
        """
        Close the HTTP session when done.
        """
        if self.session:
            await self.session.close()
            self.session = None
            self.logger.info("Polygon client session closed")

    async def get_crypto_bars(
        self,
        ticker: str,
        multiplier: int = 1,
        timespan: str = "day",
        from_date: Optional[Union[str, date, datetime]] = None,
        to_date: Optional[Union[str, date, datetime]] = None,
        adjusted: bool = True,
        sort: str = "asc",
        limit: int = 100,
    ) -> List[PolygonBarData]:
        """
        Get historical bar data for a cryptocurrency ticker.
        
        Args:
            ticker: Crypto ticker symbol (e.g., "X:BTCUSD")
            multiplier: Size of the timespan multiplier (e.g., 1, 5, 10)
            timespan: Size of the time window (minute, hour, day, week, month, quarter, year)
            from_date: Starting date (format: YYYY-MM-DD)
            to_date: Ending date (format: YYYY-MM-DD)
            adjusted: Whether to adjust for splits
            sort: Order of results (asc or desc)
            limit: Number of results to return (max 50000)
            
        Returns:
            List of bar data objects for the requested time range
        """
        if not self.session:
            await self.start()
            
        # Ensure we have a session
        if not self.session:
            self.logger.error("Failed to create session")
            return []
            
        # Format dates to strings if they are datetime or date objects
        from_str = self._format_date(from_date) if from_date else None
        to_str = self._format_date(to_date) if to_date else None
            
        # Build the endpoint URL
        endpoint = f"/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}"
        
        # Add required from/to parameters
        if not from_str or not to_str:
            raise ValueError("Both from_date and to_date must be provided")
            
        endpoint += f"/{from_str}/{to_str}"
        
        # Add query parameters
        params = {
            "adjusted": "true" if adjusted else "false",
            "sort": sort,
            "limit": limit,
            "apiKey": self.api_key
        }
        
        url = f"{self.base_url}{endpoint}"
        self.logger.debug(f"Requesting data from Polygon: {url}")
        
        try:
            # We've already checked that self.session is not None
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Check if the response has the expected structure
                    if data.get("status") == "OK" and "results" in data:
                        bars = self._parse_bar_data(data["results"], ticker)
                        return bars
                    else:
                        self.logger.error(f"Unexpected response format: {data}")
                        return []
                else:
                    error_text = await response.text()
                    self.logger.error(f"Failed to get data from Polygon: HTTP {response.status}, {error_text}")
                    return []
        except Exception as e:
            self.logger.error(f"Error fetching data from Polygon: {e}")
            return []
            
    def _format_date(self, date_obj: Union[str, date, datetime]) -> str:
        """Format a date object to YYYY-MM-DD string format required by Polygon API."""
        if isinstance(date_obj, str):
            return date_obj
        elif isinstance(date_obj, datetime):
            return date_obj.strftime("%Y-%m-%d")
        elif isinstance(date_obj, date):
            return date_obj.strftime("%Y-%m-%d")
        else:
            raise ValueError(f"Unsupported date format: {date_obj}")
            
    def _parse_bar_data(self, results: List[Dict[str, Any]], ticker: str) -> List[PolygonBarData]:
        """Parse raw bar data from Polygon API into our internal model."""
        bars = []
        
        for bar in results:
            # Convert timestamp (milliseconds) to datetime
            timestamp = datetime.fromtimestamp(bar.get("t", 0) / 1000)
            
            # Create PolygonBarData object
            bar_data = PolygonBarData(
                ticker=ticker,
                timestamp=timestamp,
                open=float(bar.get("o", 0)),
                high=float(bar.get("h", 0)),
                low=float(bar.get("l", 0)),
                close=float(bar.get("c", 0)),
                volume=float(bar.get("v", 0)),
                vwap=bar.get("vw", None),
                number_of_trades=bar.get("n", None),
                raw_data=bar
            )
            
            bars.append(bar_data)
            
        return bars


class PolygonStreamClient:
    """
    Client for connecting to Polygon.io's WebSocket API for real-time crypto data.
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        websocket_url: str = "wss://socket.polygon.io/crypto",
    ) -> None:
        # Use provided API key or get from environment variable
        self.api_key = api_key or os.environ.get("POLYGON_API_KEY")
        if not self.api_key:
            raise ValueError("Polygon API key must be provided or set as POLYGON_API_KEY environment variable")
            
        self.websocket_url = websocket_url
        self.websocket: Optional[Any] = None  # websockets.WebSocketClientProtocol
        self.logger = logging.getLogger("polygon_stream_client")
        self.is_running: bool = False
        self.subscribed_tickers: Set[str] = set()
        self.bar_callbacks: List[Callable[[PolygonBarData], Awaitable[None]]] = []
        
    async def start(self) -> None:
        """
        Start the Polygon WebSocket client for streaming updates.
        """
        if self.is_running:
            return
            
        self.is_running = True
        # Connection is established when subscribe is called
        self.logger.info("Polygon stream client initialized")
        
    async def stop(self) -> None:
        """
        Stop the Polygon WebSocket client and close the connection.
        """
        self.is_running = False
        
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
            
        self.subscribed_tickers = set()
        self.logger.info("Polygon stream client stopped")
        
    async def _connect_websocket(self) -> None:
        """Establish a WebSocket connection to Polygon's streaming API."""
        while self.is_running:
            try:
                # Connect to the WebSocket - disable SSL verification for WebSockets too
                self.logger.info(f"Connecting to Polygon WebSocket at {self.websocket_url}")
                # Create a type ignore comment for this line since the websockets library
                # might have different module structure in different versions
                self.websocket = await websockets.connect(
                    self.websocket_url,
                    ssl=False  # Disable SSL verification
                )  # type: ignore
                
                # Authenticate
                auth_message = json.dumps({
                    "action": "auth",
                    "params": self.api_key
                })
                await self.websocket.send(auth_message)
                
                # Wait for auth response
                auth_response = await self.websocket.recv()
                auth_data = json.loads(auth_response)
                
                if auth_data[0]["status"] == "connected":
                    self.logger.info("Successfully authenticated with Polygon WebSocket")
                    
                    # Subscribe to all active tickers
                    if self.subscribed_tickers:
                        await self._subscribe_to_tickers()
                    
                    # Listen for incoming messages
                    await self._listen_for_messages()
                else:
                    self.logger.error(f"Failed to authenticate with Polygon: {auth_data}")
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"WebSocket connection error: {e}")
                if self.websocket:
                    await self.websocket.close()
                    self.websocket = None
                
                await asyncio.sleep(5)  # Wait before reconnecting
                
    async def _listen_for_messages(self) -> None:
        """Listen for messages from the Polygon WebSocket."""
        if not self.websocket:
            return
            
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    
                    # Process different message types
                    if isinstance(data, list) and data:
                        message_type = data[0].get("ev")
                        
                        if message_type == "XA":  # Crypto Aggregate (Bar)
                            await self._process_bar_messages(data)
                        elif message_type == "XT":  # Crypto Trade
                            pass  # Not handling trades for now
                        elif message_type == "XL2":  # Crypto Level 2 Book
                            pass  # Not handling order book for now
                        elif message_type == "status":
                            self.logger.info(f"Polygon status update: {data[0]}")
                            
                except json.JSONDecodeError:
                    self.logger.error(f"Invalid JSON received: {message[:100]}...")
                except Exception as e:
                    self.logger.error(f"Error processing message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            self.logger.info("Polygon WebSocket connection closed")
        except Exception as e:
            self.logger.error(f"Error in WebSocket listener: {e}")
        finally:
            # Reconnect if disconnected and still running
            if self.is_running:
                asyncio.create_task(self._connect_websocket())
                
    async def _process_bar_messages(self, messages: List[Dict[str, Any]]) -> None:
        """Process bar messages from Polygon WebSocket and notify callbacks."""
        for message in messages:
            ticker = message.get("pair")
            if not ticker:
                continue
                
            # Format ticker as "X:BTCUSD" from "BTC-USD"
            ticker_parts = ticker.split("-")
            formatted_ticker = f"X:{ticker_parts[0]}{ticker_parts[1]}" if len(ticker_parts) > 1 else ticker
                
            # Check if this is a ticker we care about
            if formatted_ticker in self.subscribed_tickers:
                # Convert timestamp (milliseconds) to datetime
                timestamp = datetime.fromtimestamp(message.get("s", 0) / 1000)
                
                # Create bar data object
                bar_data = PolygonBarData(
                    ticker=formatted_ticker,
                    timestamp=timestamp,
                    open=float(message.get("o", 0)),
                    high=float(message.get("h", 0)),
                    low=float(message.get("l", 0)),
                    close=float(message.get("c", 0)),
                    volume=float(message.get("v", 0)),
                    vwap=message.get("vw", None),
                    number_of_trades=message.get("n", None),
                    raw_data=message
                )
                
                # Notify all registered callbacks
                await asyncio.gather(
                    *[callback(bar_data) for callback in self.bar_callbacks],
                    return_exceptions=True
                )
                
    async def _subscribe_to_tickers(self) -> None:
        """Subscribe to the current set of tickers."""
        if not self.websocket or not self.subscribed_tickers:
            return
            
        # Format subscription message with explicit typing for mypy
        params_list: List[str] = []
        
        # Add all timeframe subscriptions for each ticker
        for ticker in self.subscribed_tickers:
            # Format ticker from X:BTCUSD to BTC-USD for websocket
            ticker_parts = ticker.split(":")
            base_quote = ticker_parts[1] if len(ticker_parts) > 1 else ticker
            base = base_quote[:3]  # First 3 chars for base currency
            quote = base_quote[3:]  # Rest for quote currency
            ws_ticker = f"{base}-{quote}"
            
            # Subscribe to minute bars
            params_list.append(f"XA.{ws_ticker}")
            
        # Create the message with the params list
        subscription_message = {
            "action": "subscribe",
            "params": params_list
        }
            
        # Send subscription message
        await self.websocket.send(json.dumps(subscription_message))
        self.logger.info(f"Subscribed to tickers: {', '.join(self.subscribed_tickers)}")
        
    async def subscribe_to_ticker(self, ticker: str) -> None:
        """
        Subscribe to updates for a specific ticker.
        
        Args:
            ticker: Crypto ticker symbol (e.g., "X:BTCUSD")
        """
        # Check if we're already subscribed
        if ticker in self.subscribed_tickers:
            return
            
        # Add to our subscription set
        self.subscribed_tickers.add(ticker)
        self.logger.info(f"Added {ticker} to subscribed tickers")
        
        # If this is the first subscription, start the connection
        if len(self.subscribed_tickers) == 1 and not self.websocket:
            asyncio.create_task(self._connect_websocket())
        # If already connected, subscribe to the new ticker
        elif self.websocket:
            await self._subscribe_to_tickers()
            
    async def unsubscribe_from_ticker(self, ticker: str) -> None:
        """
        Unsubscribe from updates for a specific ticker.
        
        Args:
            ticker: Crypto ticker symbol (e.g., "X:BTCUSD")
        """
        if ticker not in self.subscribed_tickers:
            return
            
        # Remove from our subscription set
        self.subscribed_tickers.remove(ticker)
        self.logger.info(f"Removed {ticker} from subscribed tickers")
        
        # If we have no more subscriptions, close the connection
        if not self.subscribed_tickers and self.websocket:
            await self.websocket.close()
            self.websocket = None
        # Otherwise, update subscriptions
        elif self.websocket:
            # Format ticker from X:BTCUSD to BTC-USD for websocket
            ticker_parts = ticker.split(":")
            base_quote = ticker_parts[1] if len(ticker_parts) > 1 else ticker
            base = base_quote[:3]  # First 3 chars for base currency
            quote = base_quote[3:]  # Rest for quote currency
            ws_ticker = f"{base}-{quote}"
            
            # Unsubscribe message
            unsubscribe_message = {
                "action": "unsubscribe",
                "params": [f"XA.{ws_ticker}"]
            }
            await self.websocket.send(json.dumps(unsubscribe_message))
    
    def register_bar_callback(self, callback: Callable[[PolygonBarData], Awaitable[None]]) -> None:
        """
        Register a callback function that will be called when bar updates are received.
        
        Args:
            callback: An async function that takes a PolygonBarData object as input.
        """
        self.bar_callbacks.append(callback)