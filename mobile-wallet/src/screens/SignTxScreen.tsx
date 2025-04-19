import React, { useState } from 'react';
import { View, StyleSheet, Text, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { IconButton, TextInput, Button, Snackbar } from 'react-native-paper';
import { RootStackParamList } from '../navigation/RootStack';
import { useWallet } from '../context/WalletContext';
import { copyToClipboard } from '../utils/clipboard';
import { signTransaction } from '../utils/sui'; // Placeholder
import { validateTxData } from '../utils/validation'; // Placeholder

type SignTxScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SignTx'>;

const SignTxScreen = () => {
  const navigation = useNavigation<SignTxScreenNavigationProp>();
  const { activeWallet } = useWallet();
  const [rawData, setRawData] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleSignTransaction = async () => {
    if (!activeWallet || !activeWallet.privateKey) {
      Alert.alert('Error', 'No active wallet with private key found.');
      return;
    }
     if (!validateTxData(rawData)) { // Placeholder validation
        Alert.alert('Invalid Data', 'BCS-encoded transaction data cannot be empty.');
        return;
    }

    setIsLoading(true);
    try {
      // Placeholder: Implement actual transaction signing
      const signature = await signTransaction(rawData, activeWallet.privateKey);
      copyToClipboard(signature); // Copy the resulting signature
      setSnackbarMessage('Transaction signed & signature copied!');
      setSnackbarVisible(true);
      // Optionally clear data or navigate away
      // setRawData(''); 
    } catch (error) {
      console.error("Signing Error:", error);
      setSnackbarMessage('Failed to sign transaction.');
      setSnackbarVisible(true);
      Alert.alert('Signing Failed', 'Could not sign the transaction data.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          testID="sign-tx-back" // Good practice testID
        />
        <Text style={styles.title} accessibilityRole="header">Sign Transaction</Text>
      </View>

      <TextInput
        label="Raw Transaction Data (BCS)"
        value={rawData}
        onChangeText={setRawData}
        multiline
        numberOfLines={10} // Adjust based on expected data size
        style={styles.input}
        testID="sign-tx-data" // As specified
        placeholder="Paste BCS-encoded tx data here..."
        disabled={isLoading}
      />

      <Button
        mode="contained"
        onPress={handleSignTransaction}
        loading={isLoading}
        disabled={!rawData || isLoading || !activeWallet?.privateKey}
        testID="sign-tx-button" // Test ID inferred
        accessibilityRole="button"
      >
        Sign Tx
      </Button>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={Snackbar.DURATION_SHORT}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    // Add safe area handling if needed, depends on header usage
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  input: {
    marginBottom: 20,
    maxHeight: '60%', // Prevent input from taking too much space
  },
});

export default SignTxScreen; 