from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Union, Literal
from datetime import datetime
from enum import Enum


class PriceStatus(str, Enum):
    TRADING = "trading"
    HALTED = "halted"
    AUCTION = "auction"
    UNKNOWN = "unknown"


class TimeInterval(str, Enum):
    """Time intervals for OHLC bars"""
    ONE_SECOND = "1s"
    TEN_SECONDS = "10s"
    THIRTY_SECONDS = "30s"
    ONE_MINUTE = "1m"
    FIVE_MINUTES = "5m"
    FIFTEEN_MINUTES = "15m"
    THIRTY_MINUTES = "30m"
    ONE_HOUR = "1h"
    FOUR_HOURS = "4h"
    ONE_DAY = "1d"
    ONE_WEEK = "1w"
    ONE_MONTH = "1M"


class MessageType(str, Enum):
    PRICE_UPDATE = "price_update"
    BAR_UPDATE = "bar_update"
    NEW_BAR = "new_bar"
    CONNECTION_ESTABLISHED = "connection_established"
    SUBSCRIPTION_CONFIRMED = "subscription_confirmed"
    UNSUBSCRIPTION_CONFIRMED = "unsubscription_confirmed"
    AVAILABLE_FEEDS = "available_feeds"
    ERROR = "error"


class PythPriceData(BaseModel):
    """
    Model representing a price update from Pyth Network's Hermes service.
    """
    id: str
    price: float
    conf: float  # Confidence interval
    expo: int  # Price exponent
    publish_time: datetime
    status: PriceStatus
    ema_price: Optional[float] = None
    ema_conf: Optional[float] = None
    raw_price_data: Dict[str, Any]  # Store original data for reference


class OHLCBar(BaseModel):
    """
    Model representing an OHLC (Open, High, Low, Close) bar for a time interval.
    """
    feed_id: str                 # Pyth feed ID
    symbol: str                  # Human-readable symbol (e.g., "BTC/USD")
    interval: TimeInterval       # Time interval this bar represents
    timestamp: datetime          # Start time of this bar
    open: float                  # Opening price
    high: float                  # Highest price during interval
    low: float                   # Lowest price during interval
    close: float                 # Latest/closing price
    volume: Optional[float] = 0  # Volume (if available, placeholder for future)
    confirmed: bool = False      # Whether this bar is complete/confirmed
    
    def update_with_price(self, price: float) -> bool:
        """
        Update the bar with a new price value.
        
        Args:
            price: The new price to incorporate
            
        Returns:
            bool: True if any values were updated, False otherwise
        """
        updated = False
        
        # Update high if new price is higher
        if price > self.high:
            self.high = price
            updated = True
            
        # Update low if new price is lower
        if price < self.low:
            self.low = price
            updated = True
            
        # Always update close price
        if price != self.close:
            self.close = price
            updated = True
            
        return updated


class FeedSubscription(BaseModel):
    """
    Model representing a client's subscription to a price feed.
    """
    client_id: str
    feed_id: str


class OHLCSubscription(BaseModel):
    """
    Model representing a client's subscription to OHLC bars.
    """
    client_id: str
    feed_id: str
    intervals: List[TimeInterval]  # List of time intervals to subscribe to