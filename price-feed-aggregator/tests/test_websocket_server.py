import asyncio
import json
import logging
import pytest
import pytest_asyncio
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime

from src.services.websocket_server import PriceFeedWebsocketServer, FeedSubscription
from src.clients.pyth_client import PythHermesClient
from src.clients.polygon_client import PolygonStreamClient
from src.models.price_feed_models import PythPriceData, PriceStatus, PolygonBarData


@pytest_asyncio.fixture
async def mock_pyth_client():
    """
    Fixture for a mock PythHermesClient.
    """
    client = AsyncMock(spec=PythHermesClient)
    client.subscribe_to_feed = AsyncMock()
    client.unsubscribe_from_feed = AsyncMock()
    client.register_price_callback = AsyncMock()
    client.get_available_price_feeds = AsyncMock(return_value=[
        {"id": "feed1", "symbol": "BTC/USD"},
        {"id": "feed2", "symbol": "ETH/USD"}
    ])
    
    return client

@pytest_asyncio.fixture
async def mock_polygon_client():
    """
    Fixture for a mock PolygonStreamClient.
    """
    client = AsyncMock(spec=PolygonStreamClient)
    client.subscribe_to_ticker = AsyncMock()
    client.unsubscribe_from_ticker = AsyncMock()
    client.register_bar_callback = AsyncMock()
    
    return client


@pytest_asyncio.fixture
async def mock_websocket():
    """
    Fixture for a mock websocket connection.
    """
    ws = AsyncMock()
    ws.send = AsyncMock()
    ws.close = AsyncMock()
    
    return ws


@pytest_asyncio.fixture
async def websocket_server(mock_pyth_client, mock_polygon_client):
    """
    Fixture for a PriceFeedWebsocketServer with mock clients.
    """
    # We need to patch the websocket_server class init to prevent register_callback
    # from being called before we can assert it
    with patch('src.services.websocket_server.PriceFeedWebsocketServer.__init__', 
               return_value=None):
        server = PriceFeedWebsocketServer()
        
        # Manually set the attributes
        server.pyth_client = mock_pyth_client
        server.polygon_client = mock_polygon_client
        server.host = "localhost"
        server.port = 8765
        server.polygon_data_max_age = 300  # 5 minutes
        server.logger = logging.getLogger("websocket_server")
        server.clients = {}
        server.client_subscriptions = {}
        server.feed_subscribers = {}
        server.active_pyth_feeds = set()
        server.active_polygon_tickers = set()
        server.latest_pyth_data = {}
        server.latest_polygon_data = {}
        server.feed_to_ticker_map = {}
        server.server = None
    
    # Manually register the callbacks
    server.pyth_client.register_price_callback(server.handle_pyth_price_update)
    server.polygon_client.register_bar_callback(server.handle_polygon_bar_update)
    
    # Now the callback should be registered
    assert mock_pyth_client.register_price_callback.called
    assert mock_polygon_client.register_bar_callback.called
    
    # Patch websocket server methods to prevent actual server start
    with patch.object(server, 'start', AsyncMock()):
        yield server


class TestPriceFeedWebsocketServer:
    """Tests for the PriceFeedWebsocketServer class."""
    
    @pytest.mark.asyncio
    async def test_handle_client_connection(self, websocket_server, mock_websocket):
        """Test handling a new client connection."""
        # Mock the process_client_message method
        websocket_server.process_client_message = AsyncMock()
        
        # Simulate a client connection with a message
        mock_websocket.__aiter__.return_value = ["test_message"]
        
        # Call the handler
        await websocket_server.handle_client_connection(mock_websocket, "/")
        
        # Check that a welcome message was sent
        mock_websocket.send.assert_called_once()
        
        # Check that process_client_message was called with the right arguments
        # Extract the client_id from the first call to mock_websocket.send
        sent_message = json.loads(mock_websocket.send.call_args[0][0])
        client_id = sent_message["client_id"]
        websocket_server.process_client_message.assert_called_once_with(client_id, "test_message")
    
    @pytest.mark.asyncio
    async def test_process_client_message_subscribe(self, websocket_server):
        """Test processing a subscribe message from a client."""
        # Create a test client
        client_id = "test_client"
        websocket_server.clients[client_id] = AsyncMock()
        websocket_server.client_subscriptions[client_id] = set()
        
        # Mock the subscribe_client_to_feed method
        websocket_server.subscribe_client_to_feed = AsyncMock()
        
        # Process a subscribe message
        await websocket_server.process_client_message(
            client_id, 
            json.dumps({"type": "subscribe", "feed_id": "feed1"})
        )
        
        # Check that subscribe_client_to_feed was called with the right arguments
        # The expected argument is now a FeedSubscription object
        expected_subscription = FeedSubscription(feed_id="feed1", ticker=None, timespan="minute")
        websocket_server.subscribe_client_to_feed.assert_called_once_with(client_id, expected_subscription)
    
    @pytest.mark.asyncio
    async def test_process_client_message_unsubscribe(self, websocket_server):
        """Test processing an unsubscribe message from a client."""
        # Create a test client
        client_id = "test_client"
        feed_subscription = FeedSubscription(feed_id="feed1", ticker=None, timespan="minute")
        websocket_server.clients[client_id] = AsyncMock()
        websocket_server.client_subscriptions[client_id] = set([feed_subscription])
        
        # Mock the unsubscribe_client_from_feed method
        websocket_server.unsubscribe_client_from_feed = AsyncMock()
        
        # Process an unsubscribe message
        await websocket_server.process_client_message(
            client_id, 
            json.dumps({"type": "unsubscribe", "feed_id": "feed1"})
        )
        
        # Check that unsubscribe_client_from_feed was called with the right arguments
        websocket_server.unsubscribe_client_from_feed.assert_called_once_with(client_id, feed_subscription)
    
    @pytest.mark.asyncio
    async def test_subscribe_client_to_feed(self, websocket_server, mock_pyth_client):
        """Test subscribing a client to a feed."""
        # Create a test client
        client_id = "test_client"
        websocket_server.clients[client_id] = AsyncMock()
        websocket_server.client_subscriptions[client_id] = set()
        
        # Create a feed subscription
        feed_subscription = FeedSubscription(feed_id="feed1", ticker=None, timespan="minute")
        
        # Subscribe client to feed
        await websocket_server.subscribe_client_to_feed(client_id, feed_subscription)
        
        # Check that the subscription was added
        assert feed_subscription in websocket_server.client_subscriptions[client_id]
        assert client_id in websocket_server.feed_subscribers["feed1"]
        assert "feed1" in websocket_server.active_pyth_feeds
        
        # Check that Pyth client was asked to subscribe
        mock_pyth_client.subscribe_to_feed.assert_called_once_with("feed1")
        
        # Check that confirmation was sent to client
        websocket_server.clients[client_id].send.assert_called_once()
        sent_message = json.loads(websocket_server.clients[client_id].send.call_args[0][0])
        assert sent_message["type"] == "subscription_confirmed"
        assert sent_message["feed_id"] == "feed1"
    
    @pytest.mark.asyncio
    async def test_unsubscribe_client_from_feed(self, websocket_server, mock_pyth_client):
        """Test unsubscribing a client from a feed."""
        # Create a test client with an active subscription
        client_id = "test_client"
        feed_id = "feed1"
        
        # Create a feed subscription
        feed_subscription = FeedSubscription(feed_id=feed_id, ticker=None, timespan="minute")
        
        websocket_server.clients[client_id] = AsyncMock()
        websocket_server.client_subscriptions[client_id] = set([feed_subscription])
        websocket_server.feed_subscribers[feed_id] = set([client_id])
        websocket_server.active_pyth_feeds.add(feed_id)
        
        # Unsubscribe client from feed
        await websocket_server.unsubscribe_client_from_feed(client_id, feed_subscription)
        
        # Check that the subscription was removed
        assert feed_subscription not in websocket_server.client_subscriptions[client_id]
        assert feed_id not in websocket_server.feed_subscribers  # Should be completely removed
        assert feed_id not in websocket_server.active_pyth_feeds
        
        # Check that Pyth client was asked to unsubscribe
        mock_pyth_client.unsubscribe_from_feed.assert_called_once_with(feed_id)
        
        # Check that confirmation was sent to client
        websocket_server.clients[client_id].send.assert_called_once()
        sent_message = json.loads(websocket_server.clients[client_id].send.call_args[0][0])
        assert sent_message["type"] == "unsubscription_confirmed"
        assert sent_message["feed_id"] == feed_id
    
    @pytest.mark.asyncio
    async def test_handle_pyth_price_update(self, websocket_server):
        """Test handling a price update from Pyth."""
        # Create test clients and subscriptions
        client_id1 = "client1"
        client_id2 = "client2"
        feed_id = "feed1"
        
        websocket_server.clients = {
            client_id1: AsyncMock(),
            client_id2: AsyncMock()
        }
        websocket_server.feed_subscribers = {
            feed_id: set([client_id1, client_id2])
        }
        
        # Mock the send_to_client method
        websocket_server.send_to_client = AsyncMock()
        
        # Create a price update
        price_data = PythPriceData(
            id=feed_id,
            price=50000.0,
            conf=10.0,
            expo=-8,
            publish_time=datetime.now(),
            status=PriceStatus.TRADING,
            ema_price=50100.0,
            ema_conf=11.0,
            raw_price_data={}
        )
        
        # Handle the price update
        await websocket_server.handle_pyth_price_update(price_data)
        
        # Check that send_to_client was called for both clients
        assert websocket_server.send_to_client.call_count == 2
        
        # Verify the update format
        for call in websocket_server.send_to_client.call_args_list:
            client = call[0][0]
            message = call[0][1]
            
            # Check that the client is one of our test clients
            assert client in [client_id1, client_id2]
            
            # Parse the message and check its structure
            update = json.loads(message)
            assert update["type"] == "price_update"
            
            # The output format is now AggregatedPriceData, not PriceFeedUpdate
            assert update["data"]["symbol"] == feed_id  # Since we don't have a proper mapping, feed_id is used as symbol
            assert update["data"]["price"] == 0.0005  # 50000.0 * 10^-8
            assert "pyth_data" in update["data"]
            assert update["data"]["pyth_data"]["id"] == feed_id
            assert update["data"]["source_priority"] == "pyth"