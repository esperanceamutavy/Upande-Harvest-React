// Card and Notice — the two grouping primitives from the packhouse design
// system (mark-judah/upande-packhouse → src/core/ui/Card.tsx).
//
// Card is the reason packhouse screens read as one family: every logical form
// section lives in one, under an uppercase micro-title.
//
// The inline message component is exported as `Notice`, not packhouse's
// `Alert`, so it can never collide with react-native's `Alert.alert` — which
// AppDrawer.tsx already uses for the logout confirm, and which the screens
// migrated in Phase 3 use too.
//
// Icons are lucide per hard constraint 1. lucide 1.x renamed these icons to
// TriangleAlert / CircleAlert / CircleCheck; the old AlertTriangle /
// AlertCircle / CheckCircle2 names still resolve as back-compat aliases, but
// new code uses the current names.

import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';

import { colors, fontFamily, fontSize, radii, spacing, typography } from './theme';

export function Card({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

export type NoticeTone = 'info' | 'success' | 'warn' | 'danger';

// Paired background/foreground per tone. These are deliberately local rather
// than in theme.ts — they are the only place in the system that uses them, and
// the Phase 1 token layer is closed.
const TONE_BG: Record<NoticeTone, string> = {
  info: '#EEF2FF',
  success: '#F0FDF4',
  warn: '#FFFBEB',
  danger: '#FEF2F2',
};

const TONE_FG: Record<NoticeTone, string> = {
  info: '#3730A3',
  success: '#166534',
  warn: '#92400E',
  danger: '#991B1B',
};

const TONE_ICON: Record<NoticeTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warn: TriangleAlert,
  danger: CircleAlert,
};

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: NoticeTone;
  children: ReactNode;
}) {
  const Icon = TONE_ICON[tone];
  const fg = TONE_FG[tone];

  return (
    <View style={[styles.notice, { backgroundColor: TONE_BG[tone] }]}>
      <Icon size={16} color={fg} style={styles.noticeIcon} />
      <Text style={[styles.noticeText, { color: fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.eyebrow,
    marginBottom: spacing.md,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  noticeIcon: { marginTop: 1 },
  noticeText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
});
