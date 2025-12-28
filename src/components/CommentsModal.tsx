"use client";

import { useState, useEffect } from 'react';
import { Modal, Button, Group, Text, Stack, Textarea, ActionIcon, Loader, ScrollArea } from '@mantine/core';
import { IconTrash, IconSend } from '@tabler/icons-react';

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  created_by?: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

interface CommentsModalProps {
  opened: boolean;
  onClose: () => void;
  epicId: string;
  taskId: string; // launch_criterion_status id
  taskLabel: string;
  currentUserEmail: string;
  requireComment?: boolean; // If true, user must add a comment before closing
  onCommentAdded?: () => void; // Callback when comment is added (for mandatory mode)
  onCloseWithoutComment?: () => void; // Callback when modal closes without comment (for reverting status)
  onCancel?: () => void; // Callback when user cancels (for reverting status with toast)
}

export function CommentsModal({
  opened,
  onClose,
  epicId,
  taskId,
  taskLabel,
  currentUserEmail,
  requireComment = false,
  onCommentAdded,
  onCloseWithoutComment,
  onCancel,
}: CommentsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasAddedComment, setHasAddedComment] = useState(false);

  // Fetch comments when modal opens
  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}/comments`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoading(false);
    }
  };

  // Post new comment
  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ comment_text: newComment.trim() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to post comment');
      }

      const commentText = newComment.trim();
      setNewComment('');
      await fetchComments();
      setHasAddedComment(true); // Mark that a comment was added
      
      // If comment was required and we just added one, notify parent
      if (requireComment && onCommentAdded) {
        onCommentAdded();
      }
    } catch (error: any) {
      alert(`Failed to post comment: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete comment');
      }

      await fetchComments();
    } catch (error: any) {
      alert(`Failed to delete comment: ${error.message}`);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
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
  };

  const getUserDisplay = (comment: Comment): string => {
    if (!comment.created_by) return 'Unknown';
    const { first_name, last_name, email } = comment.created_by;
    if (first_name && last_name) return `${first_name} ${last_name}`;
    if (first_name) return first_name;
    if (last_name) return last_name;
    return email;
  };

  // Fetch comments on open
  useEffect(() => {
    if (opened) {
      fetchComments();
      setHasAddedComment(false); // Reset when modal opens
    }
  }, [opened]);

  const handleClose = () => {
    // If comment is required and no comments exist yet, prevent closing
    const hasComment = comments.length > 0 || newComment.trim().length > 0;
    if (requireComment && !hasComment) {
      alert('Please add a comment before closing. A comment is required for CONDITIONAL or NO_GO ratings.');
      return;
    }
    
    // If closing without comment when required, notify parent to revert status
    if (requireComment && !hasComment && onCloseWithoutComment) {
      onCloseWithoutComment();
    }
    
    onClose();
  };

  const hasComment = comments.length > 0 || newComment.trim().length > 0 || hasAddedComment;
  const canClose = !requireComment || hasComment;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      closeOnClickOutside={canClose}
      closeOnEscape={canClose}
      withCloseButton={canClose}
      title={
        <div>
          <Text fw={600} size="lg">Comments{requireComment && !hasComment ? ' (Required)' : ''}</Text>
          <Text size="sm" c="dimmed">{taskLabel}</Text>
          {requireComment && !hasComment && (
            <Text size="xs" c="red" mt={4}>
              A comment is required for CONDITIONAL or NO_GO ratings. Please add a comment before closing.
            </Text>
          )}
        </div>
      }
      size="lg"
    >
      <Stack gap="md">
        {/* Comments List */}
        <ScrollArea style={{ height: 400 }} type="auto">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader size="sm" />
            </div>
          ) : comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Text size="sm" c="dimmed">
                No comments yet. Be the first to comment!
              </Text>
            </div>
          ) : (
            <Stack gap="md">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    padding: '12px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    backgroundColor: '#fafafa',
                  }}
                >
                  <Group justify="space-between" mb="xs">
                    <div>
                      <Text size="sm" fw={600}>
                        {getUserDisplay(comment)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatTimestamp(comment.created_at)}
                      </Text>
                    </div>
                    {comment.created_by?.email === currentUserEmail && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => handleDeleteComment(comment.id)}
                        title="Delete comment"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {comment.comment_text}
                  </Text>
                </div>
              ))}
            </Stack>
          )}
        </ScrollArea>

        {/* New Comment Input */}
        <div>
          <Text size="sm" fw={600} mb="xs">Add Comment</Text>
          <Textarea
            placeholder="Type your comment here..."
            value={newComment}
            onChange={(e) => setNewComment(e.currentTarget.value)}
            minRows={3}
            maxRows={6}
            disabled={submitting}
          />
          <Group justify="space-between" mt="sm">
            <Group>
              {requireComment && !hasComment && onCancel && (
                <Button 
                  variant="outline" 
                  color="red"
                  onClick={() => {
                    if (onCancel) {
                      onCancel();
                    }
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={handleClose}
                disabled={requireComment && !hasComment}
              >
                {requireComment && !hasComment ? 'Add Comment to Close' : 'Close'}
              </Button>
            </Group>
            <Button
              leftSection={<IconSend size={16} />}
              onClick={handleSubmitComment}
              loading={submitting}
              disabled={!newComment.trim() || submitting}
            >
              Post Comment
            </Button>
          </Group>
        </div>
      </Stack>
    </Modal>
  );
}






