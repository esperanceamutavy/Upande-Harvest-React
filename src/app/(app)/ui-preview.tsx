// THROWAWAY — Phase 2 verification harness (RESTYLE_PLAN.md §4).
//
// Exercises every Screen state and both Card/Notice primitives standalone,
// before any real screen is migrated in Phase 3. Registered `href: null` in
// (app)/_layout.tsx so it stays off the tab bar but still renders *inside* the
// tab group — which is the point: the footer demo has to be judged with the
// bottom tab bar actually present.
//
// PHASE 5 CLEANUP — three things to delete, not one:
//   1. this file, src/app/(app)/ui-preview.tsx
//   2. its <Tabs.Screen name="ui-preview" href={null} /> entry in
//      src/app/(app)/_layout.tsx
//   3. the { label: 'UI Preview', … } row in
//      src/features/navigation/drawerItems.ts (WORKFLOW_ITEMS)
// Also listed in RESTYLE_PLAN.md §7 in case this file is read in isolation.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui/Button';
import { Card, Notice } from '../../components/ui/Card';
import { Screen } from '../../components/ui/Screen';
import { colors, fontFamily, fontSize, radii, spacing, typography } from '../../components/ui/theme';

const DEMOS = ['default', 'loading', 'error', 'refresh', 'no-scroll', 'footer'] as const;
type Demo = (typeof DEMOS)[number];

export default function UiPreview() {
  const [demo, setDemo] = useState<Demo>('default');
  // Footer treatment A/B. `false` = shipped (shadow, no rule). `true` =
  // packhouse reference (hairline top border) — simulated inside the slot so
  // both can be compared on-device without changing Screen's API.
  const [refFooter, setRefFooter] = useState(false);

  const picker = (
    <View style={styles.picker}>
      {DEMOS.map((d) => (
        <Pressable
          key={d}
          onPress={() => setDemo(d)}
          style={[styles.chip, demo === d && styles.chipOn]}
        >
          <Text style={[styles.chipText, demo === d && styles.chipTextOn]}>{d}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (demo === 'loading') {
    return (
      <Screen title="Loading state" loading>
        <View />
      </Screen>
    );
  }

  if (demo === 'error') {
    return (
      <Screen
        title="Error state"
        error="Request failed: could not reach xflora.upande.com. Check the coldroom Wi-Fi and retry."
        onRetry={() => setDemo('default')}
      >
        <View />
      </Screen>
    );
  }

  if (demo === 'refresh') {
    return (
      <Screen
        title="Pull to refresh"
        onRefresh={() => new Promise((resolve) => setTimeout(resolve, 1200))}
      >
        {picker}
        <Card title="Pull down">
          <Text style={styles.body}>
            The spinner should tint near-black, not blue. Release and it resolves after 1.2s.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (demo === 'no-scroll') {
    return (
      <Screen title="No scroll" scroll={false}>
        {picker}
        <View style={styles.fillBox}>
          <Text style={styles.body}>
            scroll={'{false}'} — this box flexes to fill. Content must not scroll.
          </Text>
        </View>
      </Screen>
    );
  }

  if (demo === 'footer') {
    return (
      <Screen
        title="Footer + tab bar"
        footer={
          <View style={refFooter ? styles.refFooterRule : undefined}>
            <Button onPress={() => setRefFooter((v) => !v)}>
              {refFooter ? 'Reference: hairline rule' : 'Shipped: shadow, no rule'}
            </Button>
          </View>
        }
      >
        {picker}
        <Card title="What to look at">
          <Text style={styles.body}>
            Look at the strip between this footer and the tab bar below it. Tap the footer button
            to toggle treatments.
          </Text>
        </Card>
        <Notice tone="warn">
          Reference = two hairlines (one above the footer, one at the tab bar) bracketing two white
          bars. Shipped = one hairline, the tab bar&apos;s own, with a soft shadow lifting the
          footer off the content.
        </Notice>
        <View style={styles.tall} />
      </Screen>
    );
  }

  return (
    <Screen title="UI Preview">
      {picker}

      <Card title="Card with title">
        <Text style={styles.body}>
          White surface, hairline border, radius 10, uppercase eyebrow title with 0.4 letter
          spacing. This is the Phase 3 form-section container.
        </Text>
      </Card>

      <Card>
        <Text style={styles.body}>Untitled card — no eyebrow, same shell.</Text>
      </Card>

      <Card title="Notice tones">
        <Notice tone="info">Info — monochrome system, but the notice keeps an indigo tint.</Notice>
        <Notice tone="success">Success — 24 buckets received against GRN-0041.</Notice>
        <Notice tone="warn">Warn — partial bucket override is server-enforced at the ceiling.</Notice>
        <Notice tone="danger">Danger — no farm configured. Set one in Configure first.</Notice>
      </Card>

      <Card title="Header checks">
        <Text style={styles.body}>
          Title centred, hamburger left, symmetric spacer right. Tap the hamburger — AppDrawer
          should slide in over this screen.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnPrimary },

  body: { ...typography.body, color: colors.textSecondary },
  fillBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  tall: { height: 400 },

  // Redraws the reference footer's hairline at exactly the position Screen's
  // own borderTop would occupy, cancelling the slot padding to reach the edges.
  refFooterRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: -spacing.lg,
    marginHorizontal: -spacing.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
});
