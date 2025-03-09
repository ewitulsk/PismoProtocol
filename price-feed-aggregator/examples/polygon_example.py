#!/usr/bin/env python
"""
Example script demonstrating how to use the Polygon client to fetch historical bar data.
"""
import os
import asyncio
import datetime
from dotenv import load_dotenv

from src.clients.polygon_client import PolygonClient

# Load environment variables from .env file if it exists
load_dotenv()

async def main():
    # Initialize the Polygon client
    # The API key will be read from the POLYGON_API_KEY environment variable
    client = PolygonClient()
    
    # Start the client session
    await client.start()
    
    try:
        # Define parameters for fetching historical bar data
        ticker = "X:BTCUSD"  # Bitcoin/USD
        from_date = datetime.date.today() - datetime.timedelta(days=30)  # 30 days ago
        to_date = datetime.date.today()  # Today
        
        # Get daily bars for the last 30 days
        daily_bars = await client.get_crypto_bars(
            ticker=ticker,
            multiplier=1,
            timespan="day",
            from_date=from_date,
            to_date=to_date,
            limit=30,
            sort="desc"  # Most recent first
        )
        
        # Print out the results
        print(f"Retrieved {len(daily_bars)} daily bars for {ticker}")
        for bar in daily_bars:
            print(f"Date: {bar.timestamp.date()}, Open: {bar.open}, High: {bar.high}, "
                  f"Low: {bar.low}, Close: {bar.close}, Volume: {bar.volume}")
            
        # Get hourly bars for the last 24 hours
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        hourly_bars = await client.get_crypto_bars(
            ticker=ticker,
            multiplier=1,
            timespan="hour",
            from_date=yesterday,
            to_date=datetime.date.today(),
            limit=24,
        )
        
        print(f"\nRetrieved {len(hourly_bars)} hourly bars for {ticker}")
        for bar in hourly_bars:
            print(f"Time: {bar.timestamp}, Open: {bar.open}, Close: {bar.close}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Always close the client session
        await client.stop()

if __name__ == "__main__":
    asyncio.run(main())