import os
import pytest
import json
from datetime import datetime, date, timedelta
from unittest.mock import patch, MagicMock, AsyncMock

from src.clients.polygon_client import PolygonClient
from src.models.price_feed_models import PolygonBarData


@pytest.fixture
def mock_polygon_response():
    """Sample response from Polygon API for testing."""
    return {
        "ticker": "X:BTCUSD",
        "status": "OK",
        "queryCount": 2,
        "resultsCount": 2,
        "adjusted": True,
        "results": [
            {
                "v": 12345.67,  # volume
                "o": 41000.25,  # open
                "c": 42500.75,  # close
                "h": 42800.50,  # high
                "l": 40900.00,  # low
                "t": 1643673600000,  # timestamp (ms)
                "n": 28761  # number of trades
            },
            {
                "v": 9876.54,
                "o": 42500.75,
                "c": 43100.25,
                "h": 43500.00,
                "l": 42200.50,
                "t": 1643760000000,
                "n": 25432
            }
        ],
        "request_id": "test-request-123"
    }


@pytest.fixture
def polygon_client():
    """Create a Polygon client with a mock API key."""
    with patch.dict(os.environ, {"POLYGON_API_KEY": "test_api_key"}):
        client = PolygonClient()
        return client


@pytest.mark.asyncio
async def test_polygon_client_initialization():
    """Test that the Polygon client initializes correctly."""
    # Test with API key provided directly
    client1 = PolygonClient(api_key="test_key_1")
    assert client1.api_key == "test_key_1"
    
    # Test with API key from environment variable
    with patch.dict(os.environ, {"POLYGON_API_KEY": "test_key_2"}):
        client2 = PolygonClient()
        assert client2.api_key == "test_key_2"
    
    # Test missing API key
    with patch.dict(os.environ, clear=True):
        with pytest.raises(ValueError):
            PolygonClient()


@pytest.mark.asyncio
async def test_get_crypto_bars(polygon_client, mock_polygon_response):
    """Test fetching crypto bar data."""
    # Mock the client session
    mock_session = MagicMock()
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value=mock_polygon_response)
    mock_session.get.return_value.__aenter__.return_value = mock_response
    
    polygon_client.session = mock_session
    
    # Call the method
    bars = await polygon_client.get_crypto_bars(
        ticker="X:BTCUSD",
        multiplier=1,
        timespan="day",
        from_date="2022-02-01",
        to_date="2022-02-02",
        limit=10
    )
    
    # Verify the results
    assert len(bars) == 2
    assert isinstance(bars[0], PolygonBarData)
    assert bars[0].ticker == "X:BTCUSD"
    assert bars[0].open == 41000.25
    assert bars[0].close == 42500.75
    assert bars[0].high == 42800.50
    assert bars[0].low == 40900.00
    assert bars[0].volume == 12345.67
    assert bars[0].number_of_trades == 28761
    # Timestamp conversion check (ms to datetime)
    assert bars[0].timestamp == datetime.fromtimestamp(1643673600000 / 1000)


@pytest.mark.asyncio
async def test_get_crypto_bars_error_handling(polygon_client):
    """Test error handling in get_crypto_bars."""
    # Set up mock response for this test
    mock_session = MagicMock()
    error_response = MagicMock()
    error_response.status = 401
    error_response.text = AsyncMock(return_value="Unauthorized: Invalid API key")
    mock_session.get.return_value.__aenter__.return_value = error_response
    
    polygon_client.session = mock_session
    
    # Call the method
    bars = await polygon_client.get_crypto_bars(
        ticker="X:BTCUSD",
        from_date="2022-02-01",
        to_date="2022-02-02"
    )
    
    # Verify that an empty list is returned on error
    assert bars == []


@pytest.mark.asyncio
async def test_date_formatting(polygon_client):
    """Test that different date formats are handled correctly."""
    # Create a mocked session that captures the URL
    mock_session = MagicMock()
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value={"status": "OK", "results": []})
    mock_session.get.return_value.__aenter__.return_value = mock_response
    
    polygon_client.session = mock_session
    
    # Test with string date
    await polygon_client.get_crypto_bars(
        ticker="X:BTCUSD",
        from_date="2022-01-01",
        to_date="2022-01-31"
    )
    
    # Get the URL from the first call
    call_args1 = mock_session.get.call_args_list[0][0][0]
    assert "2022-01-01/2022-01-31" in call_args1
    
    # Reset mock
    mock_session.get.reset_mock()
    
    # Test with datetime objects
    from_dt = datetime(2022, 2, 1, 12, 0, 0)
    to_dt = datetime(2022, 2, 28, 12, 0, 0)
    
    await polygon_client.get_crypto_bars(
        ticker="X:BTCUSD",
        from_date=from_dt,
        to_date=to_dt
    )
    
    # Get the URL from the second call
    call_args2 = mock_session.get.call_args_list[0][0][0]
    assert "2022-02-01/2022-02-28" in call_args2
    
    # Reset mock
    mock_session.get.reset_mock()
    
    # Test with date objects
    from_d = date(2022, 3, 1)
    to_d = date(2022, 3, 31)
    
    await polygon_client.get_crypto_bars(
        ticker="X:BTCUSD",
        from_date=from_d,
        to_date=to_d
    )
    
    # Get the URL from the third call
    call_args3 = mock_session.get.call_args_list[0][0][0]
    assert "2022-03-01/2022-03-31" in call_args3