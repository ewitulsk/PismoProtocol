#!/usr/bin/env python3
"""
Convenience script to run the Price Feed Aggregator service.
"""

import asyncio
import sys
from src.main import main

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutdown initiated. Exiting...")
        sys.exit(0)