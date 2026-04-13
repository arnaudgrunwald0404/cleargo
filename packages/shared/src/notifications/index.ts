/**
 * @anthropic-internal/shared - Multi-Channel Notification Dispatcher
 *
 * A type-safe notification system that routes messages through pluggable
 * channels (email, Slack, webhooks, etc.). Each app registers its own
 * channels and notification types.
 *
 * Extracted from ClearGo's email/notifications.ts and slack/notifications.ts.
 *
 * Usage:
 *   const dispatcher = createNotificationDispatcher({
 *     channels: [emailChannel, slackChannel],
 *     onSend: (result) => auditLog.write(result),
 *   });
 *
 *   await dispatcher.send('launch_status_change', {
 *     channels: ['email', 'slack'],
 *     payload: { epicName: 'v2.0', status: 'GO' },
 *   });
 */

import type { NotificationChannel, NotificationDispatchResult } from '../types';

export interface DispatcherConfig {
  /** Registered notification channels */
  channels: NotificationChannel<any>[];
  /**
   * Called after each send attempt (per channel).
   * Use for audit logging to database.
   */
  onSend?: (result: NotificationDispatchResult & { type: string; payload: unknown }) => void | Promise<void>;
  /**
   * Global enabled check — return false to disable all notifications.
   * Useful for feature flag integration.
   */
  isEnabled?: () => boolean | Promise<boolean>;
}

export interface SendOptions<TPayload = unknown> {
  /** Which channels to send through (by name). If omitted, sends to all enabled channels. */
  channels?: string[];
  /** The notification payload — shape depends on the channel */
  payload: TPayload;
}

export interface NotificationDispatcher {
  /**
   * Send a notification of the given type through the specified channels.
   * Returns results for each channel attempted.
   */
  send(type: string, options: SendOptions): Promise<NotificationDispatchResult[]>;

  /** Register an additional channel at runtime */
  addChannel(channel: NotificationChannel<any>): void;

  /** Remove a channel by name */
  removeChannel(name: string): void;

  /** List registered channel names */
  getChannelNames(): string[];
}

export function createNotificationDispatcher(config: DispatcherConfig): NotificationDispatcher {
  const channels = new Map<string, NotificationChannel<any>>();
  for (const ch of config.channels) {
    channels.set(ch.name, ch);
  }

  return {
    async send(type, options) {
      // Global kill switch
      if (config.isEnabled) {
        const enabled = await Promise.resolve(config.isEnabled());
        if (!enabled) return [];
      }

      // Determine target channels
      const targetNames = options.channels ?? Array.from(channels.keys());
      const results: NotificationDispatchResult[] = [];

      const sendPromises = targetNames.map(async (name) => {
        const channel = channels.get(name);
        if (!channel) {
          const result: NotificationDispatchResult = {
            channel: name,
            success: false,
            error: `Channel "${name}" not registered`,
          };
          results.push(result);
          return;
        }

        // Per-channel enabled check
        try {
          const isEnabled = await Promise.resolve(channel.isEnabled());
          if (!isEnabled) {
            const result: NotificationDispatchResult = {
              channel: name,
              success: false,
              error: `Channel "${name}" is disabled`,
            };
            results.push(result);
            return;
          }
        } catch {
          // If isEnabled throws, assume enabled
        }

        try {
          const sendResult = await channel.send(options.payload);
          const result: NotificationDispatchResult = {
            channel: name,
            success: sendResult.success,
            error: sendResult.error,
          };
          results.push(result);

          // Audit callback
          if (config.onSend) {
            await Promise.resolve(
              config.onSend({ ...result, type, payload: options.payload }),
            ).catch((err) => console.error('[NotificationDispatcher] onSend callback error:', err));
          }
        } catch (err) {
          const result: NotificationDispatchResult = {
            channel: name,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
          results.push(result);

          if (config.onSend) {
            await Promise.resolve(
              config.onSend({ ...result, type, payload: options.payload }),
            ).catch(() => {});
          }
        }
      });

      await Promise.all(sendPromises);
      return results;
    },

    addChannel(channel) {
      channels.set(channel.name, channel);
    },

    removeChannel(name) {
      channels.delete(name);
    },

    getChannelNames() {
      return Array.from(channels.keys());
    },
  };
}

// ---------------------------------------------------------------------------
// Channel builders — helpers to create common channel types
// ---------------------------------------------------------------------------

/**
 * Create a Slack notification channel.
 *
 * @param sendFn - Your Slack API posting function
 * @param isEnabledFn - Returns whether Slack notifications are enabled
 */
export function createSlackChannel<TPayload>(opts: {
  sendFn: (payload: TPayload) => Promise<{ success: boolean; error?: string }>;
  isEnabledFn?: () => boolean | Promise<boolean>;
}): NotificationChannel<TPayload> {
  return {
    name: 'slack',
    send: opts.sendFn,
    isEnabled: opts.isEnabledFn ?? (() => true),
  };
}

/**
 * Create an email notification channel.
 *
 * @param sendFn - Your email sending function (e.g. Resend, SendGrid)
 * @param isEnabledFn - Returns whether email notifications are enabled
 */
export function createEmailChannel<TPayload>(opts: {
  sendFn: (payload: TPayload) => Promise<{ success: boolean; error?: string }>;
  isEnabledFn?: () => boolean | Promise<boolean>;
}): NotificationChannel<TPayload> {
  return {
    name: 'email',
    send: opts.sendFn,
    isEnabled: opts.isEnabledFn ?? (() => true),
  };
}

/**
 * Create a generic webhook notification channel.
 */
export function createWebhookChannel<TPayload>(opts: {
  name?: string;
  url: string;
  headers?: Record<string, string>;
  isEnabledFn?: () => boolean | Promise<boolean>;
}): NotificationChannel<TPayload> {
  return {
    name: opts.name ?? 'webhook',
    async send(payload) {
      try {
        const res = await fetch(opts.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...opts.headers },
          body: JSON.stringify(payload),
        });
        return { success: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Webhook failed' };
      }
    },
    isEnabled: opts.isEnabledFn ?? (() => true),
  };
}

export type { NotificationChannel, NotificationDispatchResult };
