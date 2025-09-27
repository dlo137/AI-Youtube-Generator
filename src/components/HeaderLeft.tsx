import React, { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useModal } from '../contexts/ModalContext';
import HeaderDropdown from './HeaderDropdown';

export default function HeaderLeft() {
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const router = useRouter();
  const {
    setIsAboutModalVisible,
    setIsContactModalVisible,
    setIsBillingModalVisible,
    setIsBillingManagementModalVisible,
  } = useModal();

  const handleAbout = () => {
    router.push('/(tabs)/profile');
    setTimeout(() => setIsAboutModalVisible(true), 100);
  };

  const handleContact = () => {
    router.push('/(tabs)/profile');
    setTimeout(() => setIsContactModalVisible(true), 100);
  };

  const handleUpgrade = () => {
    router.push('/(tabs)/profile');
    setTimeout(() => setIsBillingModalVisible(true), 100);
  };

  const handleBilling = () => {
    router.push('/(tabs)/profile');
    setTimeout(() => setIsBillingManagementModalVisible(true), 100);
  };

  return (
    <>
      <TouchableOpacity
        style={{ marginLeft: 15, padding: 5 }}
        onPress={() => setIsDropdownVisible(true)}
      >
        <Text style={{ color: '#fff', fontSize: 32 }}>≡</Text>
      </TouchableOpacity>

      <HeaderDropdown
        isVisible={isDropdownVisible}
        onClose={() => setIsDropdownVisible(false)}
        onAbout={handleAbout}
        onContact={handleContact}
        onUpgrade={handleUpgrade}
        onBilling={handleBilling}
      />
    </>
  );
}