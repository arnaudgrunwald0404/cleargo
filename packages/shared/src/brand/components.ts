/**
 * @anthropic-internal/shared - Component Style Presets
 *
 * Pre-built style objects for common UI components. Use these as the
 * "correct" implementation when building new tools — they encode ClearGo's
 * design system decisions so you don't have to re-derive them.
 *
 * Usage:
 *   import { componentStyles } from '@anthropic-internal/shared/brand';
 *   <div style={componentStyles.card}>...</div>
 *   <button style={componentStyles.buttonPrimary}>Save</button>
 */

import { colors, typography, spacing, radii, shadows, transitions, layout } from './tokens';

// ============================================================================
// Component Style Presets (CSS-in-JS compatible objects)
// ============================================================================

export const componentStyles = {
  // ---------- Page Layout ----------
  pageContainer: {
    maxWidth: layout.page.maxWidth,
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: layout.page.paddingX.mobile,
    paddingRight: layout.page.paddingX.mobile,
    paddingTop: layout.page.paddingTop,
  } as const,

  // ---------- Navigation ----------
  nav: {
    height: layout.nav.height,
    backgroundColor: layout.nav.bg,
    color: layout.nav.text,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: layout.nav.paddingX,
    paddingRight: layout.nav.paddingX,
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },

  navLink: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.medium,
    color: colors.blue[200],
    textDecoration: 'none',
    padding: `${spacing[2]} ${spacing[3]}`,
    borderRadius: radii.base,
    transition: transitions.base,
  },

  navLinkActive: {
    fontWeight: typography.weights.bold,
    color: colors.white,
    backgroundColor: 'rgba(107, 70, 193, 0.15)',
    borderBottom: '2px solid #6B46C1',
  },

  // ---------- Cards ----------
  card: {
    backgroundColor: layout.card.bg,
    border: `1px solid ${layout.card.border}`,
    borderRadius: layout.card.radius,
    padding: layout.card.padding,
    boxShadow: layout.card.shadow,
    transition: transitions.base,
  },

  cardHoverable: {
    backgroundColor: layout.card.bg,
    border: `1px solid ${layout.card.border}`,
    borderRadius: layout.card.radius,
    padding: layout.card.padding,
    boxShadow: layout.card.shadow,
    transition: transitions.base,
    cursor: 'pointer',
  },

  // ---------- Buttons ----------
  buttonPrimary: {
    height: layout.button.height,
    padding: layout.button.padding,
    borderRadius: layout.button.radius,
    backgroundColor: layout.button.primaryBg,
    color: layout.button.primaryText,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    border: 'none',
    cursor: 'pointer',
    transition: transitions.fast,
  },

  buttonSecondary: {
    height: layout.button.height,
    padding: layout.button.padding,
    borderRadius: layout.button.radius,
    backgroundColor: 'transparent',
    color: colors.castIron,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.medium,
    border: `1px solid ${colors.gray[300]}`,
    cursor: 'pointer',
    transition: transitions.fast,
  },

  buttonDanger: {
    height: layout.button.height,
    padding: layout.button.padding,
    borderRadius: layout.button.radius,
    backgroundColor: colors.error.base,
    color: colors.white,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    border: 'none',
    cursor: 'pointer',
    transition: transitions.fast,
  },

  buttonCopper: {
    height: layout.button.height,
    padding: layout.button.padding,
    borderRadius: layout.button.radius,
    backgroundColor: colors.copper,
    color: colors.white,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    border: 'none',
    cursor: 'pointer',
    transition: transitions.fast,
  },

  // ---------- Typography ----------
  pageTitle: {
    fontFamily: typography.families.display,
    fontSize: typography.hierarchy.pageTitle.size,
    fontWeight: typography.hierarchy.pageTitle.weight,
    color: colors.gray[900],
    lineHeight: typography.lineHeights.tight,
    margin: 0,
  },

  sectionTitle: {
    fontFamily: typography.families.heading,
    fontSize: typography.hierarchy.sectionTitle.size,
    fontWeight: typography.hierarchy.sectionTitle.weight,
    color: colors.gray[900],
    lineHeight: typography.lineHeights.tight,
    margin: 0,
  },

  cardTitle: {
    fontFamily: typography.families.heading,
    fontSize: typography.hierarchy.cardTitle.size,
    fontWeight: typography.hierarchy.cardTitle.weight,
    color: colors.gray[900],
    lineHeight: typography.lineHeights.tight,
    margin: 0,
  },

  bodyText: {
    fontFamily: typography.families.body,
    fontSize: typography.hierarchy.body.size,
    fontWeight: typography.hierarchy.body.weight,
    color: colors.gray[700],
    lineHeight: typography.lineHeights.normal,
  },

  caption: {
    fontFamily: typography.families.body,
    fontSize: typography.hierarchy.caption.size,
    fontWeight: typography.hierarchy.caption.weight,
    color: colors.gray[500],
    lineHeight: typography.lineHeights.normal,
  },

  // ---------- Tables ----------
  tableHeader: {
    backgroundColor: layout.table.steelHeader,
    color: layout.table.platinumHeaderText,
    padding: layout.table.cellPadding,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },

  tableCell: {
    padding: layout.table.cellPadding,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.base,
    color: colors.gray[700],
    borderBottom: `1px solid ${layout.table.border}`,
  },

  // ---------- Status Badges ----------
  badge: (variant: keyof typeof import('./tokens').statusBadges) => {
    const { statusBadges } = require('./tokens');
    const badge = statusBadges[variant];
    return {
      display: 'inline-flex',
      alignItems: 'center',
      padding: `${spacing[1]} ${spacing[3]}`,
      borderRadius: radii.full,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      backgroundColor: badge.bg,
      color: badge.text,
      lineHeight: 1,
    };
  },

  // ---------- Form Inputs ----------
  input: {
    height: '40px',
    padding: `${spacing[2]} ${spacing[3]}`,
    borderRadius: radii.base,
    border: `1px solid ${colors.gray[300]}`,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.base,
    color: colors.gray[900],
    backgroundColor: colors.white,
    transition: transitions.fast,
    outline: 'none',
    width: '100%',
  },

  label: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.gray[700],
    marginBottom: spacing[1],
    display: 'block',
  },
} as const;
