/**
 * Tool: ensure-artifacts
 *
 * Ensures artifact rows (and Google Docs, if configured) exist for a launch.
 * Idempotent — safe to call multiple times.
 */
import { z } from 'zod';
import { callInternalApi } from '../client.js';

const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
});

export async function ensureArtifacts(args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  try {
    const result = await callInternalApi('/api/internal/artifacts', {
      action: 'ensure',
      launchId: parsed.data.launchId,
    });

    return {
      success: true,
      message: 'Artifacts ensured for launch',
      result,
    };
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : 'Failed to ensure artifacts',
    };
  }
}