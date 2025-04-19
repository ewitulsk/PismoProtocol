import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, RefreshControl, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { IconButton, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/RootStack';
import { useWallet } from '../context/WalletContext';
import AddressChip from '../components/AddressChip';
import SuiLogo from '../components/SuiLogo';
import PrimaryButton from '../components/PrimaryButton';
import QRScannerModal from '../components/QRScannerModal';
import { copyToClipboard } from '../utils/clipboard';
import { fetchBalance } from '../utils/sui'; // Placeholder

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { activeWallet, activeNetwork } = useWallet();
  const [balance, setBalance] = useState<string>('Loading...');
  const [isScannerVisible, setScannerVisible] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBalance = async () => {
    if (activeWallet && activeNetwork) {
      try {
        // Placeholder: Replace with actual RPC call
        const fetchedBalance = await fetchBalance(activeWallet.address, activeNetwork.rpcUrl);
        setBalance(fetchedBalance);
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        setBalance('Error');
      }
    } else {
      setBalance('N/A');
    }
  };

  useEffect(() => {
    loadBalance();
    // TODO: Implement balance refresh interval (Section 4.2)
  }, [activeWallet, activeNetwork]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadBalance();
    setRefreshing(false);
  }, [activeWallet, activeNetwork]);

  const handleCopyAddress = () => {
    if (activeWallet) {
      copyToClipboard(activeWallet.address);
      setSnackbarVisible(true);
    }
  };

  const handleScanComplete = (data: string) => {
    setScannerVisible(false);
    console.log('Scanned Address:', data); // Placeholder
    // TODO: Navigate to Send flow with the scanned address (Section 4.1)
    // Example: navigation.navigate('SendAmount', { recipientAddress: data });
    alert(`Scanned Address (TODO: Send Flow): ${data}`);
  };

  const shortAddress = activeWallet
    ? `${activeWallet.address.slice(0, 6)}...${activeWallet.address.slice(-4)}`
    : 'No Wallet';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
          <View style={styles.header}>
            <IconButton
              icon="menu"
              size={24}
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              testID="home-menu"
            />
            {/* Potential Title if needed */}
          </View>

          <View style={styles.content}>
            {activeWallet && (
              <View style={styles.addressSection}>
                <AddressChip address={activeWallet.address} />
                <TouchableOpacity onPress={handleCopyAddress} testID="copy-address" accessibilityRole="button">
                    <Text style={styles.copyButton}>Copy</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.logoContainer}>
              <SuiLogo size={100} />
            </View>

            <View style={styles.balanceBox}>
              <Text style={styles.balanceText}>Sui: {balance}</Text>
            </View>

            <View style={styles.spacer} />

            <PrimaryButton
              title="Scan QR"
              onPress={() => setScannerVisible(true)}
              testID="scan-qr"
            />
          </View>
      </ScrollView>

      <QRScannerModal
        visible={isScannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanComplete={handleScanComplete}
      />

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={Snackbar.DURATION_SHORT}
      >
        Address copied to clipboard!
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#fff', // Basic background
    },
    container: {
        flexGrow: 1, // Needed for ScrollView content layout
        // justifyContent: 'space-between',
        // alignItems: 'center',
        padding: 20,
    },
    header: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        marginBottom: 20,
    },
    content: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between', // Pushes scanner to bottom
    },
    addressSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        width: '100%',
        paddingHorizontal: 10, // Prevent touching edges
    },
    copyButton: {
        marginLeft: 10,
        color: 'blue', // Basic styling
        fontWeight: 'bold',
    },
    logoContainer: {
        marginVertical: 40, // Add space around logo
    },
    balanceBox: {
        borderWidth: 1,
        borderColor: '#ccc',
        padding: 20,
        borderRadius: 8,
        marginBottom: 30,
    },
    balanceText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    spacer: {
        flex: 1, // Pushes QR button down
    },
});

export default HomeScreen; 