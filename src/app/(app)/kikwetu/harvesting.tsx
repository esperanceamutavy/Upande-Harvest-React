import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, type Resolver, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MoreVertical, QrCode } from 'lucide-react-native';
import { z } from 'zod';

import { useStation } from '../../../features/station/useStation';
import { useStemLengths } from '../../../features/stock/useStemLengths';
import { useGreenhouseData } from '../../../features/stock/useGreenhouseData';
import { useBucketCheck } from '../../../features/stock/useBucketCheck';
import { useCreateHarvestEntry } from '../../../features/stock/useCreateHarvestEntry';
import { playSubmit, playError } from '../../../lib/audio';
import { extractFrappeError } from '../../../lib/api';
import { haptics } from '../../../lib/haptics';
import { BarcodeScannerOverlay } from '../../../features/scanning/BarcodeScannerOverlay';
import { AppBar } from '../../../components/ui/AppBar';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Picker } from '../../../components/ui/Picker';
import { Pill } from '../../../components/ui/Pill';
import { colors, radii, spacing } from '../../../components/ui/theme';

const ACCENT = colors.accent;

// Day-of-week harvesting symbol — port of kikwetu_harvesting_stock_entry.dart:34-42.
// Flutter uses DateTime.weekday (1=Mon, 7=Sun). JS getDay() returns 0=Sun, 6=Sat.
const DAY_SYMBOLS: Record<number, string> = {
  0: '/', // Sunday
  1: '@', // Monday
  2: '!', // Tuesday
  3: '?', // Wednesday
  4: '#', // Thursday
  5: '+', // Friday
  6: '*', // Saturday
};

function getDaySymbol(): string {
  return DAY_SYMBOLS[new Date().getDay()] ?? '';
}

const schema = z.object({
  variety: z.string().min(1, 'Variety required'),
  section: z.string().min(1, 'Section required'),
  harvester: z.string().min(1, 'Harvester required'),
  stemLength: z.string().min(1, 'Stem length required'),
  quantity: z.coerce.number({ message: 'Enter a number' }).int().min(1, 'Min 1').max(69, 'Must be less than 70'),
  bucketId: z.string().min(1, 'Bucket ID required'),
});

type FormValues = z.infer<typeof schema>;

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };

export default function HarvestingScreen() {
  const router = useRouter();
  const station = useStation();

  const { data: stemLengths = [], isLoading: stemLoading } = useStemLengths();
  const {
    data: greenhouseData,
    isLoading: ghLoading,
    isError: ghError,
    refetch: ghRefetch,
  } = useGreenhouseData(station?.warehouse ?? '');

  const bucketCheck = useBucketCheck();
  const createEntry = useCreateHarvestEntry();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      variety: '',
      section: '',
      harvester: '',
      stemLength: '',
      quantity: undefined,
      bucketId: '',
    },
  });

  // Guard — redirect to configure if no station selected
  useEffect(() => {
    if (!station) {
      router.replace('/configure');
    }
  }, [station, router]);

  const varieties = useMemo(
    () => greenhouseData?.custom_varieties_grown ?? [],
    [greenhouseData],
  );
  const sections = useMemo(
    () => greenhouseData?.custom_sections.filter((s) => s.section_name != null) ?? [],
    [greenhouseData],
  );

  // Auto-fill variety when greenhouse has exactly one — port of dart listener line 244-246
  useEffect(() => {
    if (varieties.length === 1) {
      setValue('variety', varieties[0].variety, { shouldValidate: true });
    }
  }, [varieties, setValue]);

  const sectionEmployeeMap = useMemo(
    () => Object.fromEntries(sections.map((s) => [s.section_name!, s.employee_name ?? ''])),
    [sections],
  );

  const isLoading = stemLoading || ghLoading;
  const symbol = getDaySymbol();

  function handleScan(raw: string) {
    setScannerVisible(false);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).bucket_id === 'string') {
        setValue('bucketId', ((parsed as Record<string, unknown>).bucket_id as string).toUpperCase(), { shouldValidate: true });
      } else {
        setFeedback({ type: 'warning', text: 'Please scan a valid bucket QR code' });
        haptics.medium();
      }
    } catch {
      setFeedback({ type: 'warning', text: 'Invalid QR code format' });
      haptics.medium();
    }
  }

  async function onSubmit(data: FormValues) {
    if (!station) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      // Step 1: validate bucket — port of dart lines 201-224
      const buckets = await bucketCheck.mutateAsync(data.bucketId);

      if (buckets.length === 0) {
        setFeedback({ type: 'warning', text: 'The bucket QR code does not exist.' });
        haptics.medium();
        setIsSubmitting(false);
        return;
      }
      if (buckets[0].custom_status !== 'Available') {
        setFeedback({ type: 'warning', text: 'The bucket is not available for harvesting.' });
        haptics.medium();
        setIsSubmitting(false);
        return;
      }
      if (buckets[0].last_stock_entry) {
        setFeedback({
          type: 'warning',
          text: `Bucket is associated with Stock Entry ${buckets[0].last_stock_entry}. Must be received and cleared before reuse.`,
        });
        haptics.medium();
        setIsSubmitting(false);
        return;
      }

      // Step 2: submit harvest entry
      await createEntry.mutateAsync({
        farm: station.farm,
        greenhouse: station.warehouse,
        section: data.section,
        harvester: data.harvester,
        bucket_id: data.bucketId,
        item_code: data.variety,
        quantity: data.quantity,
        stem_length: data.stemLength,
      });

      playSubmit();
      setFeedback({ type: 'success', text: 'Harvesting entry submitted.' });
      // Partial reset — keep variety/section/harvester for batch entry (port of dart clearForm:97-104)
      reset({
        variety: getValues('variety'),
        section: getValues('section'),
        harvester: getValues('harvester'),
        stemLength: '',
        quantity: undefined as unknown as number,
        bucketId: '',
      });
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!station) return null;

  return (
    <SafeAreaView style={styles.root}>
      <AppBar
        title="Harvesting Entry"
        onBack={() => router.back()}
        rightAction={{
          icon: <MoreVertical size={22} color="white" />,
          onPress: () => Alert.alert('Harvest Report', 'Coming in Phase 5.', [{ text: 'OK' }]),
        }}
      />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : ghError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load greenhouse data.</Text>
          <Button onPress={() => void ghRefetch()}>Retry</Button>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            {/* Day-of-week symbol — port of dart lines 283-305 */}
            <View style={styles.symbolRow}>
              <Text style={styles.symbolLabel}>Today's harvesting symbol:</Text>
              <Text style={styles.symbolValue}>({symbol})</Text>
            </View>

            {/* Variety */}
            <Field label="Variety" error={errors.variety?.message}>
              {varieties.length === 1 ? (
                <View style={styles.readonlyField}>
                  <Text style={styles.readonlyText}>{varieties[0].variety}</Text>
                </View>
              ) : (
                <Controller
                  control={control}
                  name="variety"
                  render={({ field: { value, onChange } }) => (
                    <Picker
                      value={value}
                      onValueChange={onChange}
                      placeholder="Select variety…"
                      items={varieties.map((v) => ({ label: v.variety, value: v.variety }))}
                    />
                  )}
                />
              )}
            </Field>

            {/* Section */}
            <Field label="Section" error={errors.section?.message}>
              <Controller
                control={control}
                name="section"
                render={({ field: { value, onChange } }) => (
                  <Picker
                    value={value}
                    onValueChange={(val) => {
                      onChange(val);
                      // Auto-fill harvester from section's employee_name — port of dart lines 431-438
                      setValue('harvester', sectionEmployeeMap[val] ?? '', { shouldValidate: true });
                    }}
                    placeholder="Select section…"
                    items={sections.map((s) => ({
                      label: s.section_name!,
                      value: s.section_name!,
                    }))}
                  />
                )}
              />
            </Field>

            {/* Harvester — filled via section selection, editable per Flutter (dart line 441-464) */}
            <Field label="Harvester" error={errors.harvester?.message}>
              <Controller
                control={control}
                name="harvester"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Auto-filled from section…"
                    placeholderTextColor={colors.muted}
                  />
                )}
              />
            </Field>

            {/* Stem Length */}
            <Field label="Stem Length" error={errors.stemLength?.message}>
              <Controller
                control={control}
                name="stemLength"
                render={({ field: { value, onChange } }) => (
                  <Picker
                    value={value}
                    onValueChange={onChange}
                    placeholder="Select stem length…"
                    items={stemLengths.map((s) => ({ label: s.length, value: s.length }))}
                  />
                )}
              />
            </Field>

            {/* Quantity — validated < 70, port of dart lines 537-549 */}
            <Field label="Quantity" error={errors.quantity?.message}>
              <Controller
                control={control}
                name="quantity"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    style={styles.input}
                    value={value?.toString() ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="numeric"
                    placeholder="e.g. 25"
                    placeholderTextColor={colors.muted}
                  />
                )}
              />
            </Field>

            {/* Bucket ID */}
            <Field label="Bucket ID" error={errors.bucketId?.message}>
              <Controller
                control={control}
                name="bucketId"
                render={({ field: { value, onChange, onBlur } }) => (
                  <View style={styles.bucketRow}>
                    <TextInput
                      style={[styles.input, styles.bucketInput]}
                      value={value}
                      onChangeText={(text) => onChange(text.toUpperCase())}
                      onBlur={onBlur}
                      autoCapitalize="characters"
                      placeholder="Type or scan bucket ID…"
                      placeholderTextColor={colors.muted}
                    />
                    <Pressable
                      style={styles.qrBtn}
                      onPress={() => setScannerVisible(true)}
                    >
                      <QrCode size={22} color={ACCENT} />
                    </Pressable>
                  </View>
                )}
              />
            </Field>

            {/* Feedback message (success / warning / error) */}
            {feedback ? <Pill variant={feedback.type}>{feedback.text}</Pill> : null}

            {/* Submit */}
            <Button
              onPress={() => void handleSubmit(onSubmit)()}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Please wait…' : 'Submit Harvest'}
            </Button>

            {/* Station footer — port of dart lines 623-664 */}
            <View style={styles.stationFooter}>
              <Text style={styles.stationText} numberOfLines={1}>
                {station.farmName} Farm · {station.warehouseName}
              </Text>
              <Pressable onPress={() => router.push('/configure')} hitSlop={8}>
                <Text style={styles.changeLink}>Change →</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={handleScan}
        onCancel={() => setScannerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: { fontSize: 14, color: colors.error, textAlign: 'center' },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  form: { gap: spacing.md },
  // day symbol
  symbolRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  symbolLabel: { fontSize: 14, color: colors.primary },
  symbolValue: { fontSize: 16, fontWeight: '900', color: ACCENT },
  // inputs
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.primary,
    backgroundColor: colors.surface,
  },
  readonlyField: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    backgroundColor: colors.pressed,
  },
  readonlyText: { fontSize: 14, color: colors.primary },
  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bucketInput: { flex: 1 },
  qrBtn: {
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(105,157,205,0.4)',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  // footer
  stationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  stationText: { fontSize: 13, color: colors.primary, flex: 1 },
  changeLink: { fontSize: 13, color: ACCENT, fontWeight: '600' },
});
