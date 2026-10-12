// MedNest design tokens — spec §2. Flat, clinical: no gradients, no shadows.
// Separation is done with 1dp borders and spacing only.

export type ThemeName = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  onAccent: string;
  warn: string;
  danger: string;
  ok: string;
}

// Calm clinical palette shared with the web app: medical teal (primary), soft blue
// (information), mint (supportive surfaces). Amber/red are status-only.
export const palettes: Record<ThemeName, Palette> = {
  light: {
    bg: '#F5F8F9',
    surface: '#FFFFFF',
    border: '#DDE6E9',
    text: '#10242C',
    textMuted: '#566A73',
    accent: '#0B7A75',
    onAccent: '#FFFFFF',
    warn: '#A35A07',
    danger: '#B42318',
    ok: '#18794E',
  },
  dark: {
    bg: '#0D1518',
    surface: '#141F23',
    border: '#26363C',
    text: '#E9F1F3',
    textMuted: '#9DB0B7',
    accent: '#3CC2B4',
    onAccent: '#04201D',
    warn: '#F2A64C',
    danger: '#F2776B',
    ok: '#5BD196',
  },
};

// Flat profile colour dots the user can pick from (§2.2).
export const PROFILE_DOT_COLORS = ['#0B7A75', '#1D4ED8', '#9333EA', '#C2410C'] as const;

// Spacing grid: 4dp base (§2.4).
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { card: 12, button: 12, chip: 8, field: 8 } as const;

export const layout = {
  screenPadding: 16,
  minTapTarget: 48,
  primaryButtonHeight: 52,
  bannerAdHeight: 50,
  borderWidth: 1, // all separation is 1dp borders
} as const;

// Typography (§2.3). Inter bundled; Urdu falls back to Noto Nastaliq/Naskh.
export const type = {
  title: { fontSize: 24, lineHeight: 32, fontWeight: '600' as const },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
} as const;

export const fonts = {
  sans: 'Inter',
  urdu: 'NotoNastaliqUrdu',
} as const;

export const icon = { size: 24, strokeWidth: 1.5 } as const;
