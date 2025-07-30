/**
 * Toast Notification System for Real-time Updates
 * 
 * Provides user-friendly notifications for WebSocket events
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, Bell } from 'lucide-react';

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number; // Duration in ms, 0 means persistent
  timestamp: Date;
}

interface ToastContextType {
  notifications: ToastNotification[];
  addNotification: (notification: Omit<ToastNotification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = React.createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Toast Provider Component
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  const addNotification = useCallback((notification: Omit<ToastNotification, 'id' | 'timestamp'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: ToastNotification = {
      ...notification,
      id,
      timestamp: new Date(),
      duration: notification.duration ?? 5000, // Default 5 seconds
    };

    setNotifications(prev => [newNotification, ...prev.slice(0, 4)]); // Keep max 5 notifications

    // Auto-remove after duration
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <ToastContext.Provider value={{ notifications, addNotification, removeNotification, clearAll }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

// Toast Container Component
const ToastContainer: React.FC = () => {
  const { notifications } = useToast();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <ToastItem key={notification.id} notification={notification} />
      ))}
    </div>
  );
};

// Individual Toast Item Component
const ToastItem: React.FC<{ notification: ToastNotification }> = ({ notification }) => {
  const { removeNotification } = useToast();
  const [isExiting, setIsExiting] = useState(false);

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => {
      removeNotification(notification.id);
    }, 300); // Animation duration
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getBorderColor = () => {
    switch (notification.type) {
      case 'success':
        return 'border-green-500';
      case 'error':
        return 'border-red-500';
      case 'warning':
        return 'border-yellow-500';
      case 'info':
      default:
        return 'border-blue-500';
    }
  };

  return (
    <div
      className={`
        transform transition-all duration-300 ease-in-out
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
        bg-gray-800 border-l-4 ${getBorderColor()} rounded-lg shadow-lg p-4
        max-w-sm w-full
      `}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-100 mb-1">
            {notification.title}
          </h4>
          <p className="text-sm text-gray-300 leading-relaxed">
            {notification.message}
          </p>
          <div className="text-xs text-gray-500 mt-2">
            {notification.timestamp.toLocaleTimeString()}
          </div>
        </div>
        <button
          onClick={handleRemove}
          className="flex-shrink-0 text-gray-400 hover:text-gray-200 transition-colors p-1 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Convenience hook for real-time oracle notifications
export const useOracleToasts = () => {
  const { addNotification } = useToast();

  const notifyOracleCreated = useCallback((oracleName: string, ownerAddress?: string) => {
    addNotification({
      type: 'success',
      title: 'Oracle Created',
      message: `New oracle "${oracleName}" has been created${ownerAddress ? ` by ${ownerAddress.slice(0, 8)}...` : ''}.`,
      duration: 6000,
    });
  }, [addNotification]);

  const notifyOracleInvalidated = useCallback((oracleId: string) => {
    addNotification({
      type: 'warning',
      title: 'Oracle Invalidated',
      message: `Oracle ${oracleId.slice(0, 8)}... has been marked as invalid.`,
      duration: 6000,
    });
  }, [addNotification]);

  const notifyPriceFeedCreated = useCallback((feedName: string, oracleId: string) => {
    addNotification({
      type: 'info',
      title: 'Price Feed Added',
      message: `New price feed "${feedName}" added to oracle ${oracleId.slice(0, 8)}....`,
      duration: 6000,
    });
  }, [addNotification]);

  const notifyPriceFeedInvalidated = useCallback((feedId: string) => {
    addNotification({
      type: 'warning',
      title: 'Price Feed Invalidated',
      message: `Price feed ${feedId.slice(0, 8)}... has been marked as invalid.`,
      duration: 6000,
    });
  }, [addNotification]);

  const notifyConnectionEstablished = useCallback(() => {
    addNotification({
      type: 'success',
      title: 'Real-time Updates Active',
      message: 'Connected to live oracle updates.',
      duration: 3000,
    });
  }, [addNotification]);

  const notifyConnectionLost = useCallback(() => {
    addNotification({
      type: 'error',
      title: 'Connection Lost',
      message: 'Real-time updates temporarily unavailable. Reconnecting...',
      duration: 0, // Persistent until connection is restored
    });
  }, [addNotification]);

  return {
    notifyOracleCreated,
    notifyOracleInvalidated,
    notifyPriceFeedCreated,
    notifyPriceFeedInvalidated,
    notifyConnectionEstablished,
    notifyConnectionLost,
  };
};
