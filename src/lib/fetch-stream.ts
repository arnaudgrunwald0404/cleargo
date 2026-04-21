/**
 * Reads a newline-delimited JSON (NDJSON) streaming response and returns the final result.
 * Falls back to regular res.json() for non-streaming responses.
 *
 * The server sends one JSON object per line; progress lines are ignored.
 * The last line contains the final result (or an error).
 */
export async function fetchStreamJSON(
    url: string,
    options: RequestInit & { onProgress?: (msg: string) => void }
): Promise<any> {
    const { onProgress, ...fetchOptions } = options;
    const res = await fetch(url, fetchOptions);

    if (!res.ok) {
        // Try to parse error body regardless of content-type
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('x-ndjson') || !res.body) {
        // Legacy non-streaming response
        return res.json();
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastResult: any = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!; // Last incomplete chunk stays in buffer
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed.progress && onProgress) {
                    onProgress(parsed.message ?? `${parsed.progress}/${parsed.total}`);
                }
                lastResult = parsed;
            } catch {
                // Non-JSON line — ignore
            }
        }
    }

    // Flush any remaining buffer content
    if (buffer.trim()) {
        try {
            lastResult = JSON.parse(buffer.trim());
        } catch {}
    }

    if (!lastResult) throw new Error('Empty response from server');
    if (lastResult.error) throw new Error(lastResult.error);
    return lastResult;
}
