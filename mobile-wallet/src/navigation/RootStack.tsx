import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import NewWalletScreen from '../screens/NewWalletScreen';
import SeedPhraseScreen from '../screens/SeedPhraseScreen';
import SignTxScreen from '../screens/SignTxScreen';
import SignMessageScreen from '../screens/SignMessageScreen';
import LaunchScreen from '../screens/LaunchScreen';

export type RootStackParamList = {
  Launch: undefined;
  Home: undefined;
  Settings: undefined;
  NewWallet: undefined;
  SeedPhrase: { seed: string[]; mode: 'create' | 'view' }; // Specify params
  SignTx: undefined;
  SignMsg: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

const RootStack = () => {
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Launch" component={LaunchScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="NewWallet" component={NewWalletScreen} />
      <Stack.Screen name="SeedPhrase" component={SeedPhraseScreen} />
      <Stack.Screen name="SignTx" component={SignTxScreen} />
      <Stack.Screen name="SignMsg" component={SignMessageScreen} />
    </Stack.Navigator>
  );
};

export default RootStack; 