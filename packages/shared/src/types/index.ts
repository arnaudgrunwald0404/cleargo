/**
 * @anthropic-internal/shared - Core type definitions
 *
 * Shared types used across all modules. Each consuming app (ClearGo, ClearMap,
 * AIPulse) extends these with domain-specific types.
 */

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 10000) */
  maxDelayMs?: number;
  /** Jitter range in ms added to each retry delay (default: 500) */
  jitterMs?: number;
  /** HTTP status codes that should trigger a retry (default: [429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
}

export interface ApiClientConfig {
  /** Base URL for all requests (e.g. "https://api.example.com/v1") */
  baseUrl: string;
  /** Default headers sent with every request */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Retry configuration */
  retry?: RetryOptions;
  /** Called before each request — use for dynamic auth tokens */
  onBeforeRequest?: (url: string, init: RequestInit) => RequestInit | Promise<RequestInit>;
  /** Called on non-retryable errors */
  onError?: (error: ApiError) => void;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed per window */
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

export interface ClientFetchOptions extends RequestInit {
  /** Max retries on 429 (default: 1) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 1000) */
  retryDelay?: number;
}

// ---------------------------------------------------------------------------
// Auth / RBAC
// ---------------------------------------------------------------------------

export interface Capability<TCapabilityId extends string = string> {
  id: TCapabilityId;
  label: string;
  description: string;
}

export type PermissionRules<
  TCapabilityId extends string = string,
  TRole extends string = string,
> = Record<TCapabilityId, TRole[]>;

export interface AuthUser {
  email: string;
  roles: string[];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationChannel<TPayload = unknown> {
  /** Unique channel name (e.g. "email", "slack") */
  name: string;
  /** Send a notification through this channel */
  send(payload: TPayload): Promise<{ success: boolean; error?: string }>;
  /** Whether this channel is currently enabled */
  isEnabled(): boolean | Promise<boolean>;
}

export interface NotificationDispatchResult {
  channel: string;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Background Jobs
// ---------------------------------------------------------------------------

export interface JobContext {
  /** Job name for logging */
  jobName: string;
  /** Start time of this execution */
  startedAt: Date;
  /** Structured logger */
  log: JobLogger;
}

export interface JobLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface JobResult {
  success: boolean;
  /** Number of items processed */
  processed?: number;
  /** Number of items skipped */
  skipped?: number;
  /** Number of errors encountered */
  errors?: number;
  /** Human-readable summary */
  summary?: string;
}

// ---------------------------------------------------------------------------
// Settings / Feature Flags
// ---------------------------------------------------------------------------

export interface FeatureFlag {
  name: string;
  enabled: boolean;
}

export interface SettingsSlice<T = unknown> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export interface DbClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey?: string;
}
