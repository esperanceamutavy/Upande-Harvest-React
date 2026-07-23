import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, radii, spacing } from './theme';

type Variant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const VARIANT_COLORS: Record<Variant, string> = {
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  info: colors.accent,
  neutral: colors.primary,
};

interface PillProps {
  variant: Variant;
  children: ReactNode;
}

export function Pill({ variant, children }: PillProps) {
  const solidColor = VARIANT_COLORS[variant];
  return (
    <View style={[styles.pill, { backgroundColor: solidColor + '1A' }]}>
      <Text style={[styles.text, { color: solidColor }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
  },
});
