import React, { useState } from 'react';
import { View, StyleSheet, Text, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { IconButton, TextInput, Button, Snackbar } from 'react-native-paper';
import { RootStackParamList } from '../navigation/RootStack';
import { useWallet } from '../context/WalletContext';
import { copyToClipboard } from '../utils/clipboard';
import { signPersonalMessage } from '../utils/sui'; // Placeholder
import { validateMessageData } from '../utils/validation'; // Placeholder

type SignMessageScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SignMsg'>;

const SignMessageScreen = () => {
  const navigation = useNavigation<SignMessageScreenNavigationProp>();
  const { activeWallet } = useWallet();
  const [messageData, setMessageData] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleSignMessage = async () => {
    if (!activeWallet || !activeWallet.privateKey) {
      Alert.alert('Error', 'No active wallet with private key found.');
      return;
    }
    if (!validateMessageData(messageData)) { // Placeholder validation
        Alert.alert('Invalid Data', 'Message data cannot be empty.');
        return;
    }

    setIsLoading(true);
    try {
      // Placeholder: Implement actual personal_sign equivalent
      const signature = await signPersonalMessage(messageData, activeWallet.privateKey);
      copyToClipboard(signature);
      setSnackbarMessage('Message signed & signature copied!');
      setSnackbarVisible(true);
      // Optionally clear data
      // setMessageData(''); 
    } catch (error) {
      console.error("Signing Error:", error);
      setSnackbarMessage('Failed to sign message.');
      setSnackbarVisible(true);
      Alert.alert('Signing Failed', 'Could not sign the message.');
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
          testID="sign-msg-back" // Good practice testID
        />
        <Text style={styles.title} accessibilityRole="header">Sign Message</Text>
      </View>

      <TextInput
        label="Message Data (UTF-8)"
        value={messageData}
        onChangeText={setMessageData}
        multiline
        numberOfLines={10}
        style={styles.input}
        testID="sign-msg-data" // Test ID inferred from SignTxScreen
        placeholder="Enter the message text to sign..."
        disabled={isLoading}
      />

      <Button
        mode="contained"
        onPress={handleSignMessage}
        loading={isLoading}
        disabled={!messageData || isLoading || !activeWallet?.privateKey}
        testID="sign-msg-button" // Test ID inferred
        accessibilityRole="button"
      >
        Sign Message
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
    maxHeight: '60%', // Prevent excessive growth
  },
});

export default SignMessageScreen; 