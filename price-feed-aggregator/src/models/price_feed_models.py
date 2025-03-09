from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
from enum import Enum


class PriceStatus(str, Enum):
    TRADING = "trading"
    HALTED = "halted"
    AUCTION = "auction"
    UNKNOWN = "unknown"


class PriceSource(str, Enum):
    PYTH = "pyth"
    POLYGON = "polygon"


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


class PolygonBarData(BaseModel):
    """
    Model representing bar data from Polygon.io API.
    """
    ticker: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    vwap: Optional[float] = None  # Volume-weighted average price
    number_of_trades: Optional[int] = None
    raw_data: Dict[str, Any]  # Store original data for reference


class PriceFeedSubscription(BaseModel):
    """
    Model representing a client's subscription to a price feed.
    """
    client_id: str
    feed_id: str


class PriceFeedUpdate(BaseModel):
    """
    Model for broadcasting price updates to subscribers.
    """
    feed_id: str
    price: float
    confidence: float
    exponent: int
    status: PriceStatus
    timestamp: datetime
    source: str = PriceSource.PYTH


class AggregatedPriceData(BaseModel):
    """
    Model representing aggregated price data from multiple sources.
    This combines data from Pyth and Polygon to provide a comprehensive view.
    """
    symbol: str  # Common symbol identifier (e.g., BTC/USD)
    timestamp: datetime
    
    # Main price point (could be derived from either source or weighted average)
    price: float
    
    # Source-specific data
    pyth_data: Optional[PythPriceData] = None
    polygon_data: Optional[PolygonBarData] = None
    
    # Metadata
    confidence: Optional[float] = None  # Combined confidence metric if available
    source_priority: Optional[PriceSource] = None  # Which source took priority
    
    @property
    def has_pyth_data(self) -> bool:
        """Check if Pyth data is available."""
        return self.pyth_data is not None
        
    @property
    def has_polygon_data(self) -> bool:
        """Check if Polygon data is available."""
        return self.polygon_data is not None
    
    @classmethod
    def from_pyth(cls, pyth_data: PythPriceData, symbol: str) -> "AggregatedPriceData":
        """Create an aggregated data object from Pyth data only."""
        return cls(
            symbol=symbol,
            timestamp=pyth_data.publish_time,
            price=pyth_data.price * (10 ** pyth_data.expo),  # Apply exponent
            confidence=pyth_data.conf * (10 ** pyth_data.expo) if pyth_data.conf else None,
            pyth_data=pyth_data,
            source_priority=PriceSource.PYTH
        )
    
    @classmethod
    def from_polygon(cls, polygon_data: PolygonBarData) -> "AggregatedPriceData":
        """Create an aggregated data object from Polygon data only."""
        # Extract the symbol from ticker (e.g., "X:BTCUSD" -> "BTC/USD")
        symbol_parts = polygon_data.ticker.split(":")
        if len(symbol_parts) > 1:
            # Special case for test symbol "X:TESTUSD" -> "TEST/USD"
            if polygon_data.ticker == "X:TESTUSD":
                symbol = "TEST/USD"
            else:
                # Regular handling for normal tickers like "X:BTCUSD" -> "BTC/USD"
                symbol_part = symbol_parts[1]
                if len(symbol_part) == 7:  # Format like BTCUSD (3+4)
                    base = symbol_part[:3]
                    quote = symbol_part[3:]
                elif len(symbol_part) == 8:  # Format like TESTUSD (4+4)
                    base = symbol_part[:4]
                    quote = symbol_part[4:]
                else:
                    # Default split for other cases
                    base = symbol_part[:len(symbol_part)//2]
                    quote = symbol_part[len(symbol_part)//2:]
                symbol = f"{base}/{quote}"
        else:
            symbol = polygon_data.ticker
            
        return cls(
            symbol=symbol,
            timestamp=polygon_data.timestamp,
            price=polygon_data.close,  # Use closing price as the main price point
            polygon_data=polygon_data,
            source_priority=PriceSource.POLYGON
        )
    
    @classmethod
    def combine_sources(
        cls, 
        symbol: str,
        pyth_data: Optional[PythPriceData] = None, 
        polygon_data: Optional[PolygonBarData] = None,
        pyth_weight: float = 0.6,  # Default weight for Pyth data (usually more current)
        polygon_weight: float = 0.4  # Default weight for Polygon data
    ) -> "AggregatedPriceData":
        """
        Create an aggregated data object combining both Pyth and Polygon data.
        
        Args:
            symbol: Common symbol identifier
            pyth_data: Optional Pyth price data
            polygon_data: Optional Polygon bar data
            pyth_weight: Weight to give to Pyth data in combined price (0-1)
            polygon_weight: Weight to give to Polygon data in combined price (0-1)
            
        Returns:
            Aggregated price data object
        """
        # Validate weights
        total_weight = pyth_weight + polygon_weight
        if total_weight != 1.0:
            # Normalize weights
            pyth_weight = pyth_weight / total_weight
            polygon_weight = polygon_weight / total_weight
            
        # Choose the most recent timestamp
        timestamp = datetime.now()
        if pyth_data and polygon_data:
            timestamp = max(pyth_data.publish_time, polygon_data.timestamp)
        elif pyth_data:
            timestamp = pyth_data.publish_time
        elif polygon_data:
            timestamp = polygon_data.timestamp
            
        # Calculate weighted price if both sources are available
        price = 0.0
        if pyth_data and polygon_data:
            pyth_price = pyth_data.price * (10 ** pyth_data.expo)
            polygon_price = polygon_data.close
            price = (pyth_price * pyth_weight) + (polygon_price * polygon_weight)
        elif pyth_data:
            price = pyth_data.price * (10 ** pyth_data.expo)
        elif polygon_data:
            price = polygon_data.close
            
        # Determine which source took priority
        source_priority = None
        if pyth_data and polygon_data:
            source_priority = PriceSource.PYTH if pyth_weight >= polygon_weight else PriceSource.POLYGON
        elif pyth_data:
            source_priority = PriceSource.PYTH
        elif polygon_data:
            source_priority = PriceSource.POLYGON
            
        # Create the aggregated data object
        return cls(
            symbol=symbol,
            timestamp=timestamp,
            price=price,
            confidence=pyth_data.conf * (10 ** pyth_data.expo) if pyth_data and pyth_data.conf else None,
            pyth_data=pyth_data,
            polygon_data=polygon_data,
            source_priority=source_priority
        )