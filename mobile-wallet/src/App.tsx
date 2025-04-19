import 'react-native-gesture-handler'; // Must be at the top
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import RootStack from './navigation/RootStack';
import { WalletProvider } from './context/WalletContext';

export default function App() {
  return (
    <PaperProvider>
      <WalletProvider>
        <NavigationContainer>
          <RootStack />
          <StatusBar style="auto" />
        </NavigationContainer>
      </WalletProvider>
    </PaperProvider>
  );
} 