// The colours the dashboard draws its data in. Text never wears one of these:
// labels and values stay in the theme's text tokens, and a coloured mark beside
// them says which series it is.

// Tailwind's blue-500, which is this theme's --chart-1 (src/styles/globals.css).
// It is written out as a hex because ApexCharts shades the series colour itself
// to build the area gradient, and it cannot do that to a CSS variable or to an
// oklch() value. The panel's --primary would not do either: here it is a
// near-black zinc, not the blue Metronic's charts are drawn in.
export const SERIES_COLOR = '#2b7fff';

// The same blue for bars that are plain markup.
export const SERIES_BAR = 'bg-blue-500';

// Axis text and grid lines can stay as theme variables: the browser resolves
// them where they are drawn, so they follow the dark mode switch on their own.
export const AXIS_LABEL_COLOR = 'var(--color-secondary-foreground)';
export const GRID_COLOR = 'var(--color-border)';

// How people sign in. Blue beside orange was checked for colour-blind readers
// in light and dark mode and holds up in both. Blue beside violet did not: the
// two cannot be told apart with deuteranopia. Green and red are left out on
// purpose, because in this panel they mean success and failure.
export const SIGN_IN_COLORS = {
  password: 'bg-blue-500',
  google: 'bg-orange-600',
};
