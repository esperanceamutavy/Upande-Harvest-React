import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { ArrowLeft, MoreVertical, QrCode } from 'lucide-react-native';

import { useStation } from '../../../features/station/useStation';
import { useBucketCheck } from '../../../features/stock/useBucketCheck';
import { useCreateReceivingEntry } from '../../../features/stock/useCreateReceivingEntry';
import { useGreenhouseByBucketId } from '../../../features/stock/useGreenhouseByBucketId';
import { playSubmit, playError } from '../../../lib/audio';
import { extractFrappeError } from '../../../lib/api';
import { BarcodeScannerOverlay } from '../../../features/scanning/BarcodeScannerOverlay';

const PRIMARY = '#44433e';
const ACCENT = '#699dcd';

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };

const FEEDBACK_COLORS = {
  success: '#48773E',
  warning: '#c07020',
  error: '#c0392b',
};

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export default function ReceivingScreen() {
  const router = useRouter();
  const station = useStation();
  const bucketCheck = useBucketCheck();
  const createReceivingEntry = useCreateReceivingEntry();
  const greenhouseByBucketId = useGreenhouseByBucketId();

  const [bucketIdInput, setBucketIdInput] = useState('');
  const [showLastHarvest, setShowLastHarvest] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [lastGreenhouseShown, setLastGreenhouseShown] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!station) {
      router.replace('/configure');
    }
  }, [station, router]);

  function resetState() {
    setIsProcessing(false);
    isProcessingRef.current = false;
    isSettingProgrammaticallyRef.current = true;
    setBucketIdInput('');
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
    textInputRef.current?.focus();
  }

  async function routeToReceivingFlow(bucketId: string) {
    let buckets;
    try {
      buckets = await bucketCheck.mutateAsync(bucketId);
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
      resetState();
      return;
    }
    if (buckets.length === 0) {
      setFeedback({ type: 'warning', text: 'The bucket QR code does not exist.' });
      playError();
      resetState();
      return;
    }
    if (buckets[0].custom_status !== 'In Use') {
      setFeedback({ type: 'warning', text: 'Bucket is not yet harvested or has already been received.' });
      playError();
      resetState();
      return;
    }
    try {
      await createReceivingEntry.mutateAsync({ bucketName: buckets[0].name });
      playSubmit();
      setFeedback({ type: 'success', text: 'Created entry successfully' });
      resetState();
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
      resetState();
    }
  }

  async function routeToGreenhouseLookup(bucketId: string) {
    try {
      const result = await greenhouseByBucketId.mutateAsync({ bucketId });
      setLastGreenhouseShown(result.greenhouse ?? 'Unknown');
      setFeedback({ type: 'success', text: `Last harvest: ${result.greenhouse ?? 'Unknown'}` });
      playSubmit();
      resetState();
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
      resetState();
    }
  }

  async function handleScannedData(raw: string) {
    setIsProcessing(true);
    isProcessingRef.current = true;
    setFeedback(null);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as Record<string, unknown>).bucket_id !== 'string'
      ) {
        setFeedback({ type: 'warning', text: 'Please scan a valid bucket QR code.' });
        playError();
        resetState();
        return;
      }
      const bucketId = ((parsed as Record<string, unknown>).bucket_id as string).toUpperCase();
      if (showLastHarvest) {
        await routeToGreenhouseLookup(bucketId);
      } else {
        await routeToReceivingFlow(bucketId);
      }
    } catch {
      setFeedback({ type: 'warning', text: 'Invalid QR code format.' });
      playError();
      resetState();
    }
  }

  function onChangeText(text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    setBucketIdInput(text);
    const trimmed = text.trim();
    if (trimmed.endsWith('}') && isValidJson(trimmed) && !isProcessingRef.current) {
      void handleScannedData(trimmed);
    }
  }

  function handleCameraScan(raw: string) {
    setScannerVisible(false);
    void handleScannedData(raw);
  }

  if (!station) return null;

  return (
    <SafeAreaView style={styles.root}>
      {/* App bar */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        alignItems="center"
        gap="$2"
        backgroundColor={PRIMARY}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <ArrowLeft size={24} color="white" />
        </Pressable>
        <Text fontSize={18} fontWeight="bold" color="white" flex={1}>
          Receiving Entry
        </Text>
        <Pressable
          hitSlop={8}
          style={styles.iconBtn}
          onPress={() =>
            Alert.alert('Receiving Report', 'Coming in Phase 5.', [{ text: 'OK' }])
          }
        >
          <MoreVertical size={22} color="white" />
        </Pressable>
      </XStack>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <YStack gap="$4">
          {/* Toggle: show last harvest greenhouse — port of fetchLastGreenHouseDetails */}
          <Pressable
            onPress={() => setShowLastHarvest((v) => !v)}
            style={styles.toggleRow}
          >
            <View style={[styles.toggleBox, showLastHarvest && styles.toggleBoxActive]}>
              {showLastHarvest && (
                <Text color="white" fontSize={14} fontWeight="700">✓</Text>
              )}
            </View>
            <YStack flex={1} gap="$1">
              <Text fontSize={14} fontWeight="600" color="$primary">
                Show last harvest greenhouse
              </Text>
              {showLastHarvest && (
                <Text fontSize={12} color={ACCENT}>(Scan QR to fetch)</Text>
              )}
            </YStack>
          </Pressable>

          {/* Bucket ID field — HID-aware: onChangeText fires on each character; JSON-terminator triggers processing */}
          <YStack gap="$1">
            <Text fontWeight="600" fontSize={14} color="$primary">Bucket ID</Text>
            <View style={styles.bucketRow}>
              <TextInput
                ref={textInputRef}
                style={[styles.input, styles.bucketInput]}
                value={bucketIdInput}
                onChangeText={onChangeText}
                autoFocus
                autoCapitalize="characters"
                placeholder={isProcessing ? 'Processing…' : 'Scan bucket QR code…'}
                placeholderTextColor="rgba(68,67,62,0.4)"
                editable={!isProcessing}
              />
              <Pressable
                style={styles.qrBtn}
                onPress={() => {
                  if (!isProcessing) setScannerVisible(true);
                }}
              >
                <QrCode size={22} color={ACCENT} />
              </Pressable>
            </View>
          </YStack>

          {/* Last greenhouse pill — persists between scans */}
          {lastGreenhouseShown !== null && (
            <View style={styles.greenhousePill}>
              <Text fontSize={13} color="rgba(68,67,62,0.7)">
                Last greenhouse: {lastGreenhouseShown}
              </Text>
            </View>
          )}

          {/* Feedback message */}
          {feedback && (
            <View style={[styles.feedback, { backgroundColor: FEEDBACK_COLORS[feedback.type] + '18' }]}>
              <Text
                fontSize={13}
                fontWeight="600"
                color={FEEDBACK_COLORS[feedback.type] as string}
              >
                {feedback.text}
              </Text>
            </View>
          )}

          {/* Hint */}
          <Text fontSize={13} color="rgba(68,67,62,0.5)" textAlign="center">
            Scan a bucket QR code to record receipt
          </Text>

          {/* Station footer */}
          <XStack alignItems="center" justifyContent="space-between" paddingTop="$1">
            <Text fontSize={13} color="$primary" flex={1}>
              {station.farmName} Farm · {station.warehouseName}
            </Text>
            <Pressable onPress={() => router.push('/configure')} hitSlop={8}>
              <Text fontSize={13} color={ACCENT} fontWeight="600">Change →</Text>
            </Pressable>
          </XStack>
        </YStack>
      </ScrollView>

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={handleCameraScan}
        onCancel={() => setScannerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F6' },
  iconBtn: { padding: 4 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  toggleBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(68,67,62,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  toggleBoxActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(68,67,62,0.25)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: PRIMARY,
    backgroundColor: 'white',
  },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bucketInput: { flex: 1 },
  qrBtn: {
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(105,157,205,0.4)',
    borderRadius: 8,
    backgroundColor: 'white',
  },
  greenhousePill: {
    backgroundColor: 'rgba(68,67,62,0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedback: {
    padding: 12,
    borderRadius: 8,
  },
});
