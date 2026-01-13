import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Fetch URL metadata for preview
 * Extracts Open Graph tags, title, and description from a URL
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  // Generate favicon URL using Google's favicon service (always available)
  // For subdomains, try base domain first as it often has better favicon
  const baseDomain = parsedUrl.hostname.split('.').slice(-2).join('.');
  const faviconDomain = baseDomain.includes('.') && parsedUrl.hostname !== baseDomain ? baseDomain : parsedUrl.hostname;
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(faviconDomain)}&sz=64`;

  try {
    // Fetch the URL
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClearGO/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      return NextResponse.json(
        { 
          error: `Failed to fetch URL: ${response.statusText}`,
          url,
          domain: parsedUrl.hostname,
          favicon,
        },
        { status: response.status }
      );
    }

    const html = await response.text();

    // Extract metadata using regex (simple approach)
    const metadata: {
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
    } = {};

    // Extract title from <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }

    // Extract Open Graph tags
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitleMatch) {
      metadata.title = ogTitleMatch[1].trim();
    }

    const ogDescriptionMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (ogDescriptionMatch) {
      metadata.description = ogDescriptionMatch[1].trim();
    }

    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (ogImageMatch) {
      let imageUrl = ogImageMatch[1].trim();
      // Handle relative URLs
      if (imageUrl.startsWith('//')) {
        imageUrl = parsedUrl.protocol + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        imageUrl = parsedUrl.origin + imageUrl;
      }
      metadata.image = imageUrl;
    }

    const ogSiteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
    if (ogSiteNameMatch) {
      metadata.siteName = ogSiteNameMatch[1].trim();
    }

    // Extract meta description as fallback
    if (!metadata.description) {
      const metaDescriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      if (metaDescriptionMatch) {
        metadata.description = metaDescriptionMatch[1].trim();
      }
    }

    return NextResponse.json({
      url,
      ...metadata,
      domain: parsedUrl.hostname,
      favicon,
    });
  } catch (error: any) {
    console.error('Error fetching URL preview:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ 
        error: 'Request timeout',
        url,
        domain: parsedUrl.hostname,
        favicon,
      }, { status: 408 });
    }
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch URL metadata',
        url,
        domain: parsedUrl.hostname,
        favicon,
      },
      { status: 500 }
    );
  }
}
