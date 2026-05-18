'use client';

import { Fragment, type ReactNode } from 'react';
import { Anchor, Text } from '@mantine/core';
import { ahaEpicUrl } from '@/lib/aha/epicUrl';

/** Aha epic keys in narratives (e.g. APP-E-123). */
const AHA_KEY_IN_TEXT = /\b([A-Z][A-Z0-9]*-[A-Z]-\d+)\b/g;

export function buildAhaKeyNameMap(
  items: { ahaKey: string; featureName: string }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const i of items) {
    const k = i.ahaKey.trim();
    if (k) m.set(k, i.featureName.trim() || k);
  }
  return m;
}

export function linkifyAhaKeysInText(
  text: string,
  nameByKey?: Map<string, string>,
): ReactNode[] {
  if (!text) return [];

  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(AHA_KEY_IN_TEXT)) {
    const key = match[1];
    const index = match.index ?? 0;
    if (index > last) {
      parts.push(text.slice(last, index));
    }
    const url = ahaEpicUrl(key);
    const name = nameByKey?.get(key);
    parts.push(
      <Anchor key={`${key}-${index}`} href={url} target="_blank" rel="noopener noreferrer" size="sm">
        {name && name !== key ? `${name} (${key})` : key}
      </Anchor>,
    );
    last = index + key.length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts.length > 0 ? parts : [text];
}

export function PlanVsActualNarrativeText({
  text,
  nameByKey,
  size = 'sm',
}: {
  text: string;
  nameByKey?: Map<string, string>;
  size?: 'sm' | 'md';
}) {
  const nodes = linkifyAhaKeysInText(text, nameByKey);
  return (
    <Text size={size} lh={1.6} component="div">
      {nodes.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </Text>
  );
}
