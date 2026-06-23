import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { createCleargoAgentStream, hasCleargoAgentKey } from '@/lib/ai/cleargoAgent';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface ChatRequestBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  context?: { epic_id?: string };
}

export async function POST(req: NextRequest): Promise<Response> {
  const userEmail = await getAuthenticatedUserEmail();
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Manual rate limiting (heavy: 40 req/min) — withRateLimit wrapper expects NextResponse
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'anonymous';
  const { allowed } = rateLimit(userEmail || ip, { windowMs: 60_000, maxRequests: 40 });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    );
  }

  if (!hasCleargoAgentKey()) {
    return NextResponse.json(
      { error: 'AI assistant is not configured. Contact your admin to set up CLAUDE_API_KEY.' },
      { status: 503 }
    );
  }

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { messages, context } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
  }

  const result = createCleargoAgentStream({
    messages,
    userEmail,
    contextEpicId: context?.epic_id,
  });

  return result.toTextStreamResponse();
}
