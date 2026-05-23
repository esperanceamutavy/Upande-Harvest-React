import { createInterFont } from '@tamagui/font-inter';
import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from 'tamagui';

const interFont = createInterFont();

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  fonts: {
    ...defaultConfig.fonts,
    heading: interFont,
    body: interFont,
  },
  tokens: {
    ...defaultConfig.tokens,
    color: {
      ...defaultConfig.tokens.color,
      // Kikwetu brand tokens
      primary: '#44433e',
      accent: '#699dcd',
      success: '#48773E',
      background: '#F4F4F6',
    },
  },
});

export default tamaguiConfig;

export type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
