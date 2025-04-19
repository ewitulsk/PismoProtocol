import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Button as PaperButton } from 'react-native-paper'; // Using Paper Button for consistency

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  testID?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: object; // Allow passing custom styles
}

// This uses React Native Paper's Button for consistency with other buttons
const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  testID,
  loading = false,
  disabled = false,
  style = {},
}) => {
  return (
    <PaperButton
      mode="contained" // Gives it a primary look
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      loading={loading}
      disabled={disabled || loading}
      style={[styles.button, style]} // Combine default and custom styles
      labelStyle={styles.text} // Style the text inside
    >
      {title}
    </PaperButton>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20, // Rounded corners
    minWidth: 150, // Ensure a minimum size
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10, // Add some margin
  },
  text: {
    color: '#ffffff', // White text for contained button
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default PrimaryButton; 