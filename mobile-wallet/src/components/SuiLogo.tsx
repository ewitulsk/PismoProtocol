import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg'; // Make sure react-native-svg is installed

interface SuiLogoProps {
  size: number;
}

// Basic SVG path for the Sui droplet shape - replace with a more accurate one if available
const SUI_DROPLET_PATH = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z";
// Placeholder blue color
const SUI_COLOR = '#007bff'; 

const SuiLogo: React.FC<SuiLogoProps> = ({ size }) => {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Svg height={size * 0.6} width={size * 0.6} viewBox="0 0 24 24"> 
          {/* Using a generic placeholder path - REPLACE with actual Sui logo SVG data */}
          <Path d={SUI_DROPLET_PATH} fill={SUI_COLOR} />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f0f0', // Placeholder background for the circle
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden', // Ensure SVG stays within bounds
  },
});

export default SuiLogo; 