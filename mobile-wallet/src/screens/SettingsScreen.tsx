import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Modal, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { IconButton, Button, Portal, Provider as PaperProvider } from 'react-native-paper'; // Use Portal for Modal
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/RootStack';
import { useWallet, Network, Wallet } from '../context/WalletContext';

// Helper to shorten address
const shortenAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

type SettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

const SettingsScreen = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const { state, dispatch, activeNetwork, activeWallet } = useWallet();
  const [networkModalVisible, setNetworkModalVisible] = useState(false);
  const [walletModalVisible, setWalletModalVisible] = useState(false);

  const handleSelectNetwork = (networkId: string) => {
    dispatch({ type: 'SET_ACTIVE_NETWORK', payload: networkId });
    setNetworkModalVisible(false);
    // TODO: Persist to async storage (already handled in context reducer)
  };

  const handleSelectWallet = (walletId: string) => {
    dispatch({ type: 'SET_ACTIVE_WALLET', payload: walletId });
    setWalletModalVisible(false);
    // TODO: Persist (handled in context)
  };

  return (
    <PaperProvider> {/* Need PaperProvider for Portal */} 
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <IconButton
            icon="home"
            size={24}
            onPress={() => navigation.navigate('Home')}
            accessibilityRole="button"
            testID="settings-home"
          />
          <Text style={styles.title} accessibilityRole="header">Settings</Text>
        </View>

        <View style={styles.content}>
          <TouchableOpacity
            style={styles.selectorPill}
            onPress={() => setNetworkModalVisible(true)}
            testID="network-selector"
            accessibilityRole="button"
          >
            <Text style={styles.selectorText}>Network: {activeNetwork?.name ?? 'N/A'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.selectorPill}
            onPress={() => setWalletModalVisible(true)}
            testID="wallet-selector"
            accessibilityRole="button"
          >
            <Text style={styles.selectorText}>Wallet: {activeWallet ? shortenAddress(activeWallet.address) : 'N/A'}</Text>
          </TouchableOpacity>

          <View style={styles.spacer} />

          <Button
            mode="contained"
            onPress={() => navigation.navigate('NewWallet')}
            testID="settings-new-wallet"
            accessibilityRole="button"
            style={styles.newWalletButton}
          >
            New Wallet / Manage
          </Button>
        </View>

        {/* Network Selection Modal (using Portal for better layering) */}
        <Portal>
          <Modal
            animationType="slide"
            transparent={true}
            visible={networkModalVisible}
            onRequestClose={() => setNetworkModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Network</Text>
                <FlatList
                  data={state.networks}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.modalItem}
                      onPress={() => handleSelectNetwork(item.id)}
                      accessibilityRole="button"
                    >
                      <Text style={item.id === state.activeNetworkId ? styles.modalItemSelected : styles.modalItemText}>
                        {item.name}
                      </Text>
                      {/* Optional: Show RPC URL */} 
                      {/* <Text style={styles.modalItemSubText}>{item.rpcUrl}</Text> */}
                    </TouchableOpacity>
                  )}
                />
                 {/* TODO: Add "Add Custom Network" button (Section 4.3) */}
                <Button onPress={() => setNetworkModalVisible(false)}>Close</Button>
              </View>
            </View>
          </Modal>
        </Portal>

        {/* Wallet Selection Modal */}
        <Portal>
          <Modal
            animationType="slide"
            transparent={true}
            visible={walletModalVisible}
            onRequestClose={() => setWalletModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Wallet</Text>
                <FlatList
                  data={state.wallets}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.modalItem}
                      onPress={() => handleSelectWallet(item.id)}
                      accessibilityRole="button"
                    >
                      <Text style={item.id === state.activeWalletId ? styles.modalItemSelected : styles.modalItemText}>
                          {item.name || `Wallet ${item.id.substring(0, 4)}`}
                      </Text>
                       <Text style={styles.modalItemSubText}>{shortenAddress(item.address)}</Text>
                    </TouchableOpacity>
                  )}
                   ListEmptyComponent={<Text style={styles.modalEmptyText}>No wallets created yet.</Text>}
                />
                <Button onPress={() => setWalletModalVisible(false)}>Close</Button>
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
    paddingTop: 10, // Adjust as needed for status bar
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
    padding: 20,
    alignItems: 'center',
  },
  selectorPill: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 20,
    width: '90%',
    alignItems: 'center',
  },
  selectorText: {
    fontSize: 16,
  },
  spacer: {
    flex: 1,
  },
  newWalletButton: {
    width: '90%',
    paddingVertical: 8,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%', // Limit height
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalItemText: {
    fontSize: 16,
  },
   modalItemSubText: {
    fontSize: 12,
    color: 'gray',
    marginTop: 2,
  },
  modalItemSelected: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'blue', // Highlight selected
  },
   modalEmptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: 'gray',
  },
});

export default SettingsScreen; 