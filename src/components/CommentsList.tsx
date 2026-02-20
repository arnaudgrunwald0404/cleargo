"use client";

import { useState } from 'react';
import {
  Table,
  Badge,
  Text,
  Group,
  Paper,
  Button,
  Checkbox,
  Stack,
  ActionIcon,
  Tooltip,
  Card,
} from '@mantine/core';
import { IconMessageCircle, IconCheck } from '@tabler/icons-react';
import { UserDisplay } from './UserDisplay';

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  updated_at?: string | null;
  status_at_comment?: string | null;
  previous_status?: string | null;
  created_by?: {
    id: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
  };
  is_read: boolean;
  read_at?: string | null;
  epic: {
    id: string;
    name: string;
  } | null;
  criterion: {
    id: string;
    label: string;
    category?: string | null;
  } | null;
  launch_criterion_status_id: string;
}

interface CommentsListProps {
  comments: Comment[];
  onMarkRead?: (commentIds: string[]) => void | Promise<void>;
  onNavigateToEpic?: (epicId: string) => void;
  onOpenCommentsModal?: (epicId: string, taskId: string, taskLabel: string) => void;
  loading?: boolean;
  showBulkActions?: boolean;
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

function truncateText(text: string, maxLength: number = 150): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
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

export function CommentsList({
  comments,
  onMarkRead,
  onNavigateToEpic,
  onOpenCommentsModal,
  loading = false,
  showBulkActions = true,
}: CommentsListProps) {
  const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(new Set());

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCommentIds(new Set(comments.map((c) => c.id)));
    } else {
      setSelectedCommentIds(new Set());
    }
  };

  const handleSelectComment = (commentId: string, checked: boolean) => {
    const newSelected = new Set(selectedCommentIds);
    if (checked) {
      newSelected.add(commentId);
    } else {
      newSelected.delete(commentId);
    }
    setSelectedCommentIds(newSelected);
  };

  const handleMarkSelectedAsRead = async () => {
    if (selectedCommentIds.size === 0 || !onMarkRead) return;
    await onMarkRead(Array.from(selectedCommentIds));
    setSelectedCommentIds(new Set());
  };

  const handleMarkAsRead = async (commentId: string) => {
    if (!onMarkRead) return;
    await onMarkRead([commentId]);
  };

  const handleOpenComments = (comment: Comment) => {
    if (!comment.epic || !comment.criterion || !onOpenCommentsModal) return;
    onOpenCommentsModal(
      comment.epic.id,
      comment.launch_criterion_status_id,
      comment.criterion.label
    );
  };

  const handleNavigateToEpic = (epicId: string) => {
    if (onNavigateToEpic) {
      onNavigateToEpic(epicId);
    } else {
      window.location.href = `/epics/${epicId}`;
    }
  };

  if (loading) {
    return (
      <Paper p="md">
        <Text c="dimmed">Loading comments...</Text>
      </Paper>
    );
  }

  if (comments.length === 0) {
    return (
      <Paper p="md">
        <Text c="dimmed">No comments found.</Text>
      </Paper>
    );
  }

  const unreadComments = comments.filter((c) => !c.is_read);
  const allSelected = selectedCommentIds.size === comments.length && comments.length > 0;
  const someSelected = selectedCommentIds.size > 0 && selectedCommentIds.size < comments.length;

  return (
    <Stack gap="md">
      {showBulkActions && onMarkRead && (
        <Group justify="space-between">
          <Group>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={(e) => handleSelectAll(e.currentTarget.checked)}
              label={`Select all (${selectedCommentIds.size} selected)`}
            />
            {selectedCommentIds.size > 0 && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconCheck size={16} />}
                onClick={handleMarkSelectedAsRead}
              >
                Mark {selectedCommentIds.size} as read
              </Button>
            )}
          </Group>
          <Badge color="blue" variant="light">
            {unreadComments.length} unread
          </Badge>
        </Group>
      )}

      <Table.ScrollContainer minWidth={600}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {showBulkActions && onMarkRead && <Table.Th style={{ width: 40 }} />}
              <Table.Th style={{ width: 320 }}>Epic / Criterion</Table.Th>
              <Table.Th style={{ width: 60 }}>Status</Table.Th>
              <Table.Th>Comment</Table.Th>
              <Table.Th style={{ width: 80 }}>Author</Table.Th>
              <Table.Th style={{ width: 100 }}>Date</Table.Th>
              <Table.Th style={{ width: 100 }}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {comments.map((comment) => {
              const isUnread = !comment.is_read;
              const isSelected = selectedCommentIds.has(comment.id);
              const commentText = comment.comment_text.replace(/<[^>]*>/g, ''); // Strip HTML for preview

              return (
                <Table.Tr
                  key={comment.id}
                  style={{
                    backgroundColor: isUnread ? 'rgba(59, 130, 246, 0.05)' : undefined,
                    fontWeight: isUnread ? 600 : undefined,
                  }}
                >
                  {showBulkActions && onMarkRead && (
                    <Table.Td>
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => handleSelectComment(comment.id, e.currentTarget.checked)}
                      />
                    </Table.Td>
                  )}
                  <Table.Td>
                    <Stack gap={2} align="flex-start">
                      {comment.epic ? (
                        <Tooltip label={comment.epic.name}>
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => handleNavigateToEpic(comment.epic!.id)}
                            px={0}
                            style={{
                              color: '#4F46E5',
                              fontWeight: 500,
                              maxWidth: '100%',
                              height: 'auto',
                              justifyContent: 'flex-start',
                            }}
                          >
                            <Text size="sm" truncate style={{ maxWidth: 260 }}>
                              {comment.epic.name}
                            </Text>
                          </Button>
                        </Tooltip>
                      ) : (
                        <Text size="sm" c="dimmed">Unknown epic</Text>
                      )}
                      {comment.criterion ? (
                        <Text size="sm" truncate style={{ maxWidth: 300 }}>
                          {comment.criterion.label}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">Unknown criterion</Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={comment.status_at_comment ? getStatusLabel(comment.status_at_comment) : 'Unrated'}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          backgroundColor: getStatusColor(comment.status_at_comment) ?? '#d1d5db',
                          border: comment.status_at_comment
                            ? `3px solid ${getStatusColor(comment.status_at_comment)}`
                            : '2px solid #e5e7eb',
                          boxShadow: comment.status_at_comment
                            ? `0 0 8px ${getStatusColor(comment.status_at_comment)}66`
                            : 'none',
                          cursor: 'help',
                          flexShrink: 0,
                        }}
                      />
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {commentText}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {comment.created_by ? (
                      <UserDisplay
                        email={comment.created_by.email}
                        firstName={comment.created_by.first_name}
                        lastName={comment.created_by.last_name}
                        size="xs"
                      />
                    ) : (
                      <Text size="sm" c="dimmed">
                        Unknown
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {formatTimestamp(comment.created_at)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {onOpenCommentsModal && comment.epic && comment.criterion && (
                        <Tooltip label="View full context">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            onClick={() => handleOpenComments(comment)}
                          >
                            <IconMessageCircle size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {isUnread && onMarkRead && (
                        <Tooltip label="Mark as read">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="blue"
                            onClick={() => handleMarkAsRead(comment.id)}
                          >
                            <IconCheck size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
