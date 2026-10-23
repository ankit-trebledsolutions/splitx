// The two colour palettes. Every key exists in both, so a screen written
// against `theme.x` works in either; `dark` keeps the values the app has
// always used, `light` is its daylight counterpart (every text colour clears
// 4.5:1 on white). Screens get the active one from useTheme() (ThemeContext).

// Dark palette, the original Splix look (per Figma).
export const dark = {
  isDark: true,
  statusBar: 'light',

  // Two-tone scheme used across the app: deep base with slightly raised cards.
  background: '#05070A',
  card: '#0E1014',
  card2: '#1A1C20',
  backgroundAlt: '#0A1614',
  surface: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.10)',
  text: '#F4F7FA',
  textMuted: '#8A97A6',
  textSoft: '#C7D1DB',
  textFaint: 'rgba(244,247,250,0.45)',
  textDisabled: 'rgba(244,247,250,0.22)',
  placeholder: 'rgba(255,255,255,0.25)',
  accentBlue: '#4A7DF7',
  // Teal as text and icons. On dark it is the same teal as the fills.
  accentGreen: '#00C4D0',
  // Teal as a fill (buttons, chips, sent bubbles), with #04121C ink on top.
  accentFill: '#00C4D0',
  tabActive: '#00C6A8',
  link: '#5B8CFF',
  button: '#00C4D0',
  gradient: ['#4A8CFF', '#00E5A0'],
  glowGradient: ['#00C4D0', '#00E5A0'],

  // Surfaces that had their own hex: bottom sheets, popovers and suggestion
  // cards, chat bubbles from others, the chat composer, picker panels.
  sheet: '#0C1418',
  raised: '#0F1A20',
  chatCard: '#12191E',
  bubble: '#161D22',
  composer: '#080D10',
  panel: '#121B1F',
  panelClear: 'rgba(18,27,31,0)',
  readCard: '#090B0E',
  successTint: '#0B3D2E',

  // Translucent highlights laid over cards: icon tiles, dividers, pressed
  // segments. White on dark, ink on light.
  overlayFaint: 'rgba(255,255,255,0.05)',
  overlay: 'rgba(255,255,255,0.08)',
  overlayStrong: 'rgba(255,255,255,0.14)',
  overlayBold: 'rgba(255,255,255,0.25)',
  ripple: 'rgba(255,255,255,0.12)',

  // Status colours as text and icons.
  danger: '#F87171',
  warning: '#F5B342',
  success: '#17E695',
  coral: '#F97362',
  owe: '#F5883C',
  stay: '#B79CFF',

  // The itinerary road (progress strip + roadmap).
  road: {
    done: '#00C4D0',
    now: '#F6B042',
    base: 'rgba(255,255,255,0.14)',
    edge: 'rgba(255,255,255,0.32)',
    ink: '#04241A',
  },

  // Colours that come from data tables (priorities, statuses, notification
  // tints) are bright for a dark background; on light they need a deeper
  // shade when used as text. Dark keeps them as they are.
  ink: (color) => color,
};

// Deeper twins of the bright data-table colours, for text on white.
const INK_TABLE = {
  '#F87171': '#DC2626',
  '#EF4444': '#DC2626',
  '#F5B342': '#B45309',
  '#F6B042': '#B45309',
  '#F59E0B': '#B45309',
  '#17E695': '#15803D',
  '#22C55E': '#15803D',
  '#2EE6A8': '#15803D',
  '#F97362': '#C2410C',
  '#F5883C': '#B8560E',
  '#2DD4BF': '#0E7C83',
  '#00C4D0': '#0E7C83',
  '#00C6A8': '#0B7F73',
  '#00E5A0': '#0B7F73',
  '#B79CFF': '#6D4ED8',
  '#8B5CF6': '#6D28D9',
  '#7C6BF5': '#5B4BD6',
  '#4A7DF7': '#2F5FD6',
  '#4A8CFF': '#2F5FD6',
  '#5B8CFF': '#2F5FD6',
  '#3FA9F5': '#1D6FB8',
  '#F472B6': '#BE185D',
  '#EC6BB4': '#BE185D',
  '#8A97A6': '#5F6D7E',
  '#C7D1DB': '#4B5A6A',
  '#C3CBD5': '#4B5A6A',
};

// Any other hex colour: keep its hue, cap its lightness so it reads on white.
const darkenHex = (hex) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  if (l <= 0.36) return hex;
  const d = max - min;
  let s = 0;
  let hue = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  l = 0.36;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const mm = l - c / 2;
  let rgb;
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return `#${rgb
    .map((v) => Math.round((v + mm) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
};

// Light palette: cool off-white base with white cards, the brand gradient and
// teal fills kept, teal/blue/red/amber deepened wherever they are text.
export const light = {
  isDark: false,
  statusBar: 'dark',

  background: '#F3F6FA',
  card: '#FFFFFF',
  card2: '#FFFFFF',
  backgroundAlt: '#EEF5F3',
  surface: '#FFFFFF',
  border: '#E3E8EF',
  text: '#0F1A20',
  textMuted: '#5F6D7E',
  textSoft: '#4B5A6A',
  textFaint: '#8593A3',
  textDisabled: 'rgba(15,26,32,0.28)',
  placeholder: 'rgba(15,26,32,0.30)',
  accentBlue: '#2F5FD6',
  accentGreen: '#0E7C83',
  accentFill: '#00C4D0',
  tabActive: '#0B7F73',
  link: '#2F5FD6',
  button: '#00C4D0',
  gradient: ['#4A8CFF', '#00E5A0'],
  glowGradient: ['#00C4D0', '#00E5A0'],

  sheet: '#FFFFFF',
  raised: '#FFFFFF',
  chatCard: '#FFFFFF',
  bubble: '#FFFFFF',
  composer: '#FFFFFF',
  panel: '#FFFFFF',
  panelClear: 'rgba(255,255,255,0)',
  readCard: '#EEF2F6',
  successTint: '#DCFCE7',

  overlayFaint: 'rgba(15,26,32,0.04)',
  overlay: 'rgba(15,26,32,0.06)',
  overlayStrong: 'rgba(15,26,32,0.10)',
  overlayBold: 'rgba(15,26,32,0.18)',
  ripple: 'rgba(15,26,32,0.10)',

  danger: '#DC2626',
  warning: '#B45309',
  success: '#15803D',
  coral: '#C2410C',
  owe: '#B8560E',
  stay: '#6D4ED8',

  road: {
    done: '#00C4D0',
    now: '#F6B042',
    base: 'rgba(15,26,32,0.14)',
    edge: 'rgba(15,26,32,0.30)',
    ink: '#04241A',
  },

  ink: (color) =>
    typeof color === 'string' ? INK_TABLE[color.toUpperCase()] ?? darkenHex(color) : color,
};
