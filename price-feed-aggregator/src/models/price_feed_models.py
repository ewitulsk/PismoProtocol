from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
from enum import Enum


class PriceStatus(str, Enum):
    TRADING = "trading"
    HALTED = "halted"
    AUCTION = "auction"
    UNKNOWN = "unknown"


class MessageType(str, Enum):
    PRICE_UPDATE = "price_update"
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


class FeedSubscription(BaseModel):
    """
    Model representing a client's subscription to a price feed.
    """
    client_id: str
    feed_id: str