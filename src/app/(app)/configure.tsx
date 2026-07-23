import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { useFarms } from '../../features/station/useFarms';
import { useWarehouses } from '../../features/station/useWarehouses';
import { useStationStore } from '../../stores/station';
import { setStorageItem, STORAGE_KEYS } from '../../lib/storage';
import { haptics } from '../../lib/haptics';
import { AppBar } from '../../components/ui/AppBar';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Picker } from '../../components/ui/Picker';
import { Pill } from '../../components/ui/Pill';
import { colors, radii, spacing } from '../../components/ui/theme';

export default function ConfigureStation() {
  const router = useRouter();
  const setStation = useStationStore((s) => s.setStation);
  const currentStation = useStationStore((s) => s.station);

  const { data: farms = [], isLoading: farmsLoading } = useFarms();
  const { data: allWarehouses = [], isLoading: warehousesLoading } = useWarehouses();

  const [selectedFarm, setSelectedFarm] = useState(currentStation?.farm ?? '');
  const [warehouseInput, setWarehouseInput] = useState(currentStation?.warehouseName ?? '');
  const [selectedWarehouse, setSelectedWarehouse] = useState(currentStation?.warehouse ?? '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Port of configure_user_farm_screen.dart:284-311: filter warehouses by selected farm.
  // farm "Main" → exclude EX; farm "EX-LEWA" → only EX.
  // All other warehouses are pre-filtered to GHSE*/GH* by useWarehouses.
  const filteredWarehouses = useMemo(() => {
    if (!selectedFarm) return allWarehouses;
    if (selectedFarm === 'Main') return allWarehouses.filter((w) => !w.name.includes('EX'));
    if (selectedFarm === 'EX-LEWA') return allWarehouses.filter((w) => w.name.includes('EX'));
    return allWarehouses;
  }, [selectedFarm, allWarehouses]);

  const suggestions = useMemo(() => {
    const q = warehouseInput.trim().toLowerCase();
    if (!q) return filteredWarehouses;
    return filteredWarehouses.filter((w) => w.name.toLowerCase().includes(q));
  }, [warehouseInput, filteredWarehouses]);

  const farmItems = useMemo(
    () => farms.map((f) => ({ label: f.name, value: f.name })),
    [farms],
  );

  function handleFarmChange(farm: string) {
    setSelectedFarm(farm);
    setWarehouseInput('');
    setSelectedWarehouse('');
    setValidationError('');
  }

  function handleWarehouseSelect(name: string) {
    setSelectedWarehouse(name);
    setWarehouseInput(name);
    setShowSuggestions(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setValidationError('');
  }

  function handleWarehouseBlur() {
    // Delay so a tap on a suggestion registers before the list hides
    hideTimer.current = setTimeout(() => setShowSuggestions(false), 150);
  }

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    if (!selectedFarm) {
      setValidationError('Please select a farm.');
      haptics.heavy();
      return;
    }
    if (!selectedWarehouse) {
      setValidationError('Tap a station from the suggestions list to select it.');
      haptics.heavy();
      return;
    }
    setIsSaving(true);
    const station = {
      farm: selectedFarm,
      farmName: selectedFarm,
      warehouse: selectedWarehouse,
      warehouseName: selectedWarehouse,
    };
    await setStorageItem(STORAGE_KEYS.USER_STATION, JSON.stringify(station));
    setStation(station);
    setSavedMsg(true);
    setValidationError('');
    saveTimer.current = setTimeout(() => router.back(), 1500);
  }, [isSaving, selectedFarm, selectedWarehouse, setStation, router]);

  const isLoading = farmsLoading || warehousesLoading;

  return (
    <SafeAreaView style={styles.root}>
      <AppBar title="Configure Station" onBack={() => router.back()} />

      {isLoading ? (
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
            {/* Farm */}
            <Field label="Farm">
              <Picker
                value={selectedFarm}
                onValueChange={handleFarmChange}
                placeholder="Select a farm…"
                items={farmItems}
              />
            </Field>

            {/* Warehouse typeahead */}
            <Field label="Station (Warehouse)">
              <View>
                <TextInput
                  style={[styles.input, !selectedFarm && styles.inputDisabled]}
                  value={warehouseInput}
                  onChangeText={(text) => {
                    setWarehouseInput(text);
                    setSelectedWarehouse('');
                    setShowSuggestions(true);
                    setValidationError('');
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={handleWarehouseBlur}
                  placeholder={selectedFarm ? 'Search station…' : 'Select a farm first'}
                  placeholderTextColor={colors.muted}
                  editable={!!selectedFarm}
                />
                {showSuggestions && suggestions.length > 0 ? (
                  <View style={styles.suggestions}>
                    {suggestions.slice(0, 8).map((w) => (
                      <Pressable
                        key={w.name}
                        onPress={() => handleWarehouseSelect(w.name)}
                        style={({ pressed }) => [
                          styles.suggestion,
                          pressed && styles.suggestionPressed,
                        ]}
                      >
                        <Text style={styles.suggestionText}>{w.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </Field>

            {/* Validation error */}
            {validationError ? <Pill variant="error">{validationError}</Pill> : null}

            {/* Success message */}
            {savedMsg ? <Pill variant="success">Station saved</Pill> : null}

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
  inputDisabled: { backgroundColor: colors.pressed },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    zIndex: 100,
    elevation: 4,
    shadowColor: 'black',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggestionPressed: { backgroundColor: colors.pressed },
  suggestionText: { fontSize: 14, color: colors.primary },
});
