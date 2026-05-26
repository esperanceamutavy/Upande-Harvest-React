import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';

import { useStation } from '../../../features/station/useStation';
import { useRejectReasonsWithVarieties } from '../../../features/rejects/useRejectReasonsWithVarieties';
import { useCreateRejectEntry } from '../../../features/rejects/useCreateRejectEntry';
import { playSubmit, playError } from '../../../lib/audio';
import { haptics } from '../../../lib/haptics';
import { extractFrappeError } from '../../../lib/api';
import { AppBar } from '../../../components/ui/AppBar';
import { Picker } from '../../../components/ui/Picker';
import { Pill } from '../../../components/ui/Pill';
import { RejectReasonModal } from '../../../components/RejectReasonModal';
import { colors, radii, spacing } from '../../../components/ui/theme';
import type { RejectPayload, RejectType } from '../../../types/reject';

type FeedbackMsg = { type: 'success' | 'error'; text: string };

const REJECT_TYPE_OPTIONS = [
  { label: 'Harvesting', value: 'Harvesting' },
  { label: 'Grading', value: 'Grading' },
];

export default function RejectsScreen() {
  const router = useRouter();
  const station = useStation();
  const { data, isLoading, error, refetch, isFetching } = useRejectReasonsWithVarieties(
    station?.warehouse,
  );
  const createReject = useCreateRejectEntry();

  const [variety, setVariety] = useState<string>('');
  const [rejectType, setRejectType] = useState<RejectType | ''>('');
  const [activeRejects, setActiveRejects] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);

  useEffect(() => {
    if (!station) {
      router.replace('/configure');
    }
  }, [station, router]);

  if (!station) return null;

  const reasons = data?.reject_reasons ?? [];
  const varieties = data?.varieties ?? [];
  const addedNames = Object.keys(activeRejects);
  const totalQty = Object.values(activeRejects).reduce((s, n) => s + n, 0);

  function updateQty(name: string, raw: string) {
    const n = parseInt(raw, 10);
    setActiveRejects((prev) => ({
      ...prev,
      [name]: Number.isFinite(n) && n >= 0 ? n : 0,
    }));
  }

  function removeReason(name: string) {
    setActiveRejects((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function resetForm() {
    setVariety('');
    setRejectType('');
    setActiveRejects({});
  }

  function reasonLabel(name: string): string {
    return reasons.find((r) => r.name === name)?.reason ?? name;
  }

  const canSubmit =
    variety !== '' &&
    rejectType !== '' &&
    addedNames.length > 0 &&
    addedNames.every((n) => (activeRejects[n] ?? 0) > 0) &&
    !submitting;

  async function onSubmit() {
    if (!canSubmit || !rejectType) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: RejectPayload = {
      customFarm: station!.farm,
      greenhouse: station!.warehouse,
      rejectType,
      variety,
      rejects: addedNames.map((name) => ({ reason: name, quantity: activeRejects[name] })),
    };

    try {
      const res = await createReject.mutateAsync(payload);
      playSubmit();
      haptics.light();
      setFeedback({ type: 'success', text: `Reject submitted: ${res.stock_entry}` });
      resetForm();
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <AppBar title="Rejects Entry" onBack={() => router.back()} />

      {isLoading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centerWrap}>
          <Text style={styles.errorText}>Failed to load reject reasons.</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryBtnText}>{isFetching ? 'Retrying…' : 'Retry'}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            {/* Variety */}
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Variety</Text>
              <Picker
                value={variety}
                onValueChange={setVariety}
                placeholder="Select variety"
                items={varieties.map((v) => ({ label: v, value: v }))}
              />
            </View>

            {/* Reject Type */}
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Reject Type</Text>
              <Picker
                value={rejectType}
                onValueChange={(v) => setRejectType(v as RejectType)}
                placeholder="Select reject type"
                items={REJECT_TYPE_OPTIONS}
              />
            </View>

            {/* Reject reasons list */}
            <View style={styles.fieldBlock}>
              <View style={styles.reasonHeader}>
                <Text style={styles.label}>Reasons</Text>
                <Pressable
                  onPress={() => setModalOpen(true)}
                  style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
                  hitSlop={8}
                >
                  <Plus size={16} color="white" />
                  <Text style={styles.addBtnText}>Add Reject Reason</Text>
                </Pressable>
              </View>

              {addedNames.length === 0 ? (
                <Text style={styles.emptyHint}>No reasons added yet.</Text>
              ) : (
                <View style={styles.reasonList}>
                  {addedNames.map((name) => (
                    <View key={name} style={styles.reasonRow}>
                      <Text style={styles.reasonName} numberOfLines={2}>
                        {reasonLabel(name)}
                      </Text>
                      <TextInput
                        style={styles.qtyInput}
                        value={String(activeRejects[name] ?? 0)}
                        onChangeText={(t) => updateQty(name, t)}
                        keyboardType="number-pad"
                        selectTextOnFocus
                      />
                      <Pressable onPress={() => removeReason(name)} hitSlop={8} style={styles.removeBtn}>
                        <Trash2 size={18} color={colors.error} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {addedNames.length > 0 ? (
                <Text style={styles.totalText}>Total: {totalQty} stems</Text>
              ) : null}
            </View>

            {/* Submit */}
            <Pressable
              onPress={onSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                !canSubmit && styles.submitBtnDisabled,
                pressed && canSubmit && styles.submitBtnPressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Reject</Text>
              )}
            </Pressable>

            {/* Feedback */}
            {feedback ? <Pill variant={feedback.type}>{feedback.text}</Pill> : null}

            {/* Station footer */}
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

      <RejectReasonModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        reasons={reasons}
        excludeNames={addedNames}
        onSelect={(r) => {
          setActiveRejects((prev) => ({ ...prev, [r.name]: 1 }));
          setModalOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  form: { gap: spacing.md },
  fieldBlock: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.primary },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: { color: colors.error, fontSize: 14, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  retryBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  addBtnPressed: { opacity: 0.85 },
  addBtnText: { color: 'white', fontSize: 13, fontWeight: '600' },
  emptyHint: { color: colors.muted, fontSize: 13, fontStyle: 'italic' },
  reasonList: { gap: spacing.sm },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reasonName: { flex: 1, fontSize: 14, color: colors.primary },
  qtyInput: {
    width: 70,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 14,
    color: colors.primary,
    textAlign: 'center',
    backgroundColor: colors.bg,
  },
  removeBtn: { padding: 4 },
  totalText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnPressed: { opacity: 0.85 },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  stationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    marginTop: spacing.sm,
  },
  stationText: { fontSize: 13, color: colors.primary, flex: 1 },
  changeLink: { fontSize: 13, color: colors.accent, fontWeight: '600' },
});
