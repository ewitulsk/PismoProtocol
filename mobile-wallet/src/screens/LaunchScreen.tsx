import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/RootStack';
import { useWallet } from '../context/WalletContext';

type LaunchScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Launch'>;

const LaunchScreen = () => {
  const navigation = useNavigation<LaunchScreenNavigationProp>();
  const { state } = useWallet();

  useEffect(() => {
    // Don't navigate until loading is finished
    if (!state.isLoading) {
        if (state.wallets.length === 0) {
          navigation.replace('NewWallet'); // Use replace so user can't go back to Launch
        } else {
          navigation.replace('Home');
        }
    }
  }, [state.wallets, state.isLoading, navigation]);

  // Render a loading indicator while checking state
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LaunchScreen; 