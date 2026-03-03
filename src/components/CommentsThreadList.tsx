"use client";

import { useMemo, useState } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Button,
  Badge,
  Box,
  Tooltip,
  Paper,
} from '@mantine/core';
import { IconMessageCircle, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { UserDisplay } from './UserDisplay';

export interface CommentForThread {
  id: string;
  comment_text: string;
  created_at: string;
  updated_at?: string | null;
  status_at_comment?: string | null;
  created_by?: {
    id: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
  };
  is_read: boolean;
  epic: { id: string; name: string } | null;
  criterion: { id: string; label: string; category?: string | null } | null;
  launch_criterion_status_id: string;
}

interface ThreadGroup {
  launch_criterion_status_id: string;
  epic: { id: string; name: string };
  criterion: { id: string; label: string };
  comments: CommentForThread[];
  lastActivityAt: string;
  unreadCount: number;
}

interface CommentsThreadListProps {
  comments: CommentForThread[];
  onNavigateToEpic?: (epicId: string) => void;
  onOpenThread?: (epicId: string, taskId: string, taskLabel: string) => void;
  loading?: boolean;
  previewRepliesCount?: number;
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

function getStatusColor(status: string | null | undefined): string | null {
  if (!status) return null;
  switch (status) {
    case 'GO':
      return '#10b981';
    case 'CONDITIONAL':
      return '#f59e0b';
    case 'NO_GO':
      return '#ef4444';
    default:
      return null;
  }
}

function getStatusLabel(status: string | null | undefined): string {
  if (!status) return '';
  switch (status) {
    case 'GO':
      return 'GO';
    case 'CONDITIONAL':
      return 'CONDITIONAL';
    case 'NO_GO':
      return 'NO GO';
    default:
      return status;
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type ThreadDisplayItem =
  | { type: 'comment'; comment: CommentForThread }
  | { type: 'viewMore'; count: number };

function getThreadDisplayItems(
  comments: CommentForThread[],
  expanded: boolean
): ThreadDisplayItem[] {
  if (comments.length === 0) return [];
  if (comments.length === 1) return [{ type: 'comment', comment: comments[0] }];

  const first = comments[0];
  const last = comments[comments.length - 1];
  const middle = comments.slice(1, -1);
  const middleRead = middle.filter((c) => c.is_read);
  const hiddenCount = expanded ? 0 : middleRead.length;

  const items: ThreadDisplayItem[] = [];
  items.push({ type: 'comment', comment: first });

  if (middle.length > 0) {
    if (expanded) {
      middle.forEach((c) => items.push({ type: 'comment', comment: c }));
    } else {
      middle.forEach((c) => {
        if (!c.is_read) items.push({ type: 'comment', comment: c });
      });
      if (hiddenCount > 0) {
        items.push({ type: 'viewMore', count: hiddenCount });
      }
    }
  }

  if (comments.length > 1) {
    items.push({ type: 'comment', comment: last });
  }

  return items;
}

function buildThreads(comments: CommentForThread[]): ThreadGroup[] {
  const byLcs = new Map<string, CommentForThread[]>();
  for (const c of comments) {
    if (!c.epic || !c.criterion || c.launch_criterion_status_id.startsWith('virtual-')) continue;
    const list = byLcs.get(c.launch_criterion_status_id) ?? [];
    list.push(c);
    byLcs.set(c.launch_criterion_status_id, list);
  }

  const threads: ThreadGroup[] = [];
  for (const [lcsId, list] of byLcs) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const lastAt = sorted.length > 0
      ? sorted[sorted.length - 1].updated_at || sorted[sorted.length - 1].created_at
      : '';
    const unreadCount = sorted.filter((c) => !c.is_read).length;
    threads.push({
      launch_criterion_status_id: lcsId,
      epic: sorted[0].epic!,
      criterion: { id: sorted[0].criterion!.id, label: sorted[0].criterion!.label },
      comments: sorted,
      lastActivityAt: lastAt,
      unreadCount,
    });
  }

  threads.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  return threads;
}

export function CommentsThreadList({
  comments,
  onNavigateToEpic,
  onOpenThread,
  loading = false,
  previewRepliesCount = 3,
}: CommentsThreadListProps) {
  const threads = useMemo(() => buildThreads(comments), [comments]);

  if (loading) {
    return (
      <Paper p="md">
        <Text c="dimmed">Loading comments…</Text>
      </Paper>
    );
  }

  if (threads.length === 0) {
    return (
      <Paper p="md">
        <Text c="dimmed">No comment threads found.</Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {threads.map((thread) => (
        <ThreadCard
          key={thread.launch_criterion_status_id}
          thread={thread}
          onNavigateToEpic={onNavigateToEpic}
          onOpenThread={onOpenThread}
        />
      ))}
    </Stack>
  );
}

interface ThreadCardProps {
  thread: ThreadGroup;
  onNavigateToEpic?: (epicId: string) => void;
  onOpenThread?: (epicId: string, taskId: string, taskLabel: string) => void;
}

function ThreadCard({ thread, onNavigateToEpic, onOpenThread }: ThreadCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { epic, criterion, comments, unreadCount } = thread;
  const displayItems = useMemo(
    () => getThreadDisplayItems(comments, expanded),
    [comments, expanded]
  );
  const hasViewMore = displayItems.some((i) => i.type === 'viewMore');
  const hasExpandedMiddle = expanded && comments.length > 2;

  return (
    <Card
      withBorder
      padding="md"
      radius="md"
      style={{
        backgroundColor: unreadCount > 0 ? 'rgba(59, 130, 246, 0.04)' : undefined,
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            {onNavigateToEpic && (
              <Button
                variant="subtle"
                size="xs"
                px={0}
                style={{
                  color: 'var(--color-indigo-600, #4F46E5)',
                  fontWeight: 500,
                  height: 'auto',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  display: 'flex',
                  flexShrink: 0,
                }}
                classNames={{ root: 'epic-name-link' }}
                onClick={() => onNavigateToEpic(epic.id)}
              >
                <Text size="sm" truncate style={{ textAlign: 'left', display: 'block' }}>
                  {epic.name}
                </Text>
              </Button>
            )}
            <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
              &gt;
            </Text>
            {(() => {
              const status = comments.length > 0 ? comments[comments.length - 1].status_at_comment : null;
              const color = getStatusColor(status) ?? '#d1d5db';
              return (
                <Tooltip label={status ? getStatusLabel(status) : 'Unrated'}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      backgroundColor: color,
                      border: status ? `2px solid ${color}` : '2px solid #e5e7eb',
                      boxShadow: status ? `0 0 6px ${color}66` : 'none',
                      cursor: 'help',
                      flexShrink: 0,
                    }}
                  />
                </Tooltip>
              );
            })()}
            <Text size="sm" fw={600} lineClamp={1} style={{ textAlign: 'left', minWidth: 0 }}>
              {criterion.label}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            {unreadCount > 0 && (
              <Badge size="sm" color="blue" variant="light">
                {unreadCount} unread
              </Badge>
            )}
            {onOpenThread && (
              <Button
                variant="light"
                size="xs"
                leftSection={<IconMessageCircle size={14} />}
                onClick={() => onOpenThread(epic.id, thread.launch_criterion_status_id, criterion.label)}
              >
                View thread
              </Button>
            )}
          </Group>
        </Group>

        <Stack gap="xs">
          {displayItems.map((item, idx) =>
            item.type === 'comment' ? (
              <CommentRow key={item.comment.id} comment={item.comment} />
            ) : (
              <Box key={`view-more-${idx}`} py={4}>
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconChevronDown size={14} />}
                  onClick={() => setExpanded(true)}
                >
                  View {item.count} {item.count === 1 ? 'comment' : 'comments'}
                </Button>
              </Box>
            )
          )}
        </Stack>

        {hasExpandedMiddle && (
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconChevronUp size={14} />}
            onClick={() => setExpanded(false)}
          >
            Show less
          </Button>
        )}
      </Stack>
    </Card>
  );
}

function CommentRow({ comment }: { comment: CommentForThread }) {
  const isUnread = !comment.is_read;

  return (
    <Box
      py={4}
      style={{
        borderLeft: isUnread ? '3px solid var(--mantine-color-blue-5)' : undefined,
        paddingLeft: isUnread ? 8 : 0,
        marginLeft: isUnread ? 0 : 2,
      }}
    >
      <Group align="flex-start" wrap="nowrap" gap="sm" style={{ alignItems: 'flex-start' }}>
        <Stack gap={2} style={{ flexShrink: 0, minWidth: 0, maxWidth: 160 }}>
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            {comment.created_by && (
              <UserDisplay
                email={comment.created_by.email}
                firstName={comment.created_by.first_name}
                lastName={comment.created_by.last_name}
                size="xs"
              />
            )}
            {isUnread && (
              <Badge size="xs" color="blue" variant="light">
                Unread
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {formatTimestamp(comment.created_at)}
          </Text>
        </Stack>
        <Box
          component="div"
          className="comment-content"
          style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 'var(--mantine-font-size-sm)' }}
          dangerouslySetInnerHTML={{ __html: comment.comment_text || '' }}
        />
      </Group>
    </Box>
  );
}
