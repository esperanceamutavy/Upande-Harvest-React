# Design System v2 — DRAFT

Status: parked. Not applied to the app. To be implemented in a dedicated v1.2 redesign pass.

## Why not now

- v1 ships first with current colors (working on pilot's phone)
- v1.1 adds Phase 4.4 Rejects + filter + Upande logo (queued for EAS rebuild)
- v1.2 would be the visual redesign — apply this design system then

## Open questions to resolve before applying

- What replaces `colors.accent` (#699dcd blue) in the new palette? Currently used for: "Scan QR" button, "Change →" links, info Pills
- Has Wycliffe seen and approved this direction?
- Has pilot grader given feedback that current visuals don't work?

## Design tokens

\`\`\`typescript
export const colors = {
  primary: '#171717',
  primaryMuted: '#F5F5F5',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',
  text: '#171717',
  textSecondary: '#525252',
  textMuted: '#A3A3A3',
  textOnPrimary: '#FFFFFF',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  border: '#E5E5E5',
  overlay: 'rgba(0, 0, 0, 0.4)',
  // Coffee-flavoured accents — used sparingly for chart segments / illustrations,
  // never for chrome (which stays monochrome to match Upande Harvest).
  cherry: '#A8261C',
  cherrySoft: '#FBE7E5',
  parchment: '#C9A77A',
  parchmentSoft: '#F6EEDF',
  roast: '#3E2C20',
};

export const fontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
};

export const typography = {
  h1: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: colors.text } as const,
  h2: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text } as const,
  h3: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text } as const,
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text } as const,
  bodySmall: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary } as const,
  caption: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted } as const,
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text } as const,
  mono: { fontFamily: 'monospace', fontSize: fontSize.md, color: colors.text } as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
};
\`\`\`

## Implementation steps (for future v1.2 work)

1. Install fonts: \`npx expo install expo-font @expo-google-fonts/dm-sans @expo-google-fonts/poppins\`
2. Load fonts in root layout before rendering
3. Replace existing \`src/components/ui/theme.ts\` with new tokens
4. Decide accent replacement (probably \`roast\` or solid \`text\`)
5. Update every screen's StyleSheet to use new color/typography references
6. Test on device
7. New EAS build
