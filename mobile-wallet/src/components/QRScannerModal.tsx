import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, Text, Button, Alert } from 'react-native';
import { CameraView, Camera } from 'expo-camera';

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanComplete: (data: string) => void;
}

const QRScannerModal: React.FC<QRScannerModalProps> = ({ visible, onClose, onScanComplete }) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };

    if (visible) { // Only request permission when modal becomes visible
      getCameraPermissions();
    }
  }, [visible]);

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    // Here you might add validation to ensure it's a valid address format if needed
    onScanComplete(data);
  };

  if (hasPermission === null) {
    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={styles.centeredView}><Text>Requesting camera permission...</Text></View>
        </Modal>
    );
  }
  if (hasPermission === false) {
     return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={styles.centeredView}>
                <Text style={styles.permissionText}>No access to camera. Please enable camera permissions in your device settings.</Text>
                <Button title="Close" onPress={onClose} />
            </View>
        </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <CameraView
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'], // Only scan for QR codes
          }}
          style={StyleSheet.absoluteFillObject} // Fill the modal
        />
        {/* Optional: Add an overlay with a scanning box indicator */}
        <View style={styles.overlay}>
            <Text style={styles.scanText}>Scan QR Code</Text>
            <View style={styles.scanBox} />
        </View>
        <View style={styles.closeButtonContainer}>
          <Button title="Cancel" onPress={onClose} color="#fff" />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    backgroundColor: 'black', // Background for modal
  },
   centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
      textAlign: 'center',
      marginBottom: 20,
      fontSize: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', // Dimmed background
  },
  scanText: {
      color: 'white',
      fontSize: 18,
      fontWeight: 'bold',
      position: 'absolute',
      top: '15%',
  },
  scanBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 10,
  },
  closeButtonContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});

export default QRScannerModal; 