import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ModalContextType {
  isAboutModalVisible: boolean;
  setIsAboutModalVisible: (visible: boolean) => void;
  isContactModalVisible: boolean;
  setIsContactModalVisible: (visible: boolean) => void;
  isBillingModalVisible: boolean;
  setIsBillingModalVisible: (visible: boolean) => void;
  isBillingManagementModalVisible: boolean;
  setIsBillingManagementModalVisible: (visible: boolean) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isAboutModalVisible, setIsAboutModalVisible] = useState(false);
  const [isContactModalVisible, setIsContactModalVisible] = useState(false);
  const [isBillingModalVisible, setIsBillingModalVisible] = useState(false);
  const [isBillingManagementModalVisible, setIsBillingManagementModalVisible] = useState(false);

  return (
    <ModalContext.Provider
      value={{
        isAboutModalVisible,
        setIsAboutModalVisible,
        isContactModalVisible,
        setIsContactModalVisible,
        isBillingModalVisible,
        setIsBillingModalVisible,
        isBillingManagementModalVisible,
        setIsBillingManagementModalVisible,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}