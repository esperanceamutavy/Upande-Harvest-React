import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import {
  BottomSheetModal,
  BottomSheetView,
} from '@expo/ui/community/bottom-sheet';
import { colors, radii, spacing, typography } from './theme';

interface PickerItem {
  label: string;
  value: string;
}

interface PickerProps {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  items: PickerItem[];
  disabled?: boolean;
}

export function Picker({ value, onValueChange, placeholder, items, disabled }: PickerProps) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const selectedLabel = items.find((i) => i.value === value)?.label ?? '';

  function open() {
    if (!disabled) sheetRef.current?.present();
  }

  function select(v: string) {
    onValueChange(v);
    sheetRef.current?.dismiss();
  }

  return (
    <>
      <Pressable
        onPress={open}
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        disabled={disabled}
      >
        <Text style={value ? styles.valueText : styles.placeholderText} numberOfLines={1}>
          {value ? selectedLabel : placeholder}
        </Text>
        <ChevronDown size={18} color={disabled ? colors.muted : colors.primary} />
      </Pressable>

      <BottomSheetModal ref={sheetRef} snapPoints={['50%', '80%']} index={0}>
        <BottomSheetView>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {items.map((item) => (
              <Pressable
                key={item.value}
                onPress={() => select(item.value)}
                style={[styles.option, item.value === value && styles.optionSelected]}
              >
                <Text style={[styles.optionText, item.value === value && styles.optionTextSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}


const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  triggerDisabled: {
    opacity: 0.6,
    backgroundColor: colors.bg,
  },
  valueText: {
    ...typography.body,
    flex: 1,
  },
  placeholderText: {
    flex: 1,
    fontSize: 14,
    color: colors.muted,
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  option: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  optionSelected: {
    backgroundColor: colors.pressed,
  },
  optionText: typography.body,
  optionTextSelected: {
    fontWeight: '600',
    color: colors.primary,
  },
});
