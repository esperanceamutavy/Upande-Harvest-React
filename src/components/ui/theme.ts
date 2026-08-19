// Design tokens — aligned to the Upande Packhouse design system
// (mark-judah/upande-packhouse → src/core/theme/index.ts) so the two apps read
// as one product in the field.
//
// CHANGES FROM THE PREVIOUS VERSION:
//   1. Xflora's steel-blue accent (#699dcd) is RETIRED. `colors.accent` now
//      aliases the neutral primary so the ~14 existing call sites go monochrome
//      with zero screen edits. It is deprecated — see RESTYLE_PLAN.md Phase 5
//      for the rename-and-delete pass.
//   2. `colors.bg` is #F5F5F5 (was #FAFAFA) to match packhouse's screen ground.
//   3. `typography.title` is now near-black (was #fff). The app bar flips from a
//      dark bar to a white surface with a hairline border — see Phase 2.
//   4. Added packhouse-parity keys: text / textMuted / textSecondary /
//      textOnPrimary / bgMuted / info, the h1–h3 + bodySmall/caption/mono type
//      ramp, an `eyebrow` style for Card titles, and a `borderRadius` alias
//      exposing `.full`.
//
// Existing export names are unchanged so every current import still compiles.

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
  // ---- Action / brand -----------------------------------------------------
  // Packhouse is deliberately monochrome: the primary action colour and the
  // informational colour are the same near-black.
  primary: '#171717',
  info: '#171717',

  /**
   * @deprecated Xflora's steel-blue (#699dcd) has been retired in favour of the
   * packhouse monochrome system. Kept as an alias so existing screens compile
   * and render correctly during the restyle. Do not use in new code — use
   * `primary` for actions, `text` for icons, `success` for affirmative accents.
   * Removed in Phase 5.
   */
  accent: '#171717',

  // ---- Surfaces -----------------------------------------------------------
  /** Screen ground. Packhouse calls this `bgMuted`. */
  bg: '#F5F5F5',
  bgMuted: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',

  // ---- Text ramp ----------------------------------------------------------
  text: '#171717',
  /** Secondary body copy. Packhouse's `textMuted`. */
  textMuted: '#6B6B6B',
  textSecondary: '#525252',
  textOnPrimary: '#FFFFFF',
  /**
   * Lightest tier — hint text, disabled state, inactive tab icons. Retained at
   * #A3A3A3 (packhouse's `gray400`) because the tab bar depends on it for
   * inactive contrast; `textMuted` is the one to reach for in body copy.
   */
  muted: '#A3A3A3',

  // ---- Status -------------------------------------------------------------
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',

  // ---- Lines & scrims -----------------------------------------------------
  border: '#E5E5E5',
  borderLight: '#F0F0F0',
  pressed: '#F5F5F5',
  overlay: 'rgba(0, 0, 0, 0.4)',
} as const;

export const radii = { sm: 6, md: 10, lg: 14, xl: 20, pill: 9999 } as const;

/** Packhouse-named alias of `radii`. `borderRadius.full` === `radii.pill`. */
export const borderRadius = {
  sm: radii.sm,
  md: radii.md,
  lg: radii.lg,
  xl: radii.xl,
  full: radii.pill,
} as const;

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

// Headings and labels use Poppins; body and hint use DM Sans. Weights are
// separate font files referenced by exact family string — never `fontWeight`.
export const typography = {
  // ---- Existing keys (kept for backward compatibility) --------------------
  /** Form field label, as used by Field.tsx. Left at semiBold/13 on purpose —
   *  see `eyebrow` for the uppercase micro-label Card uses. */
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text },
  small: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  /** App bar title. Now near-black for the white-surface header. */
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.muted },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.error },

  // ---- Packhouse ramp -----------------------------------------------------
  h1: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: colors.text },
  h2: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  h3: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  bodyBold: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  bodySmall: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  caption: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  /** Uppercase micro-label. This is the Card section title treatment. */
  eyebrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  mono: { fontFamily: 'monospace', fontSize: fontSize.md, color: colors.text },
} as const;
