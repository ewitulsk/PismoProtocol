import React, { useState } from 'react';
import { View, StyleSheet, Text, Alert, FlatList, useWindowDimensions, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { IconButton, Button, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/RootStack';
import { copyToClipboard } from '../utils/clipboard';
import { useWallet } from '../context/WalletContext';
import { createWalletFromSeed } from '../utils/sui'; // Placeholder

type SeedPhraseScreenRouteProp = RouteProp<RootStackParamList, 'SeedPhrase'>;
type SeedPhraseScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SeedPhrase'>;

const SeedPhraseScreen = () => {
  const navigation = useNavigation<SeedPhraseScreenNavigationProp>();
  const route = useRoute<SeedPhraseScreenRouteProp>();
  const { dispatch } = useWallet();
  const { seed, mode } = route.params; // Seed is expected as string[]
  const { width } = useWindowDimensions();

  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false); // State for confirmation quiz
  const [quizWordIndex, setQuizWordIndex] = useState<number | null>(null); // Index of word to confirm
  const [quizInput, setQuizInput] = useState('');

  // Determine number of columns based on width
  const numColumns = width > 600 ? 3 : 2; // Example breakpoint for tablets

  const handleCopy = () => {
    copyToClipboard(seed.join(' '));
    setSnackbarVisible(true);
  };

  const handleOk = async () => {
    if (mode === 'create') {
        // Simple confirmation: Ask for one random word
        if (!showQuiz) {
            const randomIndex = Math.floor(Math.random() * seed.length);
            setQuizWordIndex(randomIndex);
            setShowQuiz(true);
            return; // Don't proceed until quiz is shown
        }

        if (quizInput.toLowerCase().trim() !== seed[quizWordIndex!]?.toLowerCase()) {
             Alert.alert('Incorrect Word', `The word at position ${quizWordIndex! + 1} does not match. Please double-check your backup.`);
             return;
        }

        // If quiz passed, create the wallet
        try {
            // Placeholder: Implement actual wallet creation from seed
            // Also prompt for wallet name here or use a default
            const name = 'Generated Wallet'; // TODO: Prompt for name (Section 4.4)
            const newWallet = await createWalletFromSeed(seed, name);
            dispatch({ type: 'ADD_WALLET', payload: newWallet });
            Alert.alert('Wallet Created', `Wallet "${name}" created and backed up successfully.`);
            // Pop back multiple screens to Settings, not just one
            navigation.popToTop(); // Go back to the start of the stack (Home)
        } catch (error) {
            console.error("Wallet creation from seed failed:", error);
            Alert.alert('Error', 'Could not create wallet from seed phrase.');
        }

    } else { // mode === 'view'
      navigation.goBack();
    }
  };

  const handleBack = () => {
    if (mode === 'create') {
      Alert.alert(
        'Are you sure?',
        'You haven\'t confirmed your seed phrase backup. If you go back now, you might lose access to this wallet forever.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go Back Anyway', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <IconButton
          icon="home"
          size={24}
          onPress={() => navigation.navigate('Home')}
          accessibilityRole="button"
          testID="seed-home"
        />
        <Text style={styles.title} accessibilityRole="header">
            {mode === 'create' ? 'Backup Your Seed Phrase' : 'View Seed Phrase'}
        </Text>
      </View>

      <Text style={styles.instructions}>
        {mode === 'create'
          ? 'Write down these words in order and keep them somewhere safe. This is the only way to recover your wallet.'
          : 'This is your recovery seed phrase. Keep it secret and safe.'
        }
      </Text>

      <View style={styles.gridContainer}>
        <FlatList
          data={seed}
          keyExtractor={(_, index) => index.toString()}
          numColumns={numColumns}
          renderItem={({ item, index }) => (
            <View style={[styles.wordItem, { width: `${100 / numColumns - 5}%` }]}>
              <Text style={styles.wordIndex}>{index + 1}.</Text>
              <Text style={styles.wordText}>{item}</Text>
            </View>
          )}
          contentContainerStyle={styles.flatlistContent}
          scrollEnabled
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.flatListStyle}
        />
      </View>

      {showQuiz && quizWordIndex !== null && (
          <View style={styles.quizContainer}>
              <Text style={styles.quizText}>Enter word #{quizWordIndex + 1}:</Text>
              <TextInput // Using react-native TextInput here is fine
                style={styles.quizInput}
                value={quizInput}
                onChangeText={setQuizInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
          </View>
      )}

      <View style={styles.buttonContainer}>
        <Button
          mode="outlined"
          onPress={handleCopy}
          testID="sp-copy"
          accessibilityRole="button"
          style={styles.button}
        >
          Copy Phrase
        </Button>
        <Button
          mode="contained"
          onPress={handleOk}
          testID="sp-ok"
          accessibilityRole="button"
          style={styles.button}
        >
          {mode === 'create' ? (showQuiz ? 'Confirm & Create Wallet' : 'Verify Backup') : 'OK'}
        </Button>
      </View>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={Snackbar.DURATION_SHORT}
      >
        Seed phrase copied to clipboard!
      </Snackbar>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  instructions: {
      padding: 20,
      textAlign: 'center',
      fontSize: 16,
      color: '#333',
  },
  gridContainer: {
      paddingHorizontal: 15,
      marginTop: 10,
      maxHeight: 300, // Cap height so it doesn't push other elements off screen
  },
  flatlistContent: {
      alignItems: 'center',
  },
  wordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 8,
    margin: 5,
    // width adjusted dynamically
  },
  wordIndex: {
    color: '#888',
    marginRight: 8,
    fontSize: 14,
    width: 25, // Fixed width for alignment
  },
  wordText: {
    fontSize: 16,
    fontWeight: '500',
  },
  quizContainer: {
      paddingHorizontal: 20,
      paddingVertical: 15,
      alignItems: 'center',
  },
  quizText: {
      fontSize: 16,
      marginBottom: 10,
  },
  quizInput: {
      borderWidth: 1,
      borderColor: '#ccc',
      borderRadius: 5,
      padding: 10,
      width: '80%',
      textAlign: 'center',
      fontSize: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  button: {
      width: '45%', // Adjust as needed
  },
  flatListStyle: {
      flexGrow: 0, // Don't automatically expand, respect maxHeight
  },
});

export default SeedPhraseScreen; 