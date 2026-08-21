// Segmented — pill-shaped single-select with a spring-animated indicator.
// Port of packhouse's src/core/ui/Segmented.tsx.
//
// ONE DEVIATION: the reference hard-codes `marginBottom: spacing.md` on the
// container. Ours does not — every consumer here sits inside a <Card> whose
// content is already gap-spaced, so a baked-in margin would double up. Callers
// that need spacing pass `style`.

import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import { borderRadius, colors, fontFamily, fontSize } from './theme';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Used instead of `label` when the measured segment is too narrow for it.
   *  Lets a caller write the clearer label and degrade rather than clip. */
  shortLabel?: string;
}

// Rough advance width per character at `fontSize.sm` in the medium weight. Only
// used to decide between two labels, so an approximation is fine — the input it
// matters against, `segmentWidth`, is really measured.
const CHAR_WIDTH = 7.2;
const LABEL_PADDING = 8;

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
  style?: ViewStyle;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  style,
}: SegmentedProps<T>) {
  const [containerWidth, setContainerWidth] = useState(0);

  const activeIndex = useMemo(
    () => Math.max(0, options.findIndex((o) => o.value === value)),
    [value, options],
  );

  const PADDING = 4;
  const innerWidth = Math.max(0, containerWidth - PADDING * 2);
  const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;
  // Lazy useState, not useRef. The reference holds the Animated.Value in a ref
  // and reads `.current` during render, which React 19's react-hooks rules
  // reject ("Cannot access refs during render"). Fixing forward per hard
  // constraint 2 — packhouse is on React 18, where this was still allowed.
  const [anim] = useState(() => new Animated.Value(activeIndex));

  useEffect(() => {
    Animated.spring(anim, {
      toValue: activeIndex,
      useNativeDriver: true,
      friction: 8,
      tension: 60,
    }).start();
  }, [activeIndex, anim]);

  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  return (
    <View style={[styles.container, style]} onLayout={onLayout}>
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.indicator,
            {
              width: segmentWidth,
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: options.map((_, i) => i),
                    outputRange: options.map((_, i) => i * segmentWidth),
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}

      {options.map((opt) => {
        const active = opt.value === value;
        // Before layout `segmentWidth` is 0; show the full label then, so the
        // intended text wins whenever there is any doubt.
        const tooNarrow =
          segmentWidth > 0 && opt.label.length * CHAR_WIDTH > segmentWidth - LABEL_PADDING;
        const label = tooNarrow && opt.shortLabel ? opt.shortLabel : opt.label;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={styles.btn}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    padding: 4,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    zIndex: 1,
  },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textMuted },
  labelActive: { fontFamily: fontFamily.semiBold, color: colors.text },
});
