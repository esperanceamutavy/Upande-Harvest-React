import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { colors, spacing, typography } from './theme';

interface AppBarProps {
  title: string;
  onBack?: () => void;
  rightAction?: { icon: ReactNode; onPress: () => void };
}

export function AppBar({ title, onBack, rightAction }: AppBarProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} style={styles.iconBtn}>
            <ArrowLeft size={24} color="white" />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.side}>
        {rightAction ? (
          <Pressable onPress={rightAction.onPress} hitSlop={8} style={styles.iconBtn}>
            {rightAction.icon}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  side: {
    width: 36,
    alignItems: 'center',
  },
  title: {
    ...typography.title,
    flex: 1,
    textAlign: 'left',
  },
  iconBtn: { padding: 4 },
});
