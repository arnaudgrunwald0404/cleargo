export function validateApiKey(req: Request): boolean {
  const envKey = process.env.CLEARGO_AI_API_KEY;
  if (!envKey) return false;
  const headerKey = req.headers.get('X-ClearGo-Key');
  return headerKey === envKey;
}
