"use client"

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  Download,
  MessageSquare,
  Clock,
  Database,
  AlertCircle
} from 'lucide-react';
import { ParsedWebSocketData } from '@/services/oracleWebSocketService';

interface WebSocketDebuggerProps {
  messages: ParsedWebSocketData[];
  isConnected: boolean;
}

const WebSocketDebugger: React.FC<WebSocketDebuggerProps> = ({ messages, isConnected }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ParsedWebSocketData | null>(null);

  const getMessageTypeColor = (type: string) => {
    switch (type) {
      case 'oracle_created':
        return 'border-green-500 text-green-400';
      case 'price_feed_created':
        return 'border-blue-500 text-blue-400';
      case 'oracle_invalidated':
        return 'border-red-500 text-red-400';
      case 'price_feed_invalidated':
        return 'border-orange-500 text-orange-400';
      case 'subscription_confirmed':
        return 'border-purple-500 text-purple-400';
      case 'error':
        return 'border-red-500 text-red-400';
      default:
        return 'border-gray-500 text-gray-400';
    }
  };

  const exportMessages = () => {
    const dataStr = JSON.stringify(messages, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `websocket-messages-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearMessages = () => {
    // This would need to be implemented in the parent component
    console.log('Clear messages requested');
  };

  if (!isExpanded) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              <CardTitle className="text-lg text-gray-100">WebSocket Debug Console</CardTitle>
              <Badge variant="outline" className={isConnected ? "border-green-500 text-green-400" : "border-red-500 text-red-400"}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </Badge>
              <Badge variant="outline" className="border-gray-600 text-gray-400">
                {messages.length} messages
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(true)}
              className="text-gray-400 hover:text-white"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            <CardTitle className="text-lg text-gray-100">WebSocket Debug Console</CardTitle>
            <Badge variant="outline" className={isConnected ? "border-green-500 text-green-400" : "border-red-500 text-red-400"}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
            <Badge variant="outline" className="border-gray-600 text-gray-400">
              {messages.length} messages
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={exportMessages}
              className="text-gray-400 hover:text-white"
              title="Export messages"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              className="text-gray-400 hover:text-white"
              title="Clear messages"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-white"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Message List */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Recent Messages</h3>
            <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>No messages received yet</p>
                  <p className="text-xs mt-1">Messages will appear here when they arrive</p>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedMessage === message
                        ? "bg-blue-900/30 border-blue-700"
                        : "bg-gray-800/50 border-gray-700 hover:bg-gray-800"
                    }`}
                    onClick={() => setSelectedMessage(message)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getMessageTypeColor(message.messageType)}`}
                      >
                        {message.messageType}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                    
                    {/* Quick preview of transformed data */}
                    {message.parsedData.oracle && (
                      <div className="text-xs text-gray-400">
                        Oracle: {message.parsedData.oracle.name || 'Unnamed'}
                      </div>
                    )}
                    {message.parsedData.priceFeed && (
                      <div className="text-xs text-gray-400">
                        Price Feed: {message.parsedData.priceFeed.name || 'Unnamed'}
                      </div>
                    )}
                    {message.parsedData.oracleId && !message.parsedData.oracle && (
                      <div className="text-xs text-gray-400">
                        Oracle ID: {message.parsedData.oracleId.slice(0, 20)}...
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Message Details */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Message Details</h3>
            {selectedMessage ? (
              <div className="space-y-4">
                {/* Raw Message */}
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Raw Message
                  </h4>
                  <div className="bg-gray-800 p-3 rounded-lg">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(selectedMessage.rawMessage, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Transformed Data */}
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Transformed Data
                  </h4>
                  <div className="bg-gray-800 p-3 rounded-lg">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(selectedMessage.parsedData, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Metadata */}
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Metadata</h4>
                  <div className="bg-gray-800 p-3 rounded-lg text-xs text-gray-300">
                    <div>Type: {selectedMessage.messageType}</div>
                    <div>Timestamp: {selectedMessage.timestamp.toISOString()}</div>
                    <div>Has Oracle: {selectedMessage.parsedData.oracle ? 'Yes' : 'No'}</div>
                    <div>Has Price Feed: {selectedMessage.parsedData.priceFeed ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Database className="w-8 h-8 mx-auto mb-2" />
                <p>Select a message to view details</p>
                <p className="text-xs mt-1">Click on a message from the list</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WebSocketDebugger;
