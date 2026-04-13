/**
 * @anthropic-internal/shared/brand
 *
 * Brand guidelines skill — the single source of truth for color palette,
 * typography rules, layout specifications, and component presets across
 * ClearGo, ClearMap, AIPulse, and future internal tools.
 */

// Design tokens (raw values)
export {
  colors,
  mantineColorScales,
  typography,
  spacing,
  shadows,
  radii,
  transitions,
  zIndex,
  breakpoints,
  layout,
  statusBadges,
} from './tokens';

// Brand guidelines (structured rules + validation)
export {
  brandGuidelines,
  approvedColors,
  validateColor,
  validateTypography,
  auditColors,
} from './guidelines';
export type { ApprovedColor, ColorValidationResult, TypographyValidationResult } from './guidelines';

// Component style presets
export { componentStyles } from './components';

// CSS/theme generators
export { generateCssVariables, generateMantineThemeConfig } from './css-generator';
