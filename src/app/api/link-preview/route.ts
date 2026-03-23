import { NextRequest, NextResponse } from 'next/server';

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

function extractMeta(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim();
}

function resolveUrl(base: string, path: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return path;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Avoid fetching localhost URLs when running on localhost (server would fetch itself and can hang)
  const isLocalhost =
    parsedUrl.hostname === 'localhost' ||
    parsedUrl.hostname === '127.0.0.1' ||
    parsedUrl.hostname.endsWith('.localhost');
  if (isLocalhost) {
    const origin = parsedUrl.origin;
    const favicon = `${origin}/favicon.ico`;
    const data: LinkPreviewData = {
      url,
      title: parsedUrl.hostname + (parsedUrl.pathname !== '/' ? parsedUrl.pathname : ''),
      siteName: parsedUrl.hostname,
      favicon,
    };
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClearGO/1.0; +https://cleargo.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json({ url } as LinkPreviewData);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ url } as LinkPreviewData);
    }

    // Only read the first 50KB to avoid large payloads
    const reader = response.body?.getReader();
    if (!reader) return NextResponse.json({ url } as LinkPreviewData);

    let html = '';
    let totalBytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      totalBytes += value.length;
      if (totalBytes > 50_000) break;
    }
    reader.cancel();

    const origin = new URL(url).origin;

    const title =
      extractMeta(html, 'og:title') ||
      extractMeta(html, 'twitter:title') ||
      extractTitle(html);

    const description =
      extractMeta(html, 'og:description') ||
      extractMeta(html, 'twitter:description') ||
      extractMeta(html, 'description');

    let image =
      extractMeta(html, 'og:image') ||
      extractMeta(html, 'twitter:image') ||
      extractMeta(html, 'twitter:image:src');

    if (image && !image.startsWith('http')) {
      image = resolveUrl(origin, image);
    }

    const siteName =
      extractMeta(html, 'og:site_name') ||
      new URL(url).hostname.replace(/^www\./, '');

    const faviconMatch = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);

    let favicon = faviconMatch?.[1];
    if (favicon && !favicon.startsWith('http')) {
      favicon = resolveUrl(origin, favicon);
    }
    if (!favicon) {
      favicon = `${origin}/favicon.ico`;
    }

    const data: LinkPreviewData = {
      url,
      title: title ? title.substring(0, 200) : undefined,
      description: description ? description.substring(0, 300) : undefined,
      image,
      siteName,
      favicon,
    };

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ url } as LinkPreviewData);
  }
}
