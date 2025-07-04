import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BookState, TopOfBook, OrderbookEntry } from '../types';

interface OrderbookVisualizerProps {
  bookState: BookState | null;
  topOfBook: TopOfBook | null;
}

const OrderbookVisualizer: React.FC<OrderbookVisualizerProps> = ({ bookState, topOfBook }) => {
  const [selectedMarket, setSelectedMarket] = useState<string>('');

  useEffect(() => {
    if (bookState && !selectedMarket) {
      setSelectedMarket(bookState.market_id);
    }
  }, [bookState, selectedMarket]);

  const processedData = useMemo(() => {
    if (!bookState) return { buyOrders: [], sellOrders: [], maxTotal: 0 };

    const buyOrders: OrderbookEntry[] = [];
    const sellOrders: OrderbookEntry[] = [];

    let buyTotal = 0;
    let sellTotal = 0;

    // Process buy orders (sorted by price descending)
    bookState.buy_orders
      .map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
        total: 0,
        percentage: 0,
      }))
      .sort((a, b) => b.price - a.price)
      .forEach((order) => {
        buyTotal += order.amount;
        buyOrders.push({ ...order, total: buyTotal });
      });

    // Process sell orders (sorted by price ascending)
    bookState.sell_orders
      .map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
        total: 0,
        percentage: 0,
      }))
      .sort((a, b) => a.price - b.price)
      .forEach((order) => {
        sellTotal += order.amount;
        sellOrders.push({ ...order, total: sellTotal });
      });

    const maxTotal = Math.max(buyTotal, sellTotal);

    // Calculate percentages
    buyOrders.forEach(order => {
      order.percentage = maxTotal > 0 ? (order.total / maxTotal) * 100 : 0;
    });

    sellOrders.forEach(order => {
      order.percentage = maxTotal > 0 ? (order.total / maxTotal) * 100 : 0;
    });

    return { buyOrders, sellOrders, maxTotal };
  }, [bookState]);

  const combinedData = useMemo(() => {
    const { buyOrders, sellOrders } = processedData;
    
    // Combine buy and sell orders for the chart
    const combined = [
      ...buyOrders.map(order => ({
        ...order,
        side: 'buy',
        displayPrice: order.price.toFixed(2),
        displayAmount: order.amount.toFixed(4),
        displayTotal: order.total.toFixed(4),
      })),
      ...sellOrders.map(order => ({
        ...order,
        side: 'sell',
        displayPrice: order.price.toFixed(2),
        displayAmount: order.amount.toFixed(4),
        displayTotal: order.total.toFixed(4),
      })),
    ].sort((a, b) => a.price - b.price);

    return combined;
  }, [processedData]);

  const currentPrice = useMemo(() => {
    if (!topOfBook || !topOfBook.highest_buy || !topOfBook.lowest_sell) return null;
    
    const highestBuy = parseFloat(topOfBook.highest_buy);
    const lowestSell = parseFloat(topOfBook.lowest_sell);
    
    return (highestBuy + lowestSell) / 2;
  }, [topOfBook]);

  const spread = useMemo(() => {
    if (!topOfBook || !topOfBook.highest_buy || !topOfBook.lowest_sell) return null;
    
    const highestBuy = parseFloat(topOfBook.highest_buy);
    const lowestSell = parseFloat(topOfBook.lowest_sell);
    
    return lowestSell - highestBuy;
  }, [topOfBook]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: '#2a2a2a',
          border: '1px solid #444',
          borderRadius: '4px',
          padding: '8px',
          color: '#fff',
        }}>
          <p style={{ margin: 0 }}>{`Price: $${data.displayPrice}`}</p>
          <p style={{ margin: 0 }}>{`Amount: ${data.displayAmount}`}</p>
          <p style={{ margin: 0 }}>{`Total: ${data.displayTotal}`}</p>
          <p style={{ margin: 0 }}>{`Side: ${data.side}`}</p>
        </div>
      );
    }
    return null;
  };

  if (!bookState) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>No orderbook data available</h2>
        <p>Waiting for connection...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#1a1a1a', color: '#fff' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1>Orderbook Visualizer</h1>
        <h2>Market: {bookState.market_id}</h2>
        
        {currentPrice && (
          <div style={{ 
            display: 'flex', 
            gap: '20px', 
            marginBottom: '20px',
            padding: '10px',
            backgroundColor: '#2a2a2a',
            borderRadius: '4px'
          }}>
            <div>
              <strong>Current Price: ${currentPrice.toFixed(2)}</strong>
            </div>
            {spread && (
              <div>
                <strong>Spread: ${spread.toFixed(2)}</strong>
              </div>
            )}
            {topOfBook?.highest_buy && (
              <div>
                <strong>Highest Buy: ${parseFloat(topOfBook.highest_buy).toFixed(2)}</strong>
              </div>
            )}
            {topOfBook?.lowest_sell && (
              <div>
                <strong>Lowest Sell: ${parseFloat(topOfBook.lowest_sell).toFixed(2)}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Orderbook Table */}
        <div style={{ flex: 1 }}>
          <h3>Order Book</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Buy Orders */}
            <div style={{ flex: 1 }}>
              <h4 style={{ color: '#4CAF50' }}>Buy Orders</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#2a2a2a' }}>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {processedData.buyOrders.slice(0, 10).map((order, index) => (
                    <tr key={index} style={{ backgroundColor: '#1a1a1a' }}>
                      <td style={{ padding: '4px', textAlign: 'right', color: '#4CAF50' }}>
                        ${order.price.toFixed(2)}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>
                        {order.amount.toFixed(4)}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>
                        {order.total.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sell Orders */}
            <div style={{ flex: 1 }}>
              <h4 style={{ color: '#f44336' }}>Sell Orders</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#2a2a2a' }}>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {processedData.sellOrders.slice(0, 10).map((order, index) => (
                    <tr key={index} style={{ backgroundColor: '#1a1a1a' }}>
                      <td style={{ padding: '4px', textAlign: 'right', color: '#f44336' }}>
                        ${order.price.toFixed(2)}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>
                        {order.amount.toFixed(4)}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>
                        {order.total.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Liquidity Chart */}
        <div style={{ flex: 1 }}>
          <h3>Liquidity Distribution</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={combinedData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis 
                dataKey="displayPrice" 
                tick={{ fill: '#fff' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                tick={{ fill: '#fff' }}
                label={{ value: 'Amount', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                {combinedData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.side === 'buy' ? '#4CAF50' : '#f44336'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default OrderbookVisualizer;