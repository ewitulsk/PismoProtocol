import React, { useState } from 'react';
import { View, StyleSheet, Text, Alert, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { IconButton, Button, Portal, Provider as PaperProvider, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/RootStack';
import { useWallet, Wallet } from '../context/WalletContext';
import { generateMnemonic, importPrivateKey, importSeedPhrase } from '../utils/sui'; // Placeholders
import { validatePrivateKey, validateSeedPhrase } from '../utils/validation'; // Placeholders

type NewWalletScreenNavigationProp = StackNavigationProp<RootStackParamList, 'NewWallet'>;

const NewWalletScreen = () => {
  const navigation = useNavigation<NewWalletScreenNavigationProp>();
  const { dispatch, activeWallet } = useWallet(); // Get activeWallet to check for seed phrase existence
  const [importPkModalVisible, setImportPkModalVisible] = useState(false);
  const [importSeedModalVisible, setImportSeedModalVisible] = useState(false);
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [seedPhraseInput, setSeedPhraseInput] = useState('');
  const [walletNameInput, setWalletNameInput] = useState(''); // For naming wallets

  const handleGenerateNewWallet = () => {
    try {
      // Placeholder: Implement actual mnemonic generation
      const seed = generateMnemonic(24); // Generate 24 words
      // Navigate to SeedPhraseScreen to display and confirm backup
      navigation.navigate('SeedPhrase', { seed, mode: 'create' });
    } catch (error) {
      console.error("Mnemonic generation failed:", error);
      Alert.alert('Error', 'Could not generate a new wallet seed.');
    }
  };

  const handleImportPrivateKey = async () => {
    if (!validatePrivateKey(privateKeyInput)) {
      Alert.alert('Invalid Key', 'Please enter a valid private key (Hex or Base64).');
      return;
    }
    const name = walletNameInput.trim() || 'Imported PK Wallet'; // Default name
    try {
      // Placeholder: Implement actual key import and derivation
      const newWallet: Wallet = await importPrivateKey(privateKeyInput, name);
      dispatch({ type: 'ADD_WALLET', payload: newWallet });
      setPrivateKeyInput('');
      setWalletNameInput('');
      setImportPkModalVisible(false);
      navigation.goBack(); // Go back to Settings after import
      Alert.alert('Success', `Wallet "${name}" imported successfully.`);
    } catch (error) {
      console.error("Private key import failed:", error);
      Alert.alert('Import Failed', 'Could not import wallet from private key.');
    }
  };

  const handleImportSeedPhrase = async () => {
    const words = seedPhraseInput.trim().split(/\s+/);
    if (!validateSeedPhrase(words)) {
      Alert.alert('Invalid Phrase', 'Please enter a valid 12 or 24 word seed phrase.');
      return;
    }
    const name = walletNameInput.trim() || 'Imported Seed Wallet'; // Default name
    try {
        // Placeholder: Implement actual seed phrase import
        const newWallet: Wallet = await importSeedPhrase(words, name);
        dispatch({ type: 'ADD_WALLET', payload: newWallet });
        setSeedPhraseInput('');
        setWalletNameInput('');
        setImportSeedModalVisible(false);
        navigation.goBack(); // Go back to Settings
        Alert.alert('Success', `Wallet "${name}" imported successfully.`);
    } catch (error) {
        console.error("Seed phrase import failed:", error);
        Alert.alert('Import Failed', 'Could not import wallet from seed phrase.');
    }
  };

  const handleExportSeedPhrase = () => {
    if (activeWallet?.seedPhrase) {
      // Seed phrase should be securely retrieved here, not directly from context state ideally
      // For now, assuming it's available (INSECURE placeholder)
      const seed = activeWallet.seedPhrase.split(' '); 
      navigation.navigate('SeedPhrase', { seed, mode: 'view' });
    } else {
      Alert.alert('No Seed Phrase', 'The active wallet does not have an associated seed phrase (it might have been imported via private key).');
    }
  };

  const canExportSeed = !!activeWallet?.seedPhrase; // Check if active wallet has a seed phrase

  return (
    <PaperProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <IconButton
            icon="arrow-left"
            size={24}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            testID="nw-back"
          />
          <Text style={styles.title} accessibilityRole="header">New Wallet / Import</Text>
        </View>

        <View style={styles.content}>
          <Button
            mode="outlined"
            onPress={() => {setWalletNameInput(''); setImportPkModalVisible(true);}}
            testID="nw-import-pk"
            accessibilityRole="button"
            style={styles.button}
          >
            Import from Private Key
          </Button>

          <Button
            mode="outlined"
            onPress={() => {setWalletNameInput(''); setImportSeedModalVisible(true);}}
            testID="nw-import-seed"
            accessibilityRole="button"
            style={styles.button}
          >
            Import from Seed Phrase
          </Button>

          <Button
            mode="contained"
            onPress={handleGenerateNewWallet}
            testID="nw-generate"
            accessibilityRole="button"
            style={styles.button}
          >
            Generate New Wallet
          </Button>

          <Button
            mode="outlined"
            onPress={handleExportSeedPhrase}
            testID="nw-export"
            accessibilityRole="button"
            style={styles.button}
            disabled={!canExportSeed} // Disable if no seed phrase
          >
            Export Active Wallet Seed Phrase
          </Button>
        </View>

        {/* Import PK Modal */}
        <Portal>
          <Modal
            visible={importPkModalVisible}
            onRequestClose={() => setImportPkModalVisible(false)}
            animationType="slide"
            transparent={true}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                 <Text style={styles.modalTitle}>Import Private Key</Text>
                 <TextInput
                    label="Wallet Name (Optional)"
                    value={walletNameInput}
                    onChangeText={setWalletNameInput}
                    style={styles.input}
                 />
                 <TextInput
                    label="Private Key (Hex or Base64)"
                    value={privateKeyInput}
                    onChangeText={setPrivateKeyInput}
                    style={styles.input}
                    secureTextEntry // Hide key input
                    multiline
                 />
                 <Button mode="contained" onPress={handleImportPrivateKey} style={styles.modalButton}>Import</Button>
                 <Button onPress={() => setImportPkModalVisible(false)} style={styles.modalButton}>Cancel</Button>
              </View>
            </View>
          </Modal>
        </Portal>

        {/* Import Seed Phrase Modal */}
        <Portal>
           <Modal
            visible={importSeedModalVisible}
            onRequestClose={() => setImportSeedModalVisible(false)}
            animationType="slide"
            transparent={true}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                 <Text style={styles.modalTitle}>Import Seed Phrase</Text>
                  <TextInput
                    label="Wallet Name (Optional)"
                    value={walletNameInput}
                    onChangeText={setWalletNameInput}
                    style={styles.input}
                 />
                 <TextInput
                    label="Seed Phrase (12 or 24 words)"
                    value={seedPhraseInput}
                    onChangeText={setSeedPhraseInput}
                    style={styles.input}
                    multiline
                    numberOfLines={3}
                 />
                 <Button mode="contained" onPress={handleImportSeedPhrase} style={styles.modalButton}>Import</Button>
                 <Button onPress={() => setImportSeedModalVisible(false)} style={styles.modalButton}>Cancel</Button>
              </View>
            </View>
          </Modal>
        </Portal>

      </SafeAreaView>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  content: {
    flex: 1,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    width: '90%',
    marginVertical: 10,
    paddingVertical: 8,
  },
  // Modal Styles (similar to Settings)
  modalOverlay: {
    flex: 1,
    justifyContent: 'center', // Center modal vertically
    alignItems: 'center', // Center horizontally
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '90%', // Adjust width
    alignItems: 'center',
  },
   modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
      width: '100%',
      marginBottom: 15,
  },
  modalButton: {
      marginTop: 10,
      width: '80%',
  }
});

export default NewWalletScreen; 