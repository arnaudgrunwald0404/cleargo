/**
 * @anthropic-internal/shared - Background Job Framework
 *
 * A lightweight framework for cron-triggered background jobs in Next.js API
 * routes. Provides consistent auth (cron secret), structured logging,
 * timing, and error handling.
 *
 * Extracted from ClearGo's /api/jobs/* route pattern.
 *
 * Usage:
 *   // src/app/api/jobs/stale-criteria/route.ts
 *   export const dynamic = 'force-dynamic';
 *   export const maxDuration = 60;
 *
 *   export const GET = createJobHandler({
 *     name: 'stale-criteria',
 *     cronSecret: process.env.CRON_SECRET,
 *     handler: async (ctx) => {
 *       const items = await findStaleCriteria();
 *       ctx.log.info(`Found ${items.length} stale criteria`);
 *
 *       for (const item of items) {
 *         await sendNudge(item);
 *       }
 *
 *       return { success: true, processed: items.length };
 *     },
 *   });
 */

import type { JobContext, JobLogger, JobResult } from '../types';

/** Minimal request interface (compatible with NextRequest) */
interface MinimalRequest {
  headers: { get(name: string): string | null };
}

interface JobHandlerConfig {
  /** Human-readable job name (used in logs) */
  name: string;
  /** Cron secret for authentication (from CRON_SECRET env) */
  cronSecret?: string;
  /** The job's main logic */
  handler: (ctx: JobContext) => Promise<JobResult>;
}

function createLogger(jobName: string): JobLogger {
  const prefix = `[Job:${jobName}]`;
  return {
    info(message, data) {
      console.log(prefix, message, data ? JSON.stringify(data) : '');
    },
    warn(message, data) {
      console.warn(prefix, message, data ? JSON.stringify(data) : '');
    },
    error(message, data) {
      console.error(prefix, message, data ? JSON.stringify(data) : '');
    },
  };
}

/**
 * Creates a GET handler for a background job endpoint.
 * Returns a function compatible with Next.js route handler exports.
 */
export function createJobHandler(config: JobHandlerConfig) {
  return async (request: MinimalRequest): Promise<Response> => {
    const log = createLogger(config.name);
    const startedAt = new Date();

    // Authenticate with cron secret
    if (config.cronSecret) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${config.cronSecret}`) {
        log.warn('Unauthorized job invocation');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    log.info(`Started at ${startedAt.toISOString()}`);

    try {
      const ctx: JobContext = { jobName: config.name, startedAt, log };
      const result = await config.handler(ctx);

      const durationMs = Date.now() - startedAt.getTime();

      log.info(`Completed in ${durationMs}ms`, {
        success: result.success,
        processed: result.processed,
        skipped: result.skipped,
        errors: result.errors,
      });

      return new Response(
        JSON.stringify({
          ...result,
          job: config.name,
          durationMs,
          timestamp: new Date().toISOString(),
        }),
        {
          status: result.success ? 200 : 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt.getTime();
      const message = error instanceof Error ? error.message : 'Unknown error';

      log.error(`Failed after ${durationMs}ms: ${message}`);

      return new Response(
        JSON.stringify({
          success: false,
          error: message,
          job: config.name,
          durationMs,
          timestamp: new Date().toISOString(),
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  };
}

export type { JobContext, JobLogger, JobResult };
