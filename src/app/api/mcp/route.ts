import { NextResponse } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createClearGoMcpServer } from '@/lib/mcp/server';
import { createAdminSupabase } from '../../../../netlify/functions/_shared/supabase';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'X-ClearGo-Key, Content-Type, mcp-session-id, MCP-Protocol-Version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function validateApiKey(req: Request): boolean {
  const envKey = process.env.CLEARGO_AI_API_KEY;
  if (!envKey) return false;
  return req.headers.get('X-ClearGo-Key') === envKey;
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
  }

  try {
    const supabase = createAdminSupabase();
    const mcpServer = createClearGoMcpServer(supabase);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await mcpServer.connect(transport);

    const body = await req.json();
    const response = await transport.handleRequest(req, { parsedBody: body });

    await mcpServer.close();

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      headers.set(k, v);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    console.error('[mcp route] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
