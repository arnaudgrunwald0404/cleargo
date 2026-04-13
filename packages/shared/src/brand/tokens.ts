/**
 * @anthropic-internal/shared - Design Tokens
 *
 * Single source of truth for color palette, typography, spacing, shadows,
 * radii, transitions, z-index, and breakpoints. Consumed by:
 *   - CSS variable generation (globals.css)
 *   - Mantine theme config
 *   - Tailwind theme extension
 *   - Component style props
 *   - Brand guidelines skill (enforcement)
 *
 * Naming convention follows the ClearGo metallurgical palette:
 * Primary metals (White, Platinum, Cast Iron) + Signature accents (Alloy, Copper)
 * + Secondary metals (Bronze, Verdigris, Steel, Pewter, White Gold, Brass)
 */

// ============================================================================
// COLOR PALETTE
// ============================================================================

export const colors = {
  // ---------- Primary ----------
  white: '#FFFFFF',
  platinum: '#FAF8F5',
  castIron: '#37352A',

  // ---------- Signature Accents ----------
  alloy: '#FFA680',
  copper: '#FF7A52',
  copperHover: '#E66E4A',
  copperBg: 'rgba(255, 122, 82, 0.2)',

  // ---------- Secondary ----------
  bronze: '#6C3A2A',
  verdigris: '#9EB4AB',
  steel: '#697771',
  pewter: '#A1B4BA',
  whiteGold: '#F4EBD7',
  brass: '#C3B497',
  brassHover: '#B0A086',
  brassBg: 'rgba(195, 180, 151, 0.2)',

  // ---------- Semantic ----------
  success: { light: '#D1FAE5', base: '#10B981', dark: '#065F46' },
  warning: { light: '#FEF3C7', base: '#FAB005', dark: '#92400E' },
  error: { light: '#FEE2E2', base: '#EF4444', dark: '#991B1B' },
  info: { light: '#DBEAFE', base: '#228BE6', dark: '#1E40AF' },

  // ---------- Neutral grays ----------
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  black: '#000000',

  // ---------- Extended blue (for UI elements) ----------
  blue: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#228BE6',
    700: '#1C7ED6',
    800: '#1E40AF',
    900: '#1E3A8A',
    material: '#2196F3',
    materialDark: '#1976D2',
  },
} as const;

// Mantine 10-step color scales (required by createTheme)
export const mantineColorScales = {
  brass: [
    '#F5F2EC', '#EDE8E0', '#E2DBCF', '#D5CBB9', '#CABDA8',
    '#C3B497', '#B0A086', '#9A8B6E', '#847558', '#6E6044',
  ],
  blue: [
    '#E7F5FF', '#D0EBFF', '#A5D8FF', '#74C0FC', '#4DABF7',
    '#339AF0', '#228BE6', '#1C7ED6', '#1971C2', '#1864AB',
  ],
  green: [
    '#EBFBEE', '#D3F9D8', '#B2F2BB', '#8CE99A', '#69DB7C',
    '#51CF66', '#40C057', '#37B24D', '#2F9E44', '#12B886',
  ],
  yellow: [
    '#FFF9DB', '#FFF3BF', '#FFEC99', '#FFE066', '#FFD43B',
    '#FCC419', '#FAB005', '#F59F00', '#F08C00', '#E67700',
  ],
  red: [
    '#FFF5F5', '#FFE3E3', '#FFC9C9', '#FFA8A8', '#FF8787',
    '#FF6B6B', '#FA5252', '#F03E3E', '#E03131', '#C92A2A',
  ],
  copper: [
    '#FFF5F2', '#FFE8E0', '#FFD4C7', '#FFB8A3', '#FF9A7F',
    '#FF8A65', '#FF7A52', '#E86A3D', '#D15A2E', '#B84A22',
  ],
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const typography = {
  // ---------- Font families ----------
  families: {
    heading: '"Atkinson Hyperlegible", system-ui, -apple-system, sans-serif',
    body: '"Public Sans", Inter, system-ui, -apple-system, sans-serif',
    display: '"Marcellus", serif',
    mono: '"Fira Code", "Courier New", monospace',
    ui: 'Inter, system-ui, -apple-system, sans-serif',
  },

  // ---------- Font sizes ----------
  sizes: {
    xs: '12px',
    sm: '13px',
    base: '14px',
    md: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '28px',
    '4xl': '32px',
  },

  // ---------- Semantic type scale ----------
  hierarchy: {
    pageTitle:    { size: '32px', weight: 700, family: 'display' as const },
    sectionTitle: { size: '28px', weight: 700, family: 'heading' as const },
    cardTitle:    { size: '24px', weight: 700, family: 'heading' as const },
    subsection:   { size: '20px', weight: 600, family: 'heading' as const },
    bodyLarge:    { size: '18px', weight: 400, family: 'body' as const },
    body:         { size: '14px', weight: 400, family: 'body' as const },
    bodySmall:    { size: '13px', weight: 400, family: 'body' as const },
    caption:      { size: '12px', weight: 400, family: 'body' as const },
  },

  // ---------- Font weights ----------
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // ---------- Line heights ----------
  lineHeights: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// ============================================================================
// SPACING
// ============================================================================

export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
  32: '128px',
} as const;

// ============================================================================
// SHADOWS
// ============================================================================

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
} as const;

// ============================================================================
// BORDER RADIUS
// ============================================================================

export const radii = {
  none: '0',
  sm: '4px',
  base: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

// ============================================================================
// TRANSITIONS
// ============================================================================

export const transitions = {
  fast: '0.15s ease',
  base: '0.2s ease',
  slow: '0.3s ease',
} as const;

// ============================================================================
// Z-INDEX
// ============================================================================

export const zIndex = {
  base: 1,
  dropdown: 100,
  sticky: 200,
  fixed: 300,
  modal: 400,
  popover: 500,
  tooltip: 600,
  aiPanel: 1000,
} as const;

// ============================================================================
// BREAKPOINTS
// ============================================================================

export const breakpoints = {
  xs: '36em',   // 576px
  sm: '48em',   // 768px
  md: '62em',   // 992px
  lg: '75em',   // 1200px
  xl: '88em',   // 1408px
} as const;

// ============================================================================
// LAYOUT
// ============================================================================

export const layout = {
  page: {
    maxWidth: '1280px',
    paddingX: { mobile: '16px', sm: '24px', lg: '32px' },
    paddingTop: '32px',
  },
  nav: {
    height: '64px',
    paddingX: '24px',
    paddingY: '16px',
    bg: colors.castIron,
    text: colors.white,
  },
  card: {
    bg: colors.white,
    border: colors.gray[200],
    radius: radii.md,
    padding: '16px',
    shadow: shadows.base,
    shadowHover: shadows.md,
  },
  button: {
    height: '40px',
    padding: '10px 20px',
    radius: radii.base,
    primaryBg: colors.brass,
    primaryHover: colors.brassHover,
    primaryText: colors.castIron,
  },
  table: {
    bg: colors.white,
    border: colors.gray[200],
    headerBg: colors.gray[50],
    headerText: colors.gray[500],
    rowHover: colors.gray[50],
    cellPadding: '12px 16px',
    steelHeader: colors.steel,
    platinumHeaderText: colors.platinum,
  },
} as const;

// ============================================================================
// STATUS BADGE COLORS
// ============================================================================

export const statusBadges = {
  open:     { bg: colors.blue.material, text: colors.white },
  draft:    { bg: '#60A5FA',            text: colors.white },
  inReview: { bg: colors.warning.base,  text: colors.white },
  onHold:   { bg: '#14B8A6',            text: colors.white },
  closed:   { bg: colors.gray[700],     text: colors.white },
  go:       { bg: colors.success.base,  text: colors.white },
  noGo:     { bg: colors.error.base,    text: colors.white },
  conditional: { bg: colors.alloy,      text: colors.castIron },
} as const;
