"use client";

import { useEffect, useState } from 'react';
import { Paper, Text, Group, Skeleton, Image, Anchor } from '@mantine/core';
import type { LinkPreviewData } from '@/app/api/link-preview/route';

interface LinkPreviewProps {
  url: string;
}

export function LinkPreview({ url }: LinkPreviewProps) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d: LinkPreviewData) => {
        if (cancelled) return;
        if (!d.title && !d.description && !d.image) {
          setFailed(true);
        } else {
          setData(d);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <Paper
        withBorder
        radius="md"
        p="xs"
        mt={6}
        style={{ maxWidth: 420, overflow: 'hidden' }}
      >
        <Group gap="xs" wrap="nowrap">
          <Skeleton height={64} width={80} radius="sm" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton height={12} mb={6} radius="sm" />
            <Skeleton height={10} width="80%" radius="sm" />
          </div>
        </Group>
      </Paper>
    );
  }

  if (failed || !data) return null;

  const domain = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  })();

  return (
    <Anchor
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      underline="never"
      mt={6}
      display="block"
      style={{ maxWidth: 420 }}
    >
      <Paper
        withBorder
        radius="md"
        style={{
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = '';
        }}
      >
        <Group gap={0} wrap="nowrap" align="stretch">
          {data.image && (
            <div
              style={{
                width: 90,
                flexShrink: 0,
                background: '#f3f4f6',
                overflow: 'hidden',
              }}
            >
              <Image
                src={data.image}
                alt={data.title || ''}
                h={90}
                w={90}
                fit="cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, padding: '8px 10px' }}>
            <Group gap={4} mb={2} wrap="nowrap">
              {data.favicon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.favicon}
                  alt=""
                  width={12}
                  height={12}
                  style={{ flexShrink: 0 }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <Text size="xs" c="dimmed" truncate style={{ flex: 1 }}>
                {data.siteName || domain}
              </Text>
            </Group>
            {data.title && (
              <Text size="xs" fw={600} lineClamp={2} style={{ lineHeight: 1.3 }}>
                {data.title}
              </Text>
            )}
            {data.description && (
              <Text size="xs" c="dimmed" lineClamp={2} mt={2} style={{ lineHeight: 1.3 }}>
                {data.description}
              </Text>
            )}
          </div>
        </Group>
      </Paper>
    </Anchor>
  );
}

export function extractUrlsFromHtml(html: string): string[] {
  if (!html) return [];
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  const matches = html.match(urlRegex) || [];
  return [...new Set(matches)];
}
