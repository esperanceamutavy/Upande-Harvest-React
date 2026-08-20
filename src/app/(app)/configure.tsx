import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';

import { useFarms } from '../../features/station/useFarms';
import { useFarmStore } from '../../stores/farm';
import { setStorageItem, STORAGE_KEYS } from '../../lib/storage';
import { haptics } from '../../lib/haptics';
import { Button } from '../../components/ui/Button';
import { Card, Notice } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Picker } from '../../components/ui/Picker';
import { Screen } from '../../components/ui/Screen';

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
    <Screen title="Configure Farm" loading={farmsLoading} onBack={() => router.back()}>
      {/* Card title = the step, Field label = the input. Card applies the
          uppercase itself, so titles are written in sentence case. */}
      <Card title="Select farm">
        <Field label="Farm">
          <Picker
            value={selectedFarm}
            onValueChange={handleFarmChange}
            placeholder="Select a farm…"
            items={farmItems}
          />
        </Field>
      </Card>

      {validationError ? <Notice tone="danger">{validationError}</Notice> : null}
      {savedMsg ? <Notice tone="success">Farm saved</Notice> : null}

      <Button onPress={() => void handleSave()} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save'}
      </Button>
    </Screen>
  );
}
