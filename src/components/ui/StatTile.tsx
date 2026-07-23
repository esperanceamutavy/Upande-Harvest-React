import { StyleSheet, Text, View } from 'react-native';
import { fontFamily, radii, spacing } from './theme';

// Bento-style stat tile ported from the v2 reference Dashboard: dark rounded card,
// uppercase letter-spaced chip label, big number, small muted unit.
export type StatTone = 'blue' | 'green' | 'stone';

const TONE_BG: Record<StatTone, string> = {
  blue: '#0F2744',
  green: '#052E16',
  stone: '#1C1917',
};

interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  tone: StatTone;
  /** Full-width emphasis tile (larger number + height). */
  hero?: boolean;
}

export function StatTile({ label, value, unit, tone, hero }: StatTileProps) {
  return (
    <View style={[styles.tile, hero && styles.heroTile, { backgroundColor: TONE_BG[tone] }]}>
      <Text style={styles.chip}>{label}</Text>
      <Text style={[styles.value, hero && styles.heroValue]}>{value}</Text>
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
    minHeight: 110,
    justifyContent: 'flex-end',
  },
  heroTile: {
    minHeight: 150,
    borderRadius: 24,
  },
  chip: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  value: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    lineHeight: 36,
    color: '#FFFFFF',
  },
  heroValue: {
    fontSize: 48,
    lineHeight: 52,
  },
  unit: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
});
