/**
 * @anthropic-internal/shared - CSS Variable Generator
 *
 * Generates CSS custom properties from design tokens. Use this to create
 * a globals.css `:root` block that is always in sync with the tokens.
 *
 * Usage:
 *   import { generateCssVariables } from '@anthropic-internal/shared/brand';
 *   const css = generateCssVariables();
 *   // Write to your globals.css or inject at runtime
 */

import { colors, typography, spacing, shadows, radii, transitions, layout } from './tokens';

/**
 * Generate a complete `:root { ... }` CSS block from design tokens.
 */
export function generateCssVariables(): string {
  const lines: string[] = [':root {'];

  const add = (name: string, value: string, comment?: string) => {
    const commentStr = comment ? ` /* ${comment} */` : '';
    lines.push(`  --${name}: ${value};${commentStr}`);
  };

  const section = (title: string) => {
    lines.push('');
    lines.push(`  /* ========== ${title} ========== */`);
  };

  // Typography
  section('Typography');
  add('font-heading', typography.families.heading);
  add('font-body', typography.families.body);
  add('font-display', typography.families.display, 'Marcellus');
  add('font-mono', typography.families.mono);
  lines.push('');
  Object.entries(typography.sizes).forEach(([k, v]) => add(`font-size-${k}`, v));
  lines.push('');
  Object.entries(typography.weights).forEach(([k, v]) => add(`font-weight-${k}`, String(v)));
  lines.push('');
  Object.entries(typography.lineHeights).forEach(([k, v]) => add(`line-height-${k}`, String(v)));

  // Brand palette
  section('Brand Palette');
  add('color-white', colors.white);
  add('color-platinum', colors.platinum, 'Page backgrounds');
  add('color-cast-iron', colors.castIron, 'Nav bar, dark surfaces');
  lines.push('');
  add('color-alloy', colors.alloy, 'Conditional Go, highlights');
  add('color-copper', colors.copper, 'Logo, primary accent, CTAs');
  add('color-copper-hover', colors.copperHover);
  add('color-copper-bg', colors.copperBg);
  lines.push('');
  add('color-bronze', colors.bronze);
  add('color-verdigris', colors.verdigris);
  add('color-steel', colors.steel);
  add('color-pewter', colors.pewter);
  add('color-white-gold', colors.whiteGold);
  add('color-brass', colors.brass, 'Primary UI accent');
  add('color-accent', 'var(--color-brass)', 'Alias');
  add('color-accent-hover', colors.brassHover);
  add('color-accent-bg', colors.brassBg);

  // Semantic colors
  section('Semantic Colors');
  (['success', 'warning', 'error', 'info'] as const).forEach((name) => {
    const c = colors[name];
    add(`color-${name}-light`, c.light);
    add(`color-${name}-base`, c.base);
    add(`color-${name}-dark`, c.dark);
  });

  // Grays
  section('Neutral Grays');
  Object.entries(colors.gray).forEach(([k, v]) => add(`color-gray-${k}`, v));
  add('color-black', colors.black);

  // Blue scale
  section('Extended Blue');
  Object.entries(colors.blue).forEach(([k, v]) => add(`color-blue-${k}`, v));

  // Spacing
  section('Spacing');
  Object.entries(spacing).forEach(([k, v]) => add(`spacing-${k}`, v));

  // Shadows
  section('Shadows');
  Object.entries(shadows).forEach(([k, v]) => add(`shadow-${k}`, v));

  // Radii
  section('Border Radius');
  Object.entries(radii).forEach(([k, v]) => add(`radius-${k}`, v));

  // Transitions
  section('Transitions');
  Object.entries(transitions).forEach(([k, v]) => add(`transition-${k}`, v));

  // Navigation
  section('Navigation');
  add('nav-bg', 'var(--color-cast-iron)');
  add('nav-text', 'var(--color-white)');
  add('nav-height', layout.nav.height);
  add('nav-padding-x', layout.nav.paddingX);
  add('nav-padding-y', layout.nav.paddingY);

  // Page container
  section('Page Container');
  add('page-container-max-width', layout.page.maxWidth);
  add('page-container-padding-x', layout.page.paddingX.mobile);
  add('page-container-padding-x-sm', layout.page.paddingX.sm);
  add('page-container-padding-x-lg', layout.page.paddingX.lg);
  add('page-container-padding-top', layout.page.paddingTop);

  // Cards
  section('Cards');
  add('card-bg', 'var(--color-white)');
  add('card-border', 'var(--color-gray-200)');
  add('card-border-radius', 'var(--radius-md)');
  add('card-padding', layout.card.padding);
  add('card-shadow', 'var(--shadow-base)');
  add('card-shadow-hover', 'var(--shadow-md)');

  // Buttons
  section('Buttons');
  add('button-primary-bg', 'var(--color-accent)');
  add('button-primary-hover', 'var(--color-accent-hover)');
  add('button-primary-text', 'var(--color-cast-iron)');
  add('button-height', layout.button.height);
  add('button-padding', layout.button.padding);
  add('button-radius', 'var(--radius-base)');

  // Tables
  section('Tables');
  add('table-bg', 'var(--color-white)');
  add('table-border', 'var(--color-gray-200)');
  add('table-header-bg', 'var(--color-gray-50)');
  add('table-header-text', 'var(--color-gray-500)');
  add('table-row-hover', 'var(--color-gray-50)');
  add('table-cell-padding', layout.table.cellPadding);
  add('table-steel', 'var(--color-steel)');
  add('table-header-text-platinum', 'var(--color-platinum)');

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate a Mantine theme configuration object from design tokens.
 * Use this instead of manually maintaining mantine-theme.ts.
 */
export function generateMantineThemeConfig() {
  const { mantineColorScales } = require('./tokens');
  return {
    primaryColor: 'brass',
    colors: mantineColorScales,
    fontFamily: typography.families.ui,
    headings: {
      fontFamily: typography.families.ui,
      fontWeight: '700',
    },
    spacing: { xl: '128px' },
    defaultRadius: 'md',
  };
}
