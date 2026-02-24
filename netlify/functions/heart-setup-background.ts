/**
 * Netlify Background Function: HEART AI setup (runs up to 15 min).
 * Invoked by POST /api/epics/[id]/heart when setup_method is auto or ai_assisted.
 * Reads job payload, runs setupHeartMetricsWithAI, writes result to heart_setup_jobs.
 */

import { createClient } from '@supabase/supabase-js';
import { setOverrideAdminClient } from '../../src/lib/db';
import { setupHeartMetricsWithAI } from '../../src/lib/heart/service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;

interface Body {
  jobId: string;
  epicId: string;
  appUserId: string;
  setupMethod: 'auto' | 'ai_assisted';
  userContext?: string;
  secret?: string;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { jobId, epicId, appUserId, setupMethod, userContext, secret } = body;
  const expectedSecret = process.env.NETLIFY_HEART_SETUP_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!jobId || !epicId || !appUserId || !setupMethod) {
    return new Response(
      JSON.stringify({ error: 'Missing jobId, epicId, appUserId, or setupMethod' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(supabaseUrl, supabaseKey);
  setOverrideAdminClient(adminClient);

  try {
    await adminClient
      .from('heart_setup_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('epic_id', epicId);

    const result = await setupHeartMetricsWithAI(epicId, appUserId, setupMethod, {
      userContext: userContext || undefined,
    });

    if (result.error && !result.config) {
      await adminClient
        .from('heart_setup_jobs')
        .update({
          status: 'failed',
          result: {
            error: result.error,
            recommendations: result.recommendations ?? undefined,
            availableEventNames: result.availableEventNames ?? undefined,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('epic_id', epicId);
    } else {
      await adminClient
        .from('heart_setup_jobs')
        .update({
          status: 'completed',
          result: {
            config: result.config,
            metrics: result.metrics ?? [],
            recommendations: result.recommendations ?? undefined,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('epic_id', epicId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[heart-setup-background]', message, err);
    await adminClient
      .from('heart_setup_jobs')
      .update({
        status: 'failed',
        result: { error: message },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('epic_id', epicId);
  } finally {
    setOverrideAdminClient(null);
  }

  return new Response(JSON.stringify({ accepted: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
