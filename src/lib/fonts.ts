import React from 'react';
import { Text, TextInput } from 'react-native';
import {
  DMSans_400Regular,
  DMSans_500Medium,
} from '@expo-google-fonts/dm-sans';
import { Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';

import { fontFamily } from '../components/ui/theme';

/** Font map for expo-font's useFonts() — loaded in the root layout before render. */
export const APP_FONTS = {
  DMSans_400Regular,
  DMSans_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
};

// Make DM Sans the app-wide default typeface. Overriding Text/TextInput.render
// (rather than defaultProps, which only fills when `style` is undefined) prepends
// the default family as the lowest-priority style, so any element that sets its
// own fontFamily (e.g. Poppins headings via the typography tokens) still wins.
// Runs once as an import side-effect, before the first render.
type StyledElement = React.ReactElement<{ style?: unknown }>;

function patchDefaultFont(Component: unknown): void {
  const C = Component as {
    render?: (...args: unknown[]) => StyledElement;
    __fontPatched?: boolean;
  };
  if (!C || typeof C.render !== 'function' || C.__fontPatched) return;
  const original = C.render;
  C.render = function patchedRender(...args: unknown[]) {
    const element = original.apply(this, args);
    return React.cloneElement(element, {
      style: [{ fontFamily: fontFamily.regular }, element.props.style],
    });
  };
  C.__fontPatched = true;
}

patchDefaultFont(Text);
patchDefaultFont(TextInput);
