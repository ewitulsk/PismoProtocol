import { useState, useEffect, useRef, useCallback } from 'react';
import { ServerMessage, ClientMessage, BookState, TopOfBook } from '../types';

export const useWebSocket = (url: string) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [bookStates, setBookStates] = useState<Map<string, BookState>>(new Map());
  const [topOfBooks, setTopOfBooks] = useState<Map<string, TopOfBook>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'BookStateUpdate':
              if (message.book_state && message.market_id) {
                setBookStates(prev => new Map(prev).set(message.market_id!, message.book_state!));
              }
              break;
            case 'TopOfBookUpdate':
              if (message.top_of_book && message.market_id) {
                setTopOfBooks(prev => new Map(prev).set(message.market_id!, message.top_of_book!));
              }
              break;
            case 'Error':
              setError(message.message || 'Unknown error');
              break;
            case 'MarketCreated':
              console.log('Market created:', message.market_id);
              break;
            case 'OrderCreated':
              console.log('Order created:', message.trades?.length, 'trades');
              break;
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        setSocket(null);
        
        // Attempt to reconnect
        if (reconnectAttempts.current < 5) {
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Reconnecting... (attempt ${reconnectAttempts.current})`);
            connect();
          }, 2000 * reconnectAttempts.current);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('WebSocket connection error');
      };

      setSocket(ws);
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to connect to WebSocket server');
    }
  }, [url]);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (socket && connected) {
      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        console.error('Failed to send message:', err);
        setError('Failed to send message');
      }
    }
  }, [socket, connected]);

  const subscribe = useCallback((marketId: string, subscriptionType: 'BookState' | 'TopOfBook') => {
    sendMessage({
      type: 'Subscribe',
      subscription_type: subscriptionType,
      market_id: marketId,
    });
  }, [sendMessage]);

  const unsubscribe = useCallback((marketId: string, subscriptionType: 'BookState' | 'TopOfBook') => {
    sendMessage({
      type: 'Unsubscribe',
      subscription_type: subscriptionType,
      market_id: marketId,
    });
  }, [sendMessage]);

  const createMarket = useCallback((asset: string, buyCurrency: string) => {
    sendMessage({
      type: 'CreateMarket',
      asset,
      buy_currency: buyCurrency,
    });
  }, [sendMessage]);

  const createBuy = useCallback((marketId: string, price: string, amount: string) => {
    sendMessage({
      type: 'CreateBuy',
      market_id: marketId,
      price,
      amount,
    });
  }, [sendMessage]);

  const createSell = useCallback((marketId: string, price: string, amount: string) => {
    sendMessage({
      type: 'CreateSell',
      market_id: marketId,
      price,
      amount,
    });
  }, [sendMessage]);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [connect]);

  return {
    connected,
    bookStates,
    topOfBooks,
    error,
    subscribe,
    unsubscribe,
    createMarket,
    createBuy,
    createSell,
    sendMessage,
  };
};