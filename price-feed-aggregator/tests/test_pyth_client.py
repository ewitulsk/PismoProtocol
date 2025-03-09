# This file is no longer used since we're now using the threaded Pyth client
# These tests will be replaced with tests for the threaded Pyth client

import pytest

# Skip all tests in this file
pytestmark = pytest.mark.skip(reason="Pyth client has been replaced by threaded Pyth client")


@pytest.fixture
def mock_price_data():
    """Fixture for mock price data received from the Pyth websocket."""
    return {
        "type": "price_update",
        "price_feed": {
            "id": "test_feed_id",
            "price": 1000.50,
            "conf": 0.1,
            "expo": -8,
            "publish_time": 1630000000,
            "status": "trading",
            "ema_price": 1001.2,
            "ema_conf": 0.2
        }
    }


@pytest_asyncio.fixture
async def mock_sse_response():
    """
    Fixture for a mock SSE response.
    """
    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.close = AsyncMock()
    
    # Set up content to simulate SSE stream
    mock_content = AsyncMock()
    mock_resp.content = mock_content
    return mock_resp


@pytest_asyncio.fixture
async def mock_session(mock_sse_response):
    """
    Fixture for a mock aiohttp ClientSession.
    """
    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=mock_sse_response)
    mock_session.close = AsyncMock()
    
    return mock_session


@pytest_asyncio.fixture
async def pyth_client(mock_session, mock_sse_response):
    """
    Fixture for a PythHermesClient with mocked session and SSE response.
    """
    with patch('aiohttp.ClientSession', return_value=mock_session):
        client = PythHermesClient()
        client.session = mock_session
        client.sse_response = mock_sse_response
        client.is_running = True
        
        yield client
        
        # Clean up
        client.is_running = False
        if client.sse_response:
            client.sse_response.close()


class TestPythHermesClient:
    """Tests for the PythHermesClient class."""
    
    @pytest.mark.asyncio
    async def test_subscribe_to_feed(self, pyth_client, mock_sse_response):
        """Test subscribing to a price feed."""
        # Mock the _connect_sse method to avoid actual connection attempts
        pyth_client._connect_sse = AsyncMock()
        
        await pyth_client.subscribe_to_feed("test_feed_id")
        
        # Check that the feed was added to subscribed_feeds
        assert "test_feed_id" in pyth_client.subscribed_feeds
        
        # Check that the SSE response was closed to force reconnection with new feed
        mock_sse_response.close.assert_called_once()
        
        # Check that _connect_sse was called to reconnect with the new subscription
        pyth_client._connect_sse.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_unsubscribe_from_feed(self, pyth_client, mock_sse_response):
        """Test unsubscribing from a price feed."""
        # Mock the _connect_sse method to avoid actual connection attempts
        pyth_client._connect_sse = AsyncMock()
        
        # First subscribe to a feed
        pyth_client.subscribed_feeds.add("test_feed_id")
        
        # Then unsubscribe
        await pyth_client.unsubscribe_from_feed("test_feed_id")
        
        # Check that the feed was removed from subscribed_feeds
        assert "test_feed_id" not in pyth_client.subscribed_feeds
        
        # Check that the SSE response was closed to force reconnection
        mock_sse_response.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_process_message(self, pyth_client, mock_price_data):
        """Test processing a price update message."""
        # Create a mock callback
        mock_callback = AsyncMock()
        pyth_client.register_price_callback(mock_callback)
        
        # Add the feed to subscribed feeds
        pyth_client.subscribed_feeds.add("test_feed_id")
        
        # Create an SSE-formatted message with the expected Hermes SSE format
        sse_message = {
            "parsed": [
                {
                    "id": "test_feed_id",
                    "price": {
                        "price": 1000.50,
                        "conf": 0.1,
                        "expo": -8,
                        "publish_time": 1630000000
                    },
                    "ema_price": {
                        "price": 1001.2,
                        "conf": 0.2,
                        "expo": -8,
                        "publish_time": 1630000000
                    },
                    "status": "trading"
                }
            ]
        }
        
        # Process a message in SSE format
        await pyth_client._process_message(json.dumps(sse_message))
        
        # Check that the callback was called with the parsed price data
        mock_callback.assert_called_once()
        
        # Verify the parsed data matches what we expect
        parsed_data = mock_callback.call_args[0][0]
        assert isinstance(parsed_data, PythPriceData)
        assert parsed_data.id == "test_feed_id"
        assert parsed_data.price == 1000.50
        assert parsed_data.conf == 0.1
        assert parsed_data.expo == -8
        assert isinstance(parsed_data.publish_time, datetime)
        assert parsed_data.status == PriceStatus.TRADING
        assert parsed_data.ema_price == 1001.2
        assert parsed_data.ema_conf == 0.2
    
    @pytest.mark.asyncio
    async def test_parse_price_data(self, pyth_client):
        """Test parsing raw price data."""
        # Test with the new Hermes SSE format
        raw_data = {
            "id": "test_feed_id",
            "price": {
                "price": 1000.50,
                "conf": 0.1,
                "expo": -8,
                "publish_time": 1630000000
            },
            "ema_price": {
                "price": 1001.2,
                "conf": 0.2,
                "expo": -8,
                "publish_time": 1630000000
            },
            "status": "trading"
        }
        
        # Parse the data
        parsed_data = pyth_client._parse_price_data(raw_data)
        
        # Verify the parsed data
        assert parsed_data.id == "test_feed_id"
        assert parsed_data.price == 1000.50
        assert parsed_data.conf == 0.1
        assert parsed_data.expo == -8
        assert isinstance(parsed_data.publish_time, datetime)
        assert parsed_data.status == PriceStatus.TRADING
        assert parsed_data.ema_price == 1001.2
        assert parsed_data.ema_conf == 0.2
        
        # Test with the old flat format to ensure backward compatibility
        flat_data = {
            "id": "test_feed_id",
            "price": 1000.50,
            "conf": 0.1,
            "expo": -8,
            "publish_time": 1630000000,
            "status": "trading",
            "ema_price": 1001.2,
            "ema_conf": 0.2
        }
        
        # Parse the data
        parsed_flat = pyth_client._parse_price_data(flat_data)
        
        # Verify the parsed data
        assert parsed_flat.id == "test_feed_id"
        assert parsed_flat.price == 1000.50
        assert parsed_flat.conf == 0.1
        assert parsed_flat.expo == -8
        assert isinstance(parsed_flat.publish_time, datetime)
        assert parsed_flat.status == PriceStatus.TRADING
        assert parsed_flat.ema_price == 1001.2
        assert parsed_flat.ema_conf == 0.2
        
    @pytest.mark.asyncio
    async def test_get_available_price_feeds(self, pyth_client, mock_session):
        """Test retrieving available price feeds."""
        # Create a mock response that can be used directly (not in a context manager)
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value=[
            {"id": "feed1", "symbol": "BTC/USD"},
            {"id": "feed2", "symbol": "ETH/USD"}
        ])
        mock_response.release = AsyncMock()
        
        # Make the get method return our mock_response
        mock_session.get.return_value = mock_response
        
        # Call the method
        feeds = await pyth_client.get_available_price_feeds()
        
        # Verify the result
        assert len(feeds) == 2
        assert feeds[0]["id"] == "feed1" 
        assert feeds[0]["symbol"] == "BTC/USD"
        assert feeds[1]["id"] == "feed2"
        assert feeds[1]["symbol"] == "ETH/USD"
        
        # Verify the response was properly handled
        mock_response.json.assert_awaited_once()
        mock_response.release.assert_awaited_once()