// Design tokens — adopted from the v2 reference (upande-harvest-v2-reference/src/theme.ts):
// its neutral palette structure, DM Sans/Poppins typography, radii, and shadows.
// Xflora's brand accent (#699dcd) is preserved. See DESIGN_PORT_PLAN.md §1.

export const fontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const colors = {
  // Dark neutral (reference #171717) — text, dark surfaces, AppBar, primary buttons.
  primary: '#171717',
  // Xflora brand accent — KEPT. Interactive accents, links, focus rings.
  accent: '#699dcd',

  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',

  // Text ramp
  textSecondary: '#525252',
  muted: '#A3A3A3',

  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',

  border: '#E5E5E5',
  borderLight: '#F0F0F0',
  pressed: '#F5F5F5',
  overlay: 'rgba(0,0,0,0.4)',
} as const;

export const radii = { sm: 6, md: 10, lg: 14, xl: 20, pill: 9999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

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
} as const;

// Keys are backward-compatible with existing screens. Headings/labels use Poppins;
// body/hint use DM Sans. `title` is white for the dark AppBar.
export const typography = {
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.primary },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.primary },
  small: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.primary },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: '#fff' },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.muted },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.error },
} as const;
