import React, { useState, useEffect } from 'react';
import OrderbookVisualizer from './components/OrderbookVisualizer';
import { useWebSocket } from './hooks/useWebSocket';
import { BookState, TopOfBook } from './types';

const WEBSOCKET_URL = 'ws://localhost:8080';

const App: React.FC = () => {
  const {
    connected,
    bookStates,
    topOfBooks,
    error,
    subscribe,
    unsubscribe,
    createMarket,
    createBuy,
    createSell,
  } = useWebSocket(WEBSOCKET_URL);

  const [selectedMarket, setSelectedMarket] = useState<string>('BTC_USD');
  const [showControls, setShowControls] = useState(false);

  // Available markets
  const markets = ['BTC_USD', 'ETH_USD', 'SOL_USD'];

  useEffect(() => {
    if (connected) {
      // Subscribe to book state and top of book for selected market
      subscribe(selectedMarket, 'BookState');
      subscribe(selectedMarket, 'TopOfBook');
    }

    return () => {
      if (connected) {
        unsubscribe(selectedMarket, 'BookState');
        unsubscribe(selectedMarket, 'TopOfBook');
      }
    };
  }, [connected, selectedMarket, subscribe, unsubscribe]);

  const handleMarketChange = (newMarket: string) => {
    if (connected) {
      // Unsubscribe from current market
      unsubscribe(selectedMarket, 'BookState');
      unsubscribe(selectedMarket, 'TopOfBook');
      
      // Subscribe to new market
      setSelectedMarket(newMarket);
      subscribe(newMarket, 'BookState');
      subscribe(newMarket, 'TopOfBook');
    }
  };

  const handleCreateOrder = (type: 'buy' | 'sell', price: string, amount: string) => {
    if (connected && selectedMarket) {
      if (type === 'buy') {
        createBuy(selectedMarket, price, amount);
      } else {
        createSell(selectedMarket, price, amount);
      }
    }
  };

  const currentBookState = bookStates.get(selectedMarket) || null;
  const currentTopOfBook = topOfBooks.get(selectedMarket) || null;

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#1a1a1a', 
      color: '#fff',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        padding: '10px 20px', 
        backgroundColor: '#2a2a2a', 
        borderBottom: '1px solid #444',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0 }}>Orderbook Visualizer</h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Connection Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: connected ? '#4CAF50' : '#f44336'
            }} />
            <span>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>

          {/* Market Selector */}
          <select
            value={selectedMarket}
            onChange={(e) => handleMarketChange(e.target.value)}
            style={{
              padding: '8px',
              backgroundColor: '#1a1a1a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '4px'
            }}
          >
            {markets.map(market => (
              <option key={market} value={market}>{market}</option>
            ))}
          </select>

          {/* Controls Toggle */}
          <button
            onClick={() => setShowControls(!showControls)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4CAF50',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {showControls ? 'Hide' : 'Show'} Controls
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: '10px 20px',
          backgroundColor: '#f44336',
          color: '#fff',
          textAlign: 'center'
        }}>
          Error: {error}
        </div>
      )}

      {/* Manual Controls */}
      {showControls && (
        <div style={{
          padding: '20px',
          backgroundColor: '#2a2a2a',
          borderBottom: '1px solid #444'
        }}>
          <h3>Manual Order Controls</h3>
          <p style={{ marginBottom: '10px', color: '#ccc' }}>
            Create manual orders for testing. The automated tester is already running.
          </p>
          
          <div style={{ display: 'flex', gap: '20px' }}>
            <OrderForm
              title="Create Buy Order"
              buttonColor="#4CAF50"
              onSubmit={(price, amount) => handleCreateOrder('buy', price, amount)}
              disabled={!connected}
            />
            
            <OrderForm
              title="Create Sell Order"
              buttonColor="#f44336"
              onSubmit={(price, amount) => handleCreateOrder('sell', price, amount)}
              disabled={!connected}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <OrderbookVisualizer
        bookState={currentBookState}
        topOfBook={currentTopOfBook}
      />
    </div>
  );
};

// Helper component for order forms
interface OrderFormProps {
  title: string;
  buttonColor: string;
  onSubmit: (price: string, amount: string) => void;
  disabled: boolean;
}

const OrderForm: React.FC<OrderFormProps> = ({ title, buttonColor, onSubmit, disabled }) => {
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (price && amount) {
      onSubmit(price, amount);
      setPrice('');
      setAmount('');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <h4>{title}</h4>
      <input
        type="number"
        placeholder="Price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        style={{
          padding: '8px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          border: '1px solid #444',
          borderRadius: '4px'
        }}
        disabled={disabled}
      />
      <input
        type="number"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{
          padding: '8px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          border: '1px solid #444',
          borderRadius: '4px'
        }}
        disabled={disabled}
      />
      <button
        type="submit"
        style={{
          padding: '8px 16px',
          backgroundColor: disabled ? '#666' : buttonColor,
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
        disabled={disabled}
      >
        Submit
      </button>
    </form>
  );
};

export default App;