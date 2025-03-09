"""
Constants used throughout the price feed aggregator application.
"""

# Standard Pyth price feeds
PRICE_FEEDS = {
    'BTC/USD': 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    'ETH/USD': 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'
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