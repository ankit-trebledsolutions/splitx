// Legacy light palette of the first screens (Button, EmptyState, the light
// TextField variant). The app's real palettes are `dark` and `light` below.
export const colors = {
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#16A34A',
  danger: '#DC2626',
};

// The two palettes and the hooks that hand screens the active one. Screens
// read colours through useTheme() / useStyles(makeStyles), never from `dark`
// directly, so the Appearance setting can switch them.
export { dark, light } from './palettes';
export { ThemeProvider, useTheme, useThemeMode, useStyles, THEME_MODES } from './ThemeContext';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
};
