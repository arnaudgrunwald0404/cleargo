/**
 * @anthropic-internal/shared - Brand Guidelines Skill
 *
 * Programmatic enforcement and documentation of brand rules. This module
 * serves as the "brand cop" — it validates that colors, fonts, and layout
 * decisions conform to the design system.
 *
 * Use this in:
 *   1. Code reviews — lint CSS/style objects against the palette
 *   2. AI-assisted development — feed rules to LLM context
 *   3. Design handoffs — generate up-to-date spec sheets
 *   4. Onboarding — developers check rules at runtime
 *
 * Usage:
 *   import { brandGuidelines, validateColor } from '@anthropic-internal/shared/brand';
 *
 *   // Check if a hex color is in the approved palette
 *   validateColor('#FF7A52');  // { valid: true, name: 'copper', usage: 'Logo, primary accent, CTAs' }
 *   validateColor('#FF0000');  // { valid: false, suggestion: 'error.base (#EF4444)' }
 *
 *   // Get the full brand rules as structured data
 *   brandGuidelines.colorRules;
 *   brandGuidelines.typographyRules;
 *   brandGuidelines.layoutRules;
 */

import { colors, typography, spacing, radii, shadows, layout, breakpoints, statusBadges } from './tokens';

// ============================================================================
// Brand Color Registry — every approved color with its name and usage
// ============================================================================

export interface ApprovedColor {
  name: string;
  hex: string;
  category: 'primary' | 'accent' | 'secondary' | 'semantic' | 'neutral' | 'extended';
  usage: string;
}

export const approvedColors: ApprovedColor[] = [
  // Primary
  { name: 'white',     hex: '#FFFFFF', category: 'primary',  usage: 'Pure white, text on dark backgrounds' },
  { name: 'platinum',  hex: '#FAF8F5', category: 'primary',  usage: 'Page backgrounds' },
  { name: 'castIron',  hex: '#37352A', category: 'primary',  usage: 'Nav bar, dark surfaces, text on brass' },

  // Signature accents
  { name: 'alloy',     hex: '#FFA680', category: 'accent',   usage: 'Conditional Go, highlights, badges' },
  { name: 'copper',    hex: '#FF7A52', category: 'accent',   usage: 'Logo, primary accent, CTAs, brand moments' },

  // Secondary
  { name: 'bronze',    hex: '#6C3A2A', category: 'secondary', usage: 'Secondary accent, deep contrast' },
  { name: 'verdigris', hex: '#9EB4AB', category: 'secondary', usage: 'Complementary accent' },
  { name: 'steel',     hex: '#697771', category: 'secondary', usage: 'Table headers, neutral secondary' },
  { name: 'pewter',    hex: '#A1B4BA', category: 'secondary', usage: 'Light neutral' },
  { name: 'whiteGold', hex: '#F4EBD7', category: 'secondary', usage: 'Light accent backgrounds' },
  { name: 'brass',     hex: '#C3B497', category: 'secondary', usage: 'Primary UI accent, buttons, interactive elements' },

  // Semantic
  { name: 'success',   hex: '#10B981', category: 'semantic',  usage: 'Go status, success states, confirmations' },
  { name: 'warning',   hex: '#FAB005', category: 'semantic',  usage: 'Conditional status, warnings, attention' },
  { name: 'error',     hex: '#EF4444', category: 'semantic',  usage: 'No Go status, errors, destructive actions' },
  { name: 'info',      hex: '#228BE6', category: 'semantic',  usage: 'Informational states, links, active elements' },

  // Key neutrals
  { name: 'gray-50',   hex: '#F9FAFB', category: 'neutral',  usage: 'Subtle backgrounds, table header bg' },
  { name: 'gray-200',  hex: '#E5E7EB', category: 'neutral',  usage: 'Borders, dividers' },
  { name: 'gray-500',  hex: '#6B7280', category: 'neutral',  usage: 'Secondary text, captions' },
  { name: 'gray-700',  hex: '#374151', category: 'neutral',  usage: 'Body text' },
  { name: 'gray-900',  hex: '#111827', category: 'neutral',  usage: 'Headings, high-contrast text' },
];

// Build a lookup map for fast validation
const colorMap = new Map<string, ApprovedColor>();
for (const c of approvedColors) {
  colorMap.set(c.hex.toUpperCase(), c);
}

// ============================================================================
// Color Validation
// ============================================================================

export interface ColorValidationResult {
  valid: boolean;
  name?: string;
  usage?: string;
  category?: string;
  suggestion?: string;
}

/**
 * Validate a hex color against the approved palette.
 * Returns the color's name and usage if approved, or a suggestion if not.
 */
export function validateColor(hex: string): ColorValidationResult {
  const normalized = hex.toUpperCase().replace(/^#?/, '#');
  const match = colorMap.get(normalized);

  if (match) {
    return { valid: true, name: match.name, usage: match.usage, category: match.category };
  }

  // Find the closest approved color by distance
  const suggestion = findClosestColor(normalized);
  return {
    valid: false,
    suggestion: suggestion
      ? `${suggestion.name} (${suggestion.hex}) — ${suggestion.usage}`
      : undefined,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2),
  );
}

function findClosestColor(hex: string): ApprovedColor | null {
  const target = hexToRgb(hex);
  let closest: ApprovedColor | null = null;
  let minDist = Infinity;

  for (const color of approvedColors) {
    const dist = colorDistance(target, hexToRgb(color.hex));
    if (dist < minDist) {
      minDist = dist;
      closest = color;
    }
  }

  return closest;
}

/**
 * Validate multiple colors and return all violations.
 */
export function auditColors(hexValues: string[]): Array<{ hex: string; result: ColorValidationResult }> {
  return hexValues.map((hex) => ({ hex, result: validateColor(hex) }));
}

// ============================================================================
// Typography Validation
// ============================================================================

const approvedFontFamilies = new Set(Object.values(typography.families));
const approvedFontSizes = new Set(Object.values(typography.sizes));

export interface TypographyValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Validate a typography combination against the brand rules.
 */
export function validateTypography(opts: {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number;
}): TypographyValidationResult {
  const issues: string[] = [];

  if (opts.fontFamily) {
    // Check if it contains any approved family
    const isApproved = Array.from(approvedFontFamilies).some(
      (family) => opts.fontFamily!.includes(family.split(',')[0].replace(/"/g, '')),
    );
    if (!isApproved) {
      issues.push(
        `Font "${opts.fontFamily}" is not in the approved families: ${Object.entries(typography.families).map(([k, v]) => `${k}: ${v.split(',')[0]}`).join(', ')}`,
      );
    }
  }

  if (opts.fontSize && !approvedFontSizes.has(opts.fontSize)) {
    issues.push(
      `Font size "${opts.fontSize}" is not in the type scale: ${Object.entries(typography.sizes).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
    );
  }

  if (opts.fontWeight) {
    const approvedWeights = Object.values(typography.weights) as number[];
    if (!approvedWeights.includes(opts.fontWeight)) {
      issues.push(
        `Font weight ${opts.fontWeight} is not approved. Use: ${Object.entries(typography.weights).map(([k, v]) => `${k} (${v})`).join(', ')}`,
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

// ============================================================================
// Brand Guidelines — Full Structured Rule Set
// ============================================================================

export const brandGuidelines = {
  /** Company and product identity */
  identity: {
    companyName: 'ClearCompany',
    productName: 'ClearGO',
    tagline: 'Launch Readiness Console',
    palette: 'Metallurgical — metals and alloys (Brass, Copper, Steel, etc.)',
  },

  /** Color palette rules */
  colorRules: {
    primary: {
      description: 'Core brand colors — used for backgrounds and primary surfaces',
      colors: {
        white: { hex: colors.white, usage: 'Pure white, text on dark backgrounds' },
        platinum: { hex: colors.platinum, usage: 'Page backgrounds (default), light surfaces' },
        castIron: { hex: colors.castIron, usage: 'Nav bar, dark surfaces, text on brass accent' },
      },
    },
    signatureAccents: {
      description: 'High-impact colors for key brand moments — use sparingly',
      colors: {
        copper: { hex: colors.copper, usage: 'Logo, primary accent, CTAs. Hover: #E66E4A' },
        alloy: { hex: colors.alloy, usage: 'Conditional status, highlights' },
      },
      rules: [
        'Copper is the hero accent — use for primary CTAs and brand-defining moments',
        'Alloy is secondary — use for conditional/in-progress states',
        'Never use both copper and alloy in the same visual hierarchy',
      ],
    },
    secondaryPalette: {
      description: 'Supporting colors that add depth without competing with accents',
      colors: {
        brass: { hex: colors.brass, usage: 'Primary UI accent (buttons, interactive elements). Hover: #B0A086' },
        steel: { hex: colors.steel, usage: 'Table headers (app tables), neutral outlines' },
        pewter: { hex: colors.pewter, usage: 'Light neutral accents' },
        verdigris: { hex: colors.verdigris, usage: 'Complementary accent' },
        whiteGold: { hex: colors.whiteGold, usage: 'Light accent backgrounds' },
        bronze: { hex: colors.bronze, usage: 'Deep contrast, secondary accent' },
      },
      rules: [
        'Brass is the default button/accent color — use Copper only for hero actions',
        'Steel is reserved for table header backgrounds',
        'Platinum-colored text on Steel headers for contrast',
      ],
    },
    semantic: {
      description: 'Status and feedback colors — consistent across all apps',
      go: { light: colors.success.light, base: colors.success.base, dark: colors.success.dark },
      conditionalGo: { light: colors.warning.light, base: colors.warning.base, dark: colors.warning.dark },
      noGo: { light: colors.error.light, base: colors.error.base, dark: colors.error.dark },
      info: { light: colors.info.light, base: colors.info.base, dark: colors.info.dark },
      rules: [
        'Use base colors for badges and icons',
        'Use light variants for backgrounds',
        'Use dark variants for text on light semantic backgrounds',
        'Never mix semantic colors for decoration — they are reserved for meaning',
      ],
    },
    donts: [
      'Do not introduce new brand colors without adding them to tokens.ts',
      'Do not use raw hex values — always reference tokens or CSS variables',
      'Do not use pure black (#000000) for text — use gray-900 (#111827)',
      'Do not use blue as a brand accent — it is reserved for links and info states',
    ],
  },

  /** Typography rules */
  typographyRules: {
    families: {
      heading: { value: typography.families.heading, usage: 'Section titles (H2-H4), card titles' },
      body: { value: typography.families.body, usage: 'Body text, labels, captions, nav links' },
      display: { value: typography.families.display, usage: 'Page titles (H1), hero moments, logo text' },
      mono: { value: typography.families.mono, usage: 'Code snippets, technical values, IDs' },
      ui: { value: typography.families.ui, usage: 'Mantine components, form controls' },
    },
    hierarchy: typography.hierarchy,
    rules: [
      'Page titles (H1) always use Marcellus (display) at 32px bold',
      'Section headings (H2-H4) use Atkinson Hyperlegible (heading)',
      'Body text uses Public Sans (body) at 14px normal weight',
      'Never use more than 2 font families on the same page',
      'Minimum text size is 12px (caption) — never go smaller',
      'Use semibold (600) for emphasis, bold (700) for headings only',
      'Line height: tight (1.25) for headings, normal (1.5) for body, relaxed (1.75) for long-form',
    ],
  },

  /** Layout and spacing rules */
  layoutRules: {
    page: {
      maxWidth: layout.page.maxWidth,
      padding: layout.page.paddingX,
      paddingTop: layout.page.paddingTop,
      rules: [
        'Content area max-width is 1280px, centered horizontally',
        'Horizontal padding: 16px mobile, 24px tablet, 32px desktop',
        'Top padding below nav: 32px',
      ],
    },
    spacing: {
      scale: spacing,
      rules: [
        'Use only values from the spacing scale (4px increments)',
        'Related elements: 4-8px apart',
        'Grouped sections: 16-24px apart',
        'Major page sections: 32-48px apart',
        'Never use arbitrary spacing values (e.g. 7px, 15px, 22px)',
      ],
    },
    cards: {
      spec: layout.card,
      rules: [
        'Cards have 16px padding, 8px border-radius, base shadow',
        'Hoverable cards add md shadow on hover with 0.2s transition',
        'Card borders are gray-200 (#E5E7EB)',
      ],
    },
    buttons: {
      spec: layout.button,
      rules: [
        'Primary button: brass bg, cast-iron text, 40px height',
        'Danger button: error-base bg, white text',
        'Copper button: reserved for hero/brand-defining actions only',
        'All buttons have 6px border-radius',
        'Button text is 14px semibold (Public Sans)',
      ],
    },
    tables: {
      spec: layout.table,
      rules: [
        'App table headers: Steel (#697771) background with Platinum text',
        'Settings table headers: gray-50 background with gray-500 text',
        'Cell padding: 12px vertical, 16px horizontal',
        'Row hover: gray-50 background',
      ],
    },
    navigation: {
      spec: layout.nav,
      rules: [
        'Nav is fixed-position at top, Cast Iron (#37352A) background',
        'Height: 64px, padding 24px horizontal',
        'Logo uses Marcellus font, nav links use Public Sans',
        'Active tab: white text, purple indicator border',
        'Inactive tab: blue-200 text',
      ],
    },
    shadows: {
      scale: shadows,
      rules: [
        'sm: subtle elevation for inputs, small cards',
        'base: default card elevation',
        'md: hover state, elevated cards',
        'lg: modals, dropdowns',
        'xl: popovers, AI panels',
      ],
    },
    radii: {
      scale: radii,
      rules: [
        'sm (4px): inputs, small badges',
        'base (6px): buttons, form controls',
        'md (8px): cards, panels',
        'lg (12px): modals, popovers',
        'full (9999px): pills, avatars, circular badges',
      ],
    },
    breakpoints: {
      scale: breakpoints,
      rules: [
        'xs (576px): Small phones',
        'sm (768px): Tablets — switch to tablet layout',
        'md (992px): Small desktops — show full sidebar',
        'lg (1200px): Large desktops — full layout',
        'xl (1408px): Extra wide — max content width applies',
      ],
    },
    zIndex: {
      description: 'Layer ordering — never use arbitrary z-index values',
      scale: {
        base: '1 — Default stacking',
        dropdown: '100 — Dropdown menus',
        sticky: '200 — Sticky headers, toolbars',
        fixed: '300 — Fixed-position elements',
        modal: '400 — Modal overlays',
        popover: '500 — Popovers, tooltips',
        tooltip: '600 — Tooltips (above popovers)',
        aiPanel: '1000 — AI assistant panel (always on top)',
      },
    },
  },

  /** Status badge specifications */
  statusBadges,
} as const;
