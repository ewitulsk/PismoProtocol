"use client";

import React, { createContext, useState, useContext, useCallback, ReactNode } from 'react';

interface RefreshContextType {
  refreshCount: number;
  triggerClientRefresh: () => void;
}

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export const RefreshProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [refreshCount, setRefreshCount] = useState(0);

  const triggerClientRefresh = useCallback(() => {
    setRefreshCount(prevCount => prevCount + 1);
    console.log("Client refresh triggered. New count:", refreshCount + 1);
  }, [refreshCount]); // Include refreshCount in dependency array

  return (
    <RefreshContext.Provider value={{ refreshCount, triggerClientRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
};

export const useRefresh = (): RefreshContextType => {
  const context = useContext(RefreshContext);
  if (context === undefined) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return context;
};
