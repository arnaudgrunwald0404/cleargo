/**
 * Internal API: Draft trigger for MCP server.
 *
 * Authenticated with MCP_SECRET (Bearer token). Bypasses user auth entirely —
 * the MCP server operates as a service account, not on behalf of a logged-in
 * user.
 *
 * POST /api/internal/artifacts
 *   { action: 'draft' | 'ensure', launchId: string, artifact_type?: string, source_notes?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { draftArtifact } from '@/lib/artifacts/draftService';
import { ensureLaunchArtifacts } from '@/lib/artifacts/docFactory';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getMcpSecret(): string | null {
  return process.env.MCP_SECRET?.trim() || null;
}

function authenticateMcp(request: NextRequest): boolean {
  const secret = getMcpSecret();
  if (!secret) {
    console.warn('[internal/artifacts] MCP_SECRET not configured — rejecting request');
    return false;
  }

  const auth = request.headers.get('authorization');
  if (!auth) {
    console.warn('[internal/artifacts] Missing Authorization header');
    return false;
  }

  const valid = auth === `Bearer ${secret}`;
  if (!valid) {
    console.warn('[internal/artifacts] Invalid MCP_SECRET');
  }
  return valid;
}

const BodySchema = z.object({
  action: z.enum(['draft', 'ensure']).default('ensure'),
  launchId: z.string(),
  artifact_type: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief']).optional(),
  source_notes: z.string().max(20_000).optional(),
});

export async function POST(request: NextRequest) {
  console.log('[internal/artifacts] POST received from', request.headers.get('x-forwarded-for') ?? 'localhost');

  if (!authenticateMcp(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = BodySchema.parse(await request.json().catch(() => ({})));
    const admin = createAdminClient();

    if (body.action === 'draft') {
      if (!body.artifact_type) {
        return NextResponse.json(
          { error: 'artifact_type is required when drafting' },
          { status: 400 }
        );
      }

      console.log(`[internal/artifacts] Drafting ${body.artifact_type} for launch ${body.launchId}`);

      const draft = await draftArtifact(
        body.launchId,
        body.artifact_type,
        {
          sourceNotes: body.source_notes,
          actorEmail: process.env.MCP_ACTOR_EMAIL?.trim() || 'mcp-server@cleargo.local',
        },
        admin
      );

      return NextResponse.json(draft, { status: draft.warnings.length > 0 ? 207 : 200 });
    }

    // action === 'ensure'
    console.log(`[internal/artifacts] Ensuring artifacts for launch ${body.launchId}`);

    const result = await ensureLaunchArtifacts(body.launchId, admin);
    return NextResponse.json(result, { status: result.errors.length > 0 ? 207 : 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: error.issues }, { status: 400 });
    }
    console.error('[internal/artifacts] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}