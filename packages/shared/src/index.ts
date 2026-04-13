/**
 * @anthropic-internal/shared
 *
 * Shared skills library for ClearGo, ClearMap, AIPulse, and future internal tools.
 *
 * Import from subpaths for tree-shaking:
 *   import { createApiClient } from '@anthropic-internal/shared/api-client';
 *   import { createRbac } from '@anthropic-internal/shared/auth';
 *
 * Or import everything:
 *   import { createApiClient, createRbac } from '@anthropic-internal/shared';
 */

// Types
export * from './types';

// API Client
export { createApiClient } from './api-client';
export type { ApiClient } from './api-client';

// Rate Limiting
export { createRateLimiter, createRateLimitedFetch, RATE_LIMITS } from './rate-limiting';

// Request Deduplication
export { createDeduplicator, createResponseDeduplicator } from './deduplication';

// Auth / RBAC
export { createRbac } from './auth';
export type { RbacConfig, RbacEngine } from './auth';

// Middleware
export { withRateLimit, withAuth, withErrorHandler, withCors, withCronAuth, pipe, setJsonResponseFactory } from './middleware';
export type { CorsConfig } from './middleware';

// Notifications
export { createNotificationDispatcher, createSlackChannel, createEmailChannel, createWebhookChannel } from './notifications';
export type { NotificationDispatcher, SendOptions, DispatcherConfig } from './notifications';

// Database
export { createDbClients, createSupabaseFetch } from './db';
export type { CookieStore, DbClients } from './db';

// Background Jobs
export { createJobHandler } from './jobs';

// Date Utilities
export {
  parseDateLocal,
  formatDateForDisplay,
  toDateString,
  normalizeToDateOnly,
  addDays,
  subtractDays,
  addDaysToDateString,
  addMonth,
  diffDays,
  getDateInTimezone,
  isToday,
  isPast,
} from './dates';

// Settings & Feature Flags
export { FeatureFlagsProvider, useFeatureFlags, createSettingsContext } from './settings';
export type { FeatureFlagsProviderProps } from './settings';

// Brand Guidelines
export {
  colors, mantineColorScales, typography, spacing, shadows, radii, transitions, zIndex, breakpoints, layout, statusBadges,
  brandGuidelines, approvedColors, validateColor, validateTypography, auditColors,
  componentStyles,
  generateCssVariables, generateMantineThemeConfig,
} from './brand';
export type { ApprovedColor, ColorValidationResult, TypographyValidationResult } from './brand';
