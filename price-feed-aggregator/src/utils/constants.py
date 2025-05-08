"""
Constants used throughout the price feed aggregator application.
"""

# Standard Pyth price feeds
PRICE_FEEDS = {
    'BTC/USD': 'f9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b',
    'ETH/USD': 'ca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6'
}

# OHLC Time intervals for data aggregation
OHLC_TIME_INTERVALS = [
    "1s",   # 1 second
    "10s",  # 10 seconds
    "30s",  # 30 seconds
    "1m",   # 1 minute
    "5m",   # 5 minutes
    "15m",  # 15 minutes
    "30m",  # 30 minutes
    "1h",   # 1 hour
    "4h",   # 4 hours
    "1d",   # 1 day
    "1w",   # 1 week
    "1M"    # 1 month
]

# Default number of historical bars to send on subscription
DEFAULT_HISTORY_LIMIT = 100