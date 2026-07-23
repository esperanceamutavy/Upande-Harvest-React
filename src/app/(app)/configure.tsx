import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useFarms } from '../../features/station/useFarms';
import { useFarmStore } from '../../stores/farm';
import { setStorageItem, STORAGE_KEYS } from '../../lib/storage';
import { haptics } from '../../lib/haptics';
import { AppBar } from '../../components/ui/AppBar';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Picker } from '../../components/ui/Picker';
import { Pill } from '../../components/ui/Pill';
import { colors, spacing } from '../../components/ui/theme';

// Xflora config is farm-only — no station/warehouse. Port of the Xflora branch of
// configure_user_farm_screen.dart (the warehouse typeahead is hidden `if (!isXflora)`
// and only `userFarm` is persisted). See XFLORA_PORT_PLAN.md §5.2.
export default function ConfigureFarm() {
  const router = useRouter();
  const setFarm = useFarmStore((s) => s.setFarm);
  const currentFarm = useFarmStore((s) => s.farm);

  const { data: farms = [], isLoading: farmsLoading } = useFarms();

  const [selectedFarm, setSelectedFarm] = useState(currentFarm?.farm ?? '');
  const [savedMsg, setSavedMsg] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const farmItems = useMemo(
    () => farms.map((f) => ({ label: f.farm_name ?? f.name, value: f.name })),
    [farms],
  );

  function handleFarmChange(farm: string) {
    setSelectedFarm(farm);
    setValidationError('');
  }

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    if (!selectedFarm) {
      setValidationError('Please select a farm.');
      haptics.heavy();
      return;
    }
    setIsSaving(true);
    const farmName = farms.find((f) => f.name === selectedFarm)?.farm_name ?? selectedFarm;
    const userFarm = { farm: selectedFarm, farmName };
    await setStorageItem(STORAGE_KEYS.USER_FARM, JSON.stringify(userFarm));
    setFarm(userFarm);
    setSavedMsg(true);
    setValidationError('');
    saveTimer.current = setTimeout(() => router.back(), 1500);
  }, [isSaving, selectedFarm, farms, setFarm, router]);

  return (
    <SafeAreaView style={styles.root}>
      <AppBar title="Configure Farm" onBack={() => router.back()} />

      {farmsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            <Field label="Farm">
              <Picker
                value={selectedFarm}
                onValueChange={handleFarmChange}
                placeholder="Select a farm…"
                items={farmItems}
              />
            </Field>

            {validationError ? <Pill variant="error">{validationError}</Pill> : null}
            {savedMsg ? <Pill variant="success">Farm saved</Pill> : null}

            <Button onPress={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.xl },
  form: { gap: spacing.lg },
});
