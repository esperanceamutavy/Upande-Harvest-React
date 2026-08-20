// Button — packhouse contract (mark-judah/upande-packhouse → src/core/ui/Button.tsx).
//
// Pill radius, minHeight 48, Poppins bold label, primary/outline/ghost,
// optional leading icon, built-in loading spinner.
//
// TWO ADAPTATIONS from the reference:
//   1. `iconLeft` is a lucide component, not an Ionicons glyph name (hard
//      constraint 1). Pass the icon itself: `iconLeft={Trash2}`.
//   2. The reference takes `label`; this app's existing callers pass
//      `children`. Both are supported so screens can migrate independently —
//      `label` wins when both are given. `children` must be text, since it is
//      rendered inside a <Text>. See RESTYLE_PLAN.md Phase 4.

import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react-native';

import { borderRadius, colors, fontFamily, fontSize, spacing } from './theme';

interface ButtonProps {
  /** Preferred. Falls back to `children` when absent. */
  label?: string;
  /** Legacy call style — must be text. Ignored when `label` is set. */
  children?: ReactNode;
  onPress?: () => void;
  /** Overrides the fill (primary) or the outline/text colour (outline, ghost). */
  color?: string;
  disabled?: boolean;
  /** Replaces the label with an inline spinner and blocks presses. */
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  iconLeft?: LucideIcon;
  style?: ViewStyle;
}

export function Button({
  label,
  children,
  onPress,
  color = colors.primary,
  disabled,
  loading,
  variant = 'primary',
  iconLeft: IconLeft,
  style,
}: ButtonProps) {
  const isDisabled = !!disabled || !!loading;
  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';

  const bg = isOutline || isGhost ? 'transparent' : color;
  const fg = isOutline || isGhost ? color : colors.textOnPrimary;
  const borderColor = isGhost ? 'transparent' : color;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor, opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.inner}>
          {IconLeft ? <IconLeft size={18} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]}>{label ?? children}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontFamily: fontFamily.bold, fontSize: fontSize.md },
});
