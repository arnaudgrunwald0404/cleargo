/**
 * Tool: ensure-artifacts
 *
 * Ensures artifact rows (and Google Docs, if configured) exist for a launch.
 * Idempotent — safe to call repeatedly.
 *
 * Mirrors the decision the UI route makes: hand off to the background function
 * only when there is genuinely slow Google work to do. Filling five missing
 * documents is ~20 sequential Drive calls against a 26s cap, but the common case
 * is a launch that already has everything, where ensureLaunchArtifacts makes no
 * Drive calls at all. Answering that with "started, go poll" would trade a
 * truthful "nothing missing" for a minute of pointless waiting.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dispatchLaunchArtifactSetup,
  hasMissingDocs,
  launchArtifactSetupTarget,
} from '@/lib/artifacts/backgroundSetup';
import { ensureLaunchArtifacts } from '@/lib/artifacts/docFactory';
import { isGoogleConfigured } from '@/lib/google/auth';
import { canRolesPerform } from '@/lib/permissions';
import type { McpAuthInfo } from '@/lib/oauth/tokens';

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
});

export async function ensureArtifacts(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (!canRolesPerform(actor.roles, 'launchArtifact.draft')) {
    return { error: 'You do not have permission to create launch artifacts.' };
  }

  try {
    const needsSlowPath =
      (await isGoogleConfigured()) && (await hasMissingDocs(parsed.data.launchId, supabase));
    const target = needsSlowPath ? launchArtifactSetupTarget() : null;

    if (target) {
      const started = await dispatchLaunchArtifactSetup(parsed.data.launchId, target);
      if (!started) {
        return {
          error: 'Could not start document setup.',
          next_step: 'Nothing is running and the launch is unchanged. Try again.',
        };
      }

      return {
        started: true,
        message:
          'Creating the missing documents in the background. This usually takes under a minute.',
        next_step:
          'Call list-artifacts for this launch to see the documents appear. Do not report them ' +
          'as ready until each has a doc_url.',
      };
    }

    const result = await ensureLaunchArtifacts(parsed.data.launchId, supabase);
    return {
      started: true,
      completed: true,
      message: 'Artifacts ensured for launch.',
      created: result.created,
      errors: result.errors,
    };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to ensure artifacts' };
  }
}
