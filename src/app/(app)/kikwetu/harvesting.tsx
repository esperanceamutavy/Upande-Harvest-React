import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Adapt, Button, Select, Sheet, Text, XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, MoreVertical, QrCode } from 'lucide-react-native';
import { z } from 'zod';

import { useStation } from '../../../features/station/useStation';
import { useStemLengths } from '../../../features/stock/useStemLengths';
import { useGreenhouseData } from '../../../features/stock/useGreenhouseData';
import { useBucketCheck } from '../../../features/stock/useBucketCheck';
import { useCreateHarvestEntry } from '../../../features/stock/useCreateHarvestEntry';
import { playSubmit, playError } from '../../../lib/audio';
import { extractFrappeError } from '../../../lib/api';
import { haptics } from '../../../lib/haptics';

const PRIMARY = '#44433e';
const ACCENT = '#699dcd';

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
  quantity: z.coerce.number({ invalid_type_error: 'Enter a number' }).int().min(1, 'Min 1').max(69, 'Must be less than 70'),
  bucketId: z.string().min(1, 'Bucket ID required'),
});

type FormValues = z.infer<typeof schema>;

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };

const FEEDBACK_COLORS = {
  success: '#48773E',
  warning: '#c07020',
  error: '#c0392b',
};

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

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
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
      setFeedback({
        type: 'error',
        text: extractFrappeError(e),
      });
    } finally {
      setIsSubmitting(false);
    }
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
          Harvesting Entry
        </Text>
        <Pressable
          hitSlop={8}
          style={styles.iconBtn}
          onPress={() =>
            Alert.alert('Harvest Report', 'Coming in Phase 5.', [{ text: 'OK' }])
          }
        >
          <MoreVertical size={22} color="white" />
        </Pressable>
      </XStack>

      {isLoading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <ActivityIndicator color={PRIMARY} size="large" />
        </YStack>
      ) : ghError ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3" padding="$4">
          <Text color="$red10" fontSize={14} textAlign="center">
            Failed to load greenhouse data.
          </Text>
          <Button onPress={() => void ghRefetch()} size="$3" backgroundColor={ACCENT} color="white">
            Retry
          </Button>
        </YStack>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <YStack gap="$4">
            {/* Day-of-week symbol — port of dart lines 283-305 */}
            <XStack alignItems="center" gap="$2">
              <Text fontSize={14} color="$primary">Today's harvesting symbol:</Text>
              <Text fontSize={16} fontWeight="900" color={ACCENT}>({symbol})</Text>
            </XStack>

            {/* Variety */}
            <YStack gap="$1">
              <Text fontWeight="600" fontSize={14} color="$primary">Variety</Text>
              {varieties.length === 1 ? (
                <View style={styles.readonlyField}>
                  <Text fontSize={14} color="$primary">{varieties[0].variety}</Text>
                </View>
              ) : (
                <Controller
                  control={control}
                  name="variety"
                  render={({ field: { value, onChange } }) => (
                    <PickerSelect
                      value={value}
                      onValueChange={onChange}
                      placeholder="Select variety…"
                      items={varieties.map((v) => ({ label: v.variety, value: v.variety }))}
                    />
                  )}
                />
              )}
              {errors.variety && <Text color="$red10" fontSize={12}>{errors.variety.message}</Text>}
            </YStack>

            {/* Section */}
            <YStack gap="$1">
              <Text fontWeight="600" fontSize={14} color="$primary">Section</Text>
              <Controller
                control={control}
                name="section"
                render={({ field: { value, onChange } }) => (
                  <PickerSelect
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
              {errors.section && <Text color="$red10" fontSize={12}>{errors.section.message}</Text>}
            </YStack>

            {/* Harvester — filled via section selection, editable per Flutter (dart line 441-464) */}
            <YStack gap="$1">
              <Text fontWeight="600" fontSize={14} color="$primary">Harvester</Text>
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
                    placeholderTextColor="rgba(68,67,62,0.4)"
                  />
                )}
              />
              {errors.harvester && (
                <Text color="$red10" fontSize={12}>{errors.harvester.message}</Text>
              )}
            </YStack>

            {/* Stem Length */}
            <YStack gap="$1">
              <Text fontWeight="600" fontSize={14} color="$primary">Stem Length</Text>
              <Controller
                control={control}
                name="stemLength"
                render={({ field: { value, onChange } }) => (
                  <PickerSelect
                    value={value}
                    onValueChange={onChange}
                    placeholder="Select stem length…"
                    items={stemLengths.map((s) => ({ label: s.length, value: s.length }))}
                  />
                )}
              />
              {errors.stemLength && (
                <Text color="$red10" fontSize={12}>{errors.stemLength.message}</Text>
              )}
            </YStack>

            {/* Quantity — validated < 70, port of dart lines 537-549 */}
            <YStack gap="$1">
              <Text fontWeight="600" fontSize={14} color="$primary">Quantity</Text>
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
                    placeholderTextColor="rgba(68,67,62,0.4)"
                  />
                )}
              />
              {errors.quantity && (
                <Text color="$red10" fontSize={12}>{errors.quantity.message}</Text>
              )}
            </YStack>

            {/* Bucket ID — editable for Phase 4.1 manual entry; QR scan deferred to Phase 4.1b */}
            <YStack gap="$1">
              <Text fontWeight="600" fontSize={14} color="$primary">Bucket ID</Text>
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
                      placeholderTextColor="rgba(68,67,62,0.4)"
                    />
                    <Pressable
                      style={styles.qrBtn}
                      onPress={() =>
                        Alert.alert(
                          'Barcode Scanner',
                          'Coming in Phase 4.1b.',
                          [{ text: 'OK' }],
                        )
                      }
                    >
                      <QrCode size={22} color={ACCENT} />
                    </Pressable>
                  </View>
                )}
              />
              {errors.bucketId && (
                <Text color="$red10" fontSize={12}>{errors.bucketId.message}</Text>
              )}
            </YStack>

            {/* Feedback message (success / warning / error) */}
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

            {/* Submit */}
            <Button
              onPress={() => void handleSubmit(onSubmit)()}
              disabled={isSubmitting}
              opacity={isSubmitting ? 0.6 : 1}
              backgroundColor={PRIMARY}
              color="white"
              size="$4"
            >
              {isSubmitting ? 'Please wait…' : 'Submit Harvest'}
            </Button>

            {/* Station footer — port of dart lines 623-664 */}
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
      )}
    </SafeAreaView>
  );
}

// Shared picker component — Tamagui Select with Sheet adapt (same pattern as dashboard + configure)
interface PickerItem { label: string; value: string; }
interface PickerSelectProps {
  value: string;
  onValueChange: (val: string) => void;
  placeholder: string;
  items: PickerItem[];
}
function PickerSelect({ value, onValueChange, placeholder, items }: PickerSelectProps) {
  return (
    <Select value={value || ''} onValueChange={onValueChange}>
      <Select.Trigger iconAfter={<ChevronDown size={14} color={PRIMARY} />}>
        <Select.Value placeholder={placeholder} />
      </Select.Trigger>
      <Adapt when="sm" platform="touch">
        <Sheet dismissOnSnapToBottom snapPoints={[50]}>
          <Sheet.Frame padding="$4">
            <Sheet.ScrollView>
              <Adapt.Contents />
            </Sheet.ScrollView>
          </Sheet.Frame>
          <Sheet.Overlay />
        </Sheet>
      </Adapt>
      <Select.Content>
        <Select.Viewport>
          {items.map((item, i) => (
            <Select.Item key={item.value} index={i} value={item.value}>
              <Select.ItemText>{item.label}</Select.ItemText>
            </Select.Item>
          ))}
        </Select.Viewport>
      </Select.Content>
    </Select>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F6' },
  iconBtn: { padding: 4 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
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
  readonlyField: {
    borderWidth: 1,
    borderColor: 'rgba(68,67,62,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: 'rgba(68,67,62,0.04)',
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
  feedback: {
    padding: 12,
    borderRadius: 8,
  },
});
