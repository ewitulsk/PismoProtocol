#!/usr/bin/env python
"""
Example script demonstrating how to combine data from Pyth and Polygon.
"""
import os
import sys
import asyncio
import datetime
from dotenv import load_dotenv

# Add the parent directory to the Python path so we can import 'src'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.clients.pyth_client import PythHermesClient
from src.clients.polygon_client import PolygonClient
from src.models.price_feed_models import AggregatedPriceData, PythPriceData, PolygonBarData

# Load environment variables from .env file if it exists
load_dotenv()

# Mock data for demonstration (in case you don't have real API access)
def create_mock_pyth_data() -> PythPriceData:
    """Create sample Pyth data for demonstration purposes."""
    from src.models.price_feed_models import PriceStatus
    
    return PythPriceData(
        id="0ff1e85c87e878eb9df30147b8a0769760af38e0c0c2be6b94e4116a517e4e4a",  # BTC/USD feed ID
        price=4268241000000,  # 42682.41 with exponent -8
        conf=242710000,       # 2.4271 with exponent -8
        expo=-8,
        publish_time=datetime.datetime.now(),
        status=PriceStatus.TRADING,
        ema_price=4265432000000,
        ema_conf=239851000,
        raw_price_data={"id": "0ff1e85c87e878eb9df30147b8a0769760af38e0c0c2be6b94e4116a517e4e4a"}
    )

def create_mock_polygon_data() -> PolygonBarData:
    """Create sample Polygon data for demonstration purposes."""
    return PolygonBarData(
        ticker="X:BTCUSD",
        timestamp=datetime.datetime.now(),
        open=42650.25,
        high=42750.80,
        low=42580.15,
        close=42695.30,
        volume=1250.45,
        vwap=42685.75,
        number_of_trades=3250,
        raw_data={"o": 42650.25, "h": 42750.80, "l": 42580.15, "c": 42695.30, "v": 1250.45}
    )

async def main():
    # Part 1: Using actual API clients
    use_real_apis = True  # Set to True if you have API keys
    
    if use_real_apis:
        # Initialize clients
        pyth_client = PythHermesClient()
        polygon_client = PolygonClient()
        
        # Start clients
        await pyth_client.start()
        await polygon_client.start()
        
        try:
            # Get BTC/USD data from both sources
            # For Pyth, we would typically subscribe to real-time updates,
            # but for this example, let's assume we already have data
            
            # For Polygon, get the latest daily bar
            today = datetime.date.today()
            yesterday = today - datetime.timedelta(days=1)
            
            polygon_bars = await polygon_client.get_crypto_bars(
                ticker="X:BTCUSD",
                multiplier=1,
                timespan="day",
                from_date=yesterday,
                to_date=today,
                limit=1
            )
            
            polygon_data = polygon_bars[0] if polygon_bars else None
            
            # For Pyth, we would get this from a callback after subscribing
            # For this example, let's use mock data
            pyth_data = create_mock_pyth_data()
            
            # Create aggregated data
            if pyth_data and polygon_data:
                aggregated_data = AggregatedPriceData.combine_sources(
                    symbol="BTC/USD",
                    pyth_data=pyth_data,
                    polygon_data=polygon_data
                )
                
                print_aggregated_data(aggregated_data)
                
        finally:
            # Close client sessions
            await pyth_client.stop()
            await polygon_client.stop()
    
    # Part 2: Using mock data for demonstration
    else:
        pyth_data = create_mock_pyth_data()
        polygon_data = create_mock_polygon_data()
        
        # Create aggregated data
        aggregated_data = AggregatedPriceData.combine_sources(
            symbol="BTC/USD",
            pyth_data=pyth_data, 
            polygon_data=polygon_data
        )
        
        print_aggregated_data(aggregated_data)
        
        # Demonstrate creating from single source
        pyth_only = AggregatedPriceData.from_pyth(pyth_data, "BTC/USD")
        polygon_only = AggregatedPriceData.from_polygon(polygon_data)
        
        print("\n=== Pyth Data Only ===")
        print_aggregated_data(pyth_only)
        
        print("\n=== Polygon Data Only ===")
        print_aggregated_data(polygon_only)
        
        # Demonstrate different weightings
        heavy_pyth = AggregatedPriceData.combine_sources(
            symbol="BTC/USD",
            pyth_data=pyth_data,
            polygon_data=polygon_data,
            pyth_weight=0.8,
            polygon_weight=0.2
        )
        
        heavy_polygon = AggregatedPriceData.combine_sources(
            symbol="BTC/USD",
            pyth_data=pyth_data,
            polygon_data=polygon_data,
            pyth_weight=0.2,
            polygon_weight=0.8
        )
        
        print("\n=== Weighted 80% Pyth, 20% Polygon ===")
        print_aggregated_data(heavy_pyth)
        
        print("\n=== Weighted 20% Pyth, 80% Polygon ===")
        print_aggregated_data(heavy_polygon)

def print_aggregated_data(data: AggregatedPriceData):
    """Print detailed information about aggregated price data."""
    print(f"Symbol: {data.symbol}")
    print(f"Timestamp: {data.timestamp}")
    print(f"Aggregated Price: ${data.price:.2f}")
    
    if data.confidence:
        print(f"Confidence: ±${data.confidence:.2f}")
        
    print(f"Primary Source: {data.source_priority}")
    
    if data.has_pyth_data:
        pyth = data.pyth_data
        print(f"  Pyth Price: ${pyth.price * (10 ** pyth.expo):.2f}")
        print(f"  Pyth Status: {pyth.status}")
        print(f"  Pyth Time: {pyth.publish_time}")
        
    if data.has_polygon_data:
        poly = data.polygon_data
        print(f"  Polygon Close: ${poly.close:.2f}")
        print(f"  Polygon Range: ${poly.low:.2f} - ${poly.high:.2f}")
        print(f"  Polygon Time: {poly.timestamp}")
        
if __name__ == "__main__":
    asyncio.run(main())