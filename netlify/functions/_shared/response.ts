const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export function ok(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: HEADERS });
}

export function notFound(message = 'Not found'): Response {
  return new Response(JSON.stringify({ error: message }), { status: 404, headers: HEADERS });
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: HEADERS });
}

export function badRequest(message = 'Bad request'): Response {
  return new Response(JSON.stringify({ error: message }), { status: 400, headers: HEADERS });
}

export function internalError(): Response {
  return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: HEADERS });
}
