"use client";

/**
 * Minimal markdown renderer for LLM-generated narrative text (bullet/numbered lists, bold,
 * GFM-style pipe tables, paragraphs). Not a general-purpose markdown parser — scoped to exactly
 * what the forecast narrative agent's schema descriptions ask it to produce (see
 * src/lib/forecast/orchestrator.ts's NarrativeSchema). Also normalizes literal "\n" text
 * sequences some model outputs emit in place of real newlines within a JSON string field.
 */

import React from 'react';
import { List, Table, Text } from '@mantine/core';

function normalizeNewlines(text: string): string {
  return text.replace(/\\n/g, '\n');
}

function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <b key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</b>
    ) : (
      <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
    )
  );
}

function isTableSeparatorLine(line: string): boolean {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line.trim());
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function MarkdownLite({ content }: { content: string }) {
  const lines = normalizeNewlines(content).split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // GFM-style pipe table: a "| ... |" row immediately followed by a "|---|---|" separator.
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      const header = parseTableRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push(
        <Table striped withTableBorder key={`tbl-${blockKey++}`} mt="xs" mb="xs">
          <Table.Thead>
            <Table.Tr>
              {header.map((h, hi) => (
                <Table.Th key={hi}>{h}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r, ri) => (
              <Table.Tr key={ri}>
                {r.map((c, ci) => (
                  <Table.Td key={ci}>{renderInline(c, `td-${ri}-${ci}`)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      );
      continue;
    }

    // Bullet list
    if (/^[*-]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[*-]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[*-]\s+/, ''));
        i++;
      }
      blocks.push(
        <List key={`ul-${blockKey++}`} spacing={4} size="sm" mt="xs" mb="xs">
          {items.map((item, ii) => (
            <List.Item key={ii}>{renderInline(item, `li-${ii}`)}</List.Item>
          ))}
        </List>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <List key={`ol-${blockKey++}`} type="ordered" spacing={4} size="sm" mt="xs" mb="xs">
          {items.map((item, ii) => (
            <List.Item key={ii}>{renderInline(item, `oli-${ii}`)}</List.Item>
          ))}
        </List>
      );
      continue;
    }

    // Paragraph — collect consecutive plain lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^[*-]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('|')
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    const paraText = paraLines.join(' ');
    blocks.push(
      <Text key={`p-${blockKey++}`} size="sm" mt="xs" mb="xs">
        {renderInline(paraText, `p-${blockKey}`)}
      </Text>
    );
  }

  return <>{blocks}</>;
}
