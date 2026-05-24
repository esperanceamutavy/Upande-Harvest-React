import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Adapt, Button, Select, Sheet, Text, XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown } from 'lucide-react-native';

import { useFarms } from '../../features/station/useFarms';
import { useWarehouses } from '../../features/station/useWarehouses';
import { useStationStore } from '../../stores/station';
import { setStorageItem, STORAGE_KEYS } from '../../lib/storage';
import { haptics } from '../../lib/haptics';

const PRIMARY = '#44433e';

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

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!selectedFarm) {
      setValidationError('Please select a farm.');
      haptics.heavy();
      return;
    }
    if (!selectedWarehouse) {
      setValidationError('Please select a station from the list.');
      haptics.heavy();
      return;
    }
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
    setTimeout(() => router.back(), 1500);
  }, [selectedFarm, selectedWarehouse, setStation, router]);

  const isLoading = farmsLoading || warehousesLoading;

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
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <ArrowLeft size={24} color="white" />
        </Pressable>
        <Text fontSize={18} fontWeight="bold" color="white" flex={1}>
          Configure Station
        </Text>
      </XStack>

      {isLoading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <ActivityIndicator color={PRIMARY} size="large" />
        </YStack>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <YStack gap="$4">
            {/* Farm Select */}
            <YStack gap="$2">
              <Text fontWeight="600" fontSize={14} color="$primary">Farm</Text>
              <Select value={selectedFarm} onValueChange={handleFarmChange}>
                <Select.Trigger iconAfter={<ChevronDown size={14} color={PRIMARY} />}>
                  <Select.Value placeholder="Select a farm…" />
                </Select.Trigger>

                <Adapt when="sm" platform="touch">
                  <Sheet dismissOnSnapToBottom snapPoints={[40]}>
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
                    {farms.map((farm, i) => (
                      <Select.Item key={farm.name} index={i} value={farm.name}>
                        <Select.ItemText>{farm.name}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select>
            </YStack>

            {/* Warehouse typeahead */}
            <YStack gap="$2">
              <Text fontWeight="600" fontSize={14} color="$primary">Station (Warehouse)</Text>
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
                  placeholderTextColor="rgba(68,67,62,0.4)"
                  editable={!!selectedFarm}
                />
                {showSuggestions && suggestions.length > 0 && (
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
                        <Text fontSize={14} color="$primary">{w.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </YStack>

            {/* Validation error */}
            {!!validationError && (
              <Text color="$red10" fontSize={13}>{validationError}</Text>
            )}

            {/* Success message */}
            {savedMsg && (
              <Text color="$success" fontSize={13} fontWeight="600">
                Station saved
              </Text>
            )}

            <Button
              onPress={() => void handleSave()}
              backgroundColor={PRIMARY}
              color="white"
              size="$4"
            >
              Save
            </Button>
          </YStack>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F6' },
  backBtn: { padding: 4 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 24 },
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
  inputDisabled: {
    backgroundColor: 'rgba(68,67,62,0.05)',
  },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: 'rgba(68,67,62,0.2)',
    borderRadius: 8,
    zIndex: 100,
    elevation: 4,
    shadowColor: 'black',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(68,67,62,0.08)',
  },
  suggestionPressed: { backgroundColor: 'rgba(68,67,62,0.06)' },
});
