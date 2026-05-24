import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { openSettings } from 'expo-linking';
import { X } from 'lucide-react-native';

import { playBeep } from '../../lib/audio';

const ACCENT = '#699dcd';

export interface BarcodeScannerOverlayProps {
  visible: boolean;
  onScan: (rawBarcode: string) => void;
  onCancel: () => void;
}

export function BarcodeScannerOverlay({ visible, onScan, onCancel }: BarcodeScannerOverlayProps) {
  const hasScanned = useRef(false);
  const didRequest = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (!visible) {
      didRequest.current = false;
      return;
    }
    hasScanned.current = false;
    if (!didRequest.current && permission !== null && !permission.granted && permission.canAskAgain) {
      didRequest.current = true;
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  if (!visible) return null;

  // Permission still loading
  if (permission === null) return null;

  // Permanently denied — show settings prompt
  if (!permission.granted && !permission.canAskAgain) {
    return (
      <Modal animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
        <View style={styles.permissionRoot}>
          <Text style={styles.permissionTitle}>Camera permission required</Text>
          <Text style={styles.permissionBody}>
            Allow camera access in Settings to scan bucket QR codes.
          </Text>
          <Pressable style={styles.settingsBtn} onPress={() => void openSettings()}>
            <Text style={styles.settingsBtnText}>Open Settings</Text>
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  // Not yet granted — permission dialog is showing or loading; render nothing
  if (!permission.granted) return null;

  return (
    <Modal animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.cameraRoot}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          // Note: onBarcodeScanned fires repeatedly (~30 fps) while a QR is in view.
          // hasScanned ref ensures we only process the first detection.
          onBarcodeScanned={(result) => {
            if (hasScanned.current) return;
            hasScanned.current = true;
            playBeep();
            // 500ms delay — gives audio feedback time to complete before transitioning
            setTimeout(() => {
              onScan(result.data);
            }, 500);
          }}
        />
        <Pressable style={styles.closeBtn} onPress={onCancel} hitSlop={8}>
          <X size={24} color="white" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  permissionRoot: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  settingsBtn: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginBottom: 12,
  },
  settingsBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
  },
  cameraRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
});
