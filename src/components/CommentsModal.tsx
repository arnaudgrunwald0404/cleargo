"use client";

import { useState, useEffect } from 'react';
import { Modal, Button, Group, Text, Stack, ActionIcon, ScrollArea, FileButton, Badge } from '@mantine/core';
import { PurpleLoader } from './PurpleLoader';
import { IconTrash, IconSend, IconPaperclip, IconX } from '@tabler/icons-react';
import { RichText } from './admin/RichText';

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  created_by?: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
  attachments?: Attachment[];
}

interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  uploaded_at: string;
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  
  // Expose comments count for parent component
  useEffect(() => {
    // Notify parent when comments change (for displaying count)
    if (opened && comments.length > 0) {
      // Could emit event or use callback if needed
    }
  }, [comments, opened]);

  // Fetch comments when modal opens
  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}/comments`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        // Fetch attachments for each comment
        const commentsWithAttachments = await Promise.all(
          data.map(async (comment: Comment) => {
            try {
              const attRes = await fetch(`/api/epics/${epicId}/criteria/${taskId}/comments/${comment.id}/attachments`, {
                credentials: 'include',
              });
              if (attRes.ok) {
                const attachments = await attRes.json();
                return { ...comment, attachments };
              }
            } catch (e) {
              console.warn('Failed to fetch attachments for comment:', e);
            }
            return { ...comment, attachments: [] };
          })
        );
        setComments(commentsWithAttachments);
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoading(false);
    }
  };

  // Post new comment with attachments
  const handleSubmitComment = async () => {
    // Check if comment has actual content (strip HTML tags for validation) or files
    const textContent = newComment.replace(/<[^>]*>/g, '').trim();
    if (!textContent && selectedFiles.length === 0) return;

    setSubmitting(true);
    setUploadingFiles(true);
    try {
      // First, create the comment
      const commentRes = await fetch(`/api/epics/${epicId}/criteria/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ comment_text: newComment || '' }), // Send HTML as-is
      });

      if (!commentRes.ok) {
        const error = await commentRes.json();
        throw new Error(error.error || 'Failed to post comment');
      }

      const comment = await commentRes.json();
      const commentId = comment.id;

      // Then, upload attachments if any
      if (selectedFiles.length > 0) {
        const uploadPromises = selectedFiles.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('comment_id', commentId);

          const uploadRes = await fetch(`/api/epics/${epicId}/criteria/${taskId}/attachments`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });

          if (!uploadRes.ok) {
            const error = await uploadRes.json();
            throw new Error(error.error || `Failed to upload ${file.name}`);
          }
        });

        await Promise.all(uploadPromises);
      }

      setNewComment('');
      setSelectedFiles([]);
      await fetchComments();
      setHasAddedComment(true); // Mark that a comment was added
      
      // Always notify parent when comment is added (for refresh)
      if (onCommentAdded) {
        onCommentAdded();
      }
      
      // Close the modal after adding comment
      onClose();
    } catch (error: any) {
      alert(`Failed to post comment: ${error.message}`);
    } finally {
      setSubmitting(false);
      setUploadingFiles(false);
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
              <PurpleLoader size="sm" />
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
                  <div 
                    className="text-sm text-gray-700 [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-1 [&_p]:mb-2 [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800"
                    dangerouslySetInnerHTML={{ __html: comment.comment_text }}
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  />
                  {/* Show attachments if any */}
                  {comment.attachments && comment.attachments.length > 0 && (
                    <Group gap="xs" mt="xs">
                      {comment.attachments.map((attachment) => (
                        <Badge
                          key={attachment.id}
                          variant="light"
                          leftSection={<IconPaperclip size={12} />}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            window.open(`/api/epics/${epicId}/criteria/${taskId}/attachments/${attachment.id}`, '_blank');
                          }}
                        >
                          {attachment.file_name}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </div>
              ))}
            </Stack>
          )}
        </ScrollArea>

        {/* New Comment Input */}
        <div>
          <Text size="sm" fw={600} mb="xs">Add Comment</Text>
          <RichText
            value={newComment}
            onChange={setNewComment}
            placeholder="Type your comment here..."
            rows={4}
          />
          
          {/* File attachments */}
          <div className="mt-2">
            <FileButton
              onChange={(files) => {
                if (files) {
                  const filesArray: File[] = Array.isArray(files) ? files : [files];
                  setSelectedFiles((prev) => {
                    const newFiles: File[] = [...prev];
                    newFiles.push(...filesArray);
                    return newFiles;
                  });
                }
              }}
              accept="*"
              multiple
            >
              {(props) => (
                <Button
                  {...props}
                  size="xs"
                  variant="light"
                  leftSection={<IconPaperclip size={14} />}
                  disabled={submitting}
                >
                  Attach File
                </Button>
              )}
            </FileButton>
            
            {/* Show selected files */}
            {selectedFiles.length > 0 && (
              <Stack gap="xs" mt="xs">
                {selectedFiles.map((file, index) => (
                  <Group key={index} justify="space-between" className="bg-gray-50 p-2 rounded">
                    <Group gap="xs">
                      <IconPaperclip size={14} />
                      <Text size="xs">{file.name}</Text>
                      <Text size="xs" c="dimmed">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </Text>
                    </Group>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={() => {
                        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
                      }}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            )}
          </div>
          
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
              loading={submitting || uploadingFiles}
              disabled={(!newComment.replace(/<[^>]*>/g, '').trim() && selectedFiles.length === 0) || submitting || uploadingFiles}
            >
              {uploadingFiles ? 'Uploading...' : 'Post Comment'}
            </Button>
          </Group>
        </div>
      </Stack>
    </Modal>
  );
}






