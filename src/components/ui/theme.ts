export const colors = {
  primary: '#44433e',
  accent: '#699dcd',
  success: '#48773E',
  bg: '#F4F4F6',
  surface: '#FFFFFF',
  warning: '#c07020',
  error: '#c0392b',
  muted: 'rgba(68,67,62,0.4)',
  border: 'rgba(68,67,62,0.25)',
  borderLight: 'rgba(68,67,62,0.15)',
  pressed: 'rgba(68,67,62,0.06)',
} as const;

export const radii = { sm: 4, md: 8, lg: 12, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const typography = {
  label: { fontSize: 14, fontWeight: '600' as const, color: colors.primary },
  body: { fontSize: 14, color: colors.primary },
  small: { fontSize: 13, color: colors.primary },
  title: { fontSize: 18, fontWeight: 'bold' as const, color: '#fff' },
  hint: { fontSize: 13, color: colors.muted },
  error: { fontSize: 12, color: colors.error },
};
