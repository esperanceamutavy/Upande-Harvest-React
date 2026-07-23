import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { ReactNode } from 'react';
import { colors, fontFamily, fontSize, radii, spacing } from './theme';

interface ButtonProps {
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  children: ReactNode;
  style?: ViewStyle;
}

export function Button({ onPress, disabled, variant = 'primary', children, style }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : styles.ghost,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={variant === 'primary' ? styles.primaryText : styles.ghostText}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.6,
  },
  primaryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: '#fff',
  },
  ghostText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
});
