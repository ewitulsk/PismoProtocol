import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface AddressChipProps {
  address: string;
}

const AddressChip: React.FC<AddressChipProps> = ({ address }) => {
  const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return (
    <View style={styles.chip}>
      {/* The spec says "Active Address: {shortAddr}" but usually the label is outside the chip component */}
      {/* Adjust if the label MUST be inside */}
      <Text style={styles.chipText} accessibilityLabel={`Active Address: ${address}`}>
         {shortAddr}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    backgroundColor: '#e0e0e0', // Light grey background
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16, // Pill shape
    alignSelf: 'flex-start', // Don't stretch
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
});

export default AddressChip; 