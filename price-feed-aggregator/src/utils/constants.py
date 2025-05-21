"""
Constants used throughout the price feed aggregator application.
"""

# Standard Pyth price feeds
PRICE_FEEDS = {
    'BTC/USD': 'f9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b',
    'ETH/USD': 'ca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6',
    'SUI/USD': '50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266',
    'USDC/USD': '41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722',
    'CMG/USD': '62ee9f77ad0b8217d6bf259a86e846ff078890c1bcf3c93cc83f9025ba5a0d0c',
    'TSLA/USD': '7dac7cafc583cc4e1ce5c6772c444b8cd7addeecd5bedb341dfa037c770ae71e',
    'NVDA/USD': '16e38262485de554be6a09b0c1d4d86eb2151a7af265f867d769dee359cec32e',
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