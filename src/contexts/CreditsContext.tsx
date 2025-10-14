import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { getCredits, CreditsInfo } from '../utils/subscriptionStorage';

interface CreditsContextType {
  credits: CreditsInfo;
  refreshCredits: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);

export function CreditsProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState<CreditsInfo>({ current: 0, max: 0 });
  const isRefreshing = useRef(false);

  const refreshCredits = async () => {
    // Prevent multiple simultaneous refreshes
    if (isRefreshing.current) {
      return;
    }

    isRefreshing.current = true;

    try {
      const creditsInfo = await getCredits();
      setCredits(creditsInfo);
    } catch (error) {
      console.error('Error refreshing credits:', error);
    } finally {
      isRefreshing.current = false;
    }
  };

  useEffect(() => {
    refreshCredits();
  }, []);

  return (
    <CreditsContext.Provider value={{ credits, refreshCredits }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  const context = useContext(CreditsContext);
  if (context === undefined) {
    throw new Error('useCredits must be used within a CreditsProvider');
  }
  return context;
}
