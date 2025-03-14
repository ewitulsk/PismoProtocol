import pytest
from datetime import datetime
from src.models.price_feed_models import (
    PythPriceData, 
    PolygonBarData, 
    AggregatedPriceData,
    PriceStatus,
    PriceSource
)


def test_aggregated_price_data_from_pyth():
    """Test creating AggregatedPriceData from Pyth data."""
    # Create sample Pyth data
    pyth_data = PythPriceData(
        id="test_id",
        price=10000000,  # 1.0 with exponent -7
        conf=100000,     # 0.01 with exponent -7
        expo=-7,
        publish_time=datetime(2023, 1, 1, 12, 0, 0),
        status=PriceStatus.TRADING,
        raw_price_data={}
    )
    
    # Create aggregated data
    aggregated = AggregatedPriceData.from_pyth(pyth_data, "TEST/USD")
    
    # Verify the result
    assert aggregated.symbol == "TEST/USD"
    assert aggregated.timestamp == datetime(2023, 1, 1, 12, 0, 0)
    assert aggregated.price == 1.0  # 10000000 * 10^-7
    assert aggregated.confidence == 0.01  # 100000 * 10^-7
    assert aggregated.source_priority == PriceSource.PYTH
    assert aggregated.has_pyth_data
    assert not aggregated.has_polygon_data
    assert aggregated.pyth_data == pyth_data
    assert aggregated.polygon_data is None


def test_aggregated_price_data_from_polygon():
    """Test creating AggregatedPriceData from Polygon data."""
    # Create sample Polygon data
    polygon_data = PolygonBarData(
        ticker="X:TESTUSD",
        timestamp=datetime(2023, 1, 1, 12, 0, 0),
        open=0.98,
        high=1.05,
        low=0.97,
        close=1.02,
        volume=1000.0,
        raw_data={}
    )
    
    # Create aggregated data
    aggregated = AggregatedPriceData.from_polygon(polygon_data)
    
    # Verify the result
    assert aggregated.symbol == "TEST/USD"  # Extracted from X:TESTUSD
    assert aggregated.timestamp == datetime(2023, 1, 1, 12, 0, 0)
    assert aggregated.price == 1.02  # Close price
    assert aggregated.confidence is None  # Polygon doesn't provide confidence
    assert aggregated.source_priority == PriceSource.POLYGON
    assert not aggregated.has_pyth_data
    assert aggregated.has_polygon_data
    assert aggregated.pyth_data is None
    assert aggregated.polygon_data == polygon_data


def test_aggregated_price_data_combine_sources():
    """Test combining Pyth and Polygon data sources."""
    # Create sample data
    pyth_data = PythPriceData(
        id="test_id",
        price=10000000,  # 1.0 with exponent -7
        conf=100000,     # 0.01 with exponent -7
        expo=-7,
        publish_time=datetime(2023, 1, 1, 12, 0, 0),
        status=PriceStatus.TRADING,
        raw_price_data={}
    )
    
    polygon_data = PolygonBarData(
        ticker="X:TESTUSD",
        timestamp=datetime(2023, 1, 1, 11, 0, 0),  # 1 hour earlier
        open=0.98,
        high=1.05,
        low=0.97,
        close=1.02,
        volume=1000.0,
        raw_data={}
    )
    
    # Combine with default weights (0.6 Pyth, 0.4 Polygon)
    combined = AggregatedPriceData.combine_sources(
        symbol="TEST/USD",
        pyth_data=pyth_data,
        polygon_data=polygon_data
    )
    
    # Verify the result
    assert combined.symbol == "TEST/USD"
    assert combined.timestamp == datetime(2023, 1, 1, 12, 0, 0)  # Latest timestamp
    
    # Price should be weighted: (1.0 * 0.6) + (1.02 * 0.4) = 1.008
    assert abs(combined.price - 1.008) < 0.0001
    
    assert combined.confidence == 0.01  # From Pyth
    assert combined.source_priority == PriceSource.PYTH
    assert combined.has_pyth_data
    assert combined.has_polygon_data
    
    # Test with different weights
    custom_weighted = AggregatedPriceData.combine_sources(
        symbol="TEST/USD",
        pyth_data=pyth_data,
        polygon_data=polygon_data,
        pyth_weight=0.3,
        polygon_weight=0.7
    )
    
    # Price should be weighted: (1.0 * 0.3) + (1.02 * 0.7) = 1.014
    assert abs(custom_weighted.price - 1.014) < 0.0001
    assert custom_weighted.source_priority == PriceSource.POLYGON  # Changed because weights changed


def test_aggregated_price_data_with_single_source():
    """Test combining when only one source is available."""
    # Create sample data
    pyth_data = PythPriceData(
        id="test_id",
        price=10000000,  # 1.0 with exponent -7
        conf=100000,     # 0.01 with exponent -7
        expo=-7,
        publish_time=datetime(2023, 1, 1, 12, 0, 0),
        status=PriceStatus.TRADING,
        raw_price_data={}
    )
    
    # Combine with only Pyth data
    pyth_only = AggregatedPriceData.combine_sources(
        symbol="TEST/USD",
        pyth_data=pyth_data
    )
    
    assert pyth_only.price == 1.0
    assert pyth_only.source_priority == PriceSource.PYTH
    
    # Create polygon data
    polygon_data = PolygonBarData(
        ticker="X:TESTUSD",
        timestamp=datetime(2023, 1, 1, 11, 0, 0),
        open=0.98,
        high=1.05,
        low=0.97,
        close=1.02,
        volume=1000.0,
        raw_data={}
    )
    
    # Combine with only Polygon data
    polygon_only = AggregatedPriceData.combine_sources(
        symbol="TEST/USD",
        polygon_data=polygon_data
    )
    
    assert polygon_only.price == 1.02
    assert polygon_only.source_priority == PriceSource.POLYGON


def test_weight_normalization():
    """Test that weights are normalized correctly."""
    # Create sample data
    pyth_data = PythPriceData(
        id="test_id",
        price=10000000,  # 1.0 with exponent -7
        conf=100000,     # 0.01 with exponent -7
        expo=-7,
        publish_time=datetime(2023, 1, 1, 12, 0, 0),
        status=PriceStatus.TRADING,
        raw_price_data={}
    )
    
    polygon_data = PolygonBarData(
        ticker="X:TESTUSD",
        timestamp=datetime(2023, 1, 1, 11, 0, 0),
        open=0.98,
        high=1.05,
        low=0.97,
        close=1.02,
        volume=1000.0,
        raw_data={}
    )
    
    # Use unnormalized weights that don't sum to 1.0
    combined = AggregatedPriceData.combine_sources(
        symbol="TEST/USD",
        pyth_data=pyth_data,
        polygon_data=polygon_data,
        pyth_weight=3,  # 3/8 = 0.375
        polygon_weight=5  # 5/8 = 0.625
    )
    
    # Price should be weighted by normalized values:
    # (1.0 * 0.375) + (1.02 * 0.625) = 0.375 + 0.6375 = 1.0125
    assert abs(combined.price - 1.0125) < 0.0001