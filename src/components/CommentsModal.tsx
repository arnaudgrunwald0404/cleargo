"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Drawer, Button, Group, Text, Stack, ActionIcon, ScrollArea, FileButton, Badge, Card, Image, TextInput, Tabs } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PurpleLoader } from './PurpleLoader';
import { IconTrash, IconSend, IconPaperclip, IconX } from '@tabler/icons-react';
import { RichText, type RichTextMentionHandle } from './admin/RichText';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';

function getMentionedUserIdsFromHtml(html: string): string[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nodes = doc.querySelectorAll('[data-mention-user-id]');
  const ids: string[] = [];
  const seen = new Set<string>();
  nodes.forEach((el) => {
    const id = el.getAttribute('data-mention-user-id');
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  });
  return ids;
}

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  status_at_comment?: string | null;
  previous_status?: string | null;
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
  onCommentAdded?: (comment?: Comment) => void; // Callback when comment is added (for mandatory mode), optionally with comment data
  onCloseWithoutComment?: () => void; // Callback when modal closes without comment (for reverting status)
  onCancel?: () => void; // Callback when user cancels (for reverting status with toast)
  onSkipComment?: () => void | Promise<void>; // Callback when user chooses to skip comment requirement
  criterion?: { data_sources?: Array<{ type: string; value: string; label?: string }> | null };
  epic?: { aha_fields?: Record<string, any> | null; jira_epic_key?: string | null } | null;
  initialTab?: 'content' | 'comments'; // Which tab to open initially (default: 'content')
  statusAtComment?: string | null; // The status when this comment is being created (CONDITIONAL or NO_GO)
  previousStatus?: string | null; // The previous status before the change (for transition arrows)
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
  onSkipComment,
  criterion,
  epic,
  initialTab = 'content',
  statusAtComment,
  previousStatus,
}: CommentsModalProps) {
  const [content, setContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [standaloneAttachments, setStandaloneAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasAddedComment, setHasAddedComment] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [skippingComment, setSkippingComment] = useState(false);
  const [dataSourceValues, setDataSourceValues] = useState<Record<string, string | { url: string; assetName?: string }>>({});
  const [urlPreviews, setUrlPreviews] = useState<Record<string, { title?: string; description?: string; image?: string; favicon?: string; domain?: string; url?: string } | null>>({});
  const [urlPreviewLoading, setUrlPreviewLoading] = useState<Record<string, boolean>>({});
  const [savingDataSourceValues, setSavingDataSourceValues] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [ahaFieldsMap, setAhaFieldsMap] = useState<Record<string, string>>({});
  const baseContentRef = useRef<string>('');
  const isInitialLoadRef = useRef<boolean>(false);
  const lastContentRebuildRef = useRef<number>(0);

  const richTextRef = useRef<RichTextMentionHandle>(null);
  const [mentionDropdownOpen, setMentionDropdownOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionUsers, setMentionUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [mentionUsersLoading, setMentionUsersLoading] = useState(false);

  const [jiraEpicKey, setJiraEpicKey] = useState<string | null>(null);
  const [jiraDomain, setJiraDomain] = useState<string | null>(null);
  const [jiraEpicKeyLoading, setJiraEpicKeyLoading] = useState(false);
  const [jiraEpicKeySource, setJiraEpicKeySource] = useState<'cached' | 'jira_search' | 'integrations' | null>(null);
  const [jiraTickets, setJiraTickets] = useState<Record<number, Array<{
    key: string;
    summary: string;
    status: string;
    statusCategory: string;
    issueType: string;
    url: string | null;
  }>>>({});
  const [jiraTicketsLoading, setJiraTicketsLoading] = useState<Record<number, boolean>>({});

  // Fetch Jira epic key and domain when modal opens and epic is available
  useEffect(() => {
    if (!opened || !epicId) return;

    // Check if we already have a cached Jira epic key in the epic prop
    if (epic?.jira_epic_key) {
      setJiraEpicKey(epic.jira_epic_key);
      setJiraEpicKeySource('cached');
      console.log(`✅ Using cached Jira epic key from epic prop: ${epic.jira_epic_key}`);
      
      // Still fetch Jira domain from settings
      fetch('/api/settings', {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(settings => {
          if (settings.jira_domain) {
            setJiraDomain(settings.jira_domain);
          }
        })
        .catch(error => {
          console.error('Error fetching Jira domain:', error);
        });
      
      return; // Don't make API call if we have cached value
    }

    const fetchJiraEpicKey = async () => {
      setJiraEpicKeyLoading(true);
      try {
        // Fetch Jira epic key from API (checks cache first, then tries integrations, then Jira search)
        const response = await fetchWithRateLimit(`/api/epics/${epicId}/jira-epic-key`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.jiraEpicKey) {
            setJiraEpicKey(data.jiraEpicKey);
            setJiraEpicKeySource(data.source || null);
            console.log(`✅ Jira epic key fetched: ${data.jiraEpicKey} (source: ${data.source})`);
          } else {
            setJiraEpicKey(null);
            setJiraEpicKeySource(null);
          }
        }

        // Fetch Jira domain from settings
        const settingsResponse = await fetchWithRateLimit('/api/settings', {
          credentials: 'include',
        });
        
        if (settingsResponse.ok) {
          const settings = await settingsResponse.json();
          if (settings.jira_domain) {
            setJiraDomain(settings.jira_domain);
          }
        }
      } catch (error) {
        console.error('Error fetching Jira epic key:', error);
        setJiraEpicKey(null);
      } finally {
        setJiraEpicKeyLoading(false);
      }
    };

    fetchJiraEpicKey();
  }, [opened, epicId, epic?.jira_epic_key]);

  const buildJiraIssuesUrlForOpenEpicTickets = (source: { value: string; label?: string } | null): string | null => {
    if (!jiraEpicKey || !jiraDomain) return null;

    const defaultJql = 'parent = {{JIRA_EPIC}} and statusCategory != Done';
    const template = (source?.value || '').trim() || defaultJql;
    const jql = template.replace(/\{\{JIRA_EPIC\}\}/g, jiraEpicKey);
    
    // Remove protocol if present and construct URL
    const cleanDomain = jiraDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${cleanDomain}/issues?jql=${encodeURIComponent(jql)}`;
  };

  const getJqlFromSource = (source: { value: string; label?: string } | null): string | null => {
    if (!jiraEpicKey) return null;

    const defaultJql = 'parent = {{JIRA_EPIC}} and statusCategory != Done';
    const template = (source?.value || '').trim() || defaultJql;
    return template.replace(/\{\{JIRA_EPIC\}\}/g, jiraEpicKey);
  };

  // Track which Jira URLs we've already attempted to save (to avoid infinite loops)
  const savedJiraUrlsRef = useRef<Set<string>>(new Set());
  // Use a ref to track current dataSourceValues to avoid dependency issues
  const dataSourceValuesRef = useRef(dataSourceValues);
  
  // Keep ref in sync with state
  useEffect(() => {
    dataSourceValuesRef.current = dataSourceValues;
  }, [dataSourceValues]);

  // Fetch Jira tickets when epic key is available and save URL if generated
  useEffect(() => {
    if (!opened || !jiraEpicKey || !jiraDomain || !criterion?.data_sources || contentLoading) return;

    const fetchTickets = async () => {
      criterion.data_sources?.forEach(async (source, index) => {
        if (source.type !== 'jira_jql') return;

        const jql = getJqlFromSource(source);
        if (!jql) return;

        // Build Jira URL
        const jiraUrl = buildJiraIssuesUrlForOpenEpicTickets(source);
        
        // Check if URL is already saved in current state (use ref to get latest value)
        const currentSavedUrl = dataSourceValuesRef.current[index.toString()];
        let savedUrlString = '';
        if (typeof currentSavedUrl === 'string') {
          savedUrlString = currentSavedUrl.trim();
        } else if (currentSavedUrl && typeof currentSavedUrl === 'object' && 'url' in currentSavedUrl) {
          savedUrlString = (currentSavedUrl as any).url?.trim() || '';
        }
        
        // Check if the saved URL matches the generated URL (allowing for URL encoding differences)
        const normalizedSavedUrl = savedUrlString ? savedUrlString.replace(/%20/g, ' ').replace(/\s+/g, ' ').trim() : '';
        const normalizedGeneratedUrl = jiraUrl ? jiraUrl.replace(/%20/g, ' ').replace(/\s+/g, ' ').trim() : '';
        const isUrlSaved = savedUrlString !== '' && !!jiraUrl && (
          savedUrlString === jiraUrl || 
          normalizedSavedUrl === normalizedGeneratedUrl ||
          (jiraEpicKey && savedUrlString.includes(jiraEpicKey)) // If saved URL contains the epic key, consider it saved
        );

        console.log(`🔍 Checking Jira URL save status for source ${index}:`, {
          jiraUrl,
          currentSavedUrl,
          savedUrlString,
          normalizedSavedUrl,
          normalizedGeneratedUrl,
          isUrlSaved,
          jiraEpicKey,
          dataSourceValuesKeys: Object.keys(dataSourceValuesRef.current),
          urlKey: `${taskId}-${index}-${jiraUrl}`,
          alreadyAttempted: savedJiraUrlsRef.current.has(`${taskId}-${index}-${jiraUrl}`)
        });

        // Save the generated URL if it's not already saved and we haven't tried to save it yet
        const urlKey = `${taskId}-${index}-${jiraUrl}`;
        if (jiraUrl && !isUrlSaved && !savedJiraUrlsRef.current.has(urlKey)) {
          console.log(`💾 Auto-saving generated Jira URL for source ${index}: ${jiraUrl}`);
          savedJiraUrlsRef.current.add(urlKey);
          setDataSourceValues(prev => {
            // Only update if the value is actually different to prevent infinite loops
            const currentValue = prev[index.toString()];
            const currentUrl = typeof currentValue === 'string' ? currentValue : (currentValue as any)?.url;
            if (currentUrl === jiraUrl) {
              return prev; // No change needed
            }
            return { ...prev, [index.toString()]: jiraUrl };
          });
          // Save to database
          try {
            const updatedValues = { ...dataSourceValuesRef.current, [index.toString()]: jiraUrl };
            console.log(`📤 Sending PATCH request to save Jira URL:`, {
              url: `/api/epics/${epicId}/criteria/${taskId}`,
              data_source_values: updatedValues
            });
            const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ data_source_values: updatedValues }),
            });
            if (!res.ok) {
              const errorText = await res.text();
              console.error(`❌ Failed to save Jira URL. Status: ${res.status}, Response:`, errorText);
              throw new Error(`Failed to save Jira URL: ${res.status} ${errorText}`);
            }
            const savedData = await res.json();
            console.log(`✅ Successfully saved Jira URL to database for source ${index}:`, savedData?.data_source_values);
          } catch (error) {
            console.error('❌ Failed to auto-save Jira URL:', error);
            savedJiraUrlsRef.current.delete(urlKey); // Allow retry on error
          }
        } else if (jiraUrl && isUrlSaved) {
          console.log(`ℹ️ Jira URL already saved for source ${index}, skipping save`);
        } else if (jiraUrl && savedJiraUrlsRef.current.has(urlKey)) {
          console.log(`ℹ️ Already attempted to save Jira URL for source ${index}, skipping duplicate save`);
        }

        setJiraTicketsLoading(prev => ({ ...prev, [index]: true }));
        try {
          const response = await fetchWithRateLimit(`/api/jira/search-issues?jql=${encodeURIComponent(jql)}`, {
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            setJiraTickets(prev => ({ ...prev, [index]: data.issues || [] }));
          } else {
            console.error('Failed to fetch Jira tickets:', await response.text());
            setJiraTickets(prev => ({ ...prev, [index]: [] }));
          }
        } catch (error) {
          console.error('Error fetching Jira tickets:', error);
          setJiraTickets(prev => ({ ...prev, [index]: [] }));
        } finally {
          setJiraTicketsLoading(prev => ({ ...prev, [index]: false }));
        }
      });
    };

    fetchTickets();
  }, [opened, jiraEpicKey, jiraDomain, criterion?.data_sources, taskId, epicId, contentLoading]);
  
  // Expose comments count for parent component
  useEffect(() => {
    // Notify parent when comments change (for displaying count)
    if (opened && comments.length > 0) {
      // Could emit event or use callback if needed
    }
  }, [comments, opened]);

  // Fetch comments and attachments when modal opens
  const fetchComments = async () => {
    setLoading(true);
    try {
      const [commentsRes, attachmentsRes] = await Promise.all([
        fetch(`/api/epics/${epicId}/criteria/${taskId}/comments`, {
          credentials: 'include',
        }),
        fetch(`/api/epics/${epicId}/criteria/${taskId}/attachments`, {
          credentials: 'include',
        }),
      ]);

      // Fetch comments
      if (commentsRes.ok) {
        const data = await commentsRes.json();
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
        
        // Merge with existing optimistic comments smoothly
        // Match optimistic comments to real ones by content, user, and timestamp
        setComments(prev => {
          const optimisticComments = prev.filter(c => c.id.startsWith('temp-'));
          const realComments = commentsWithAttachments;
          
          if (optimisticComments.length === 0) {
            // No optimistic comments, just return real ones
            return realComments;
          }
          
          // Create a map of real comments for matching
          // Key: normalized content + user email
          const realCommentsMap = new Map<string, Comment>();
          realComments.forEach(comment => {
            const normalizedContent = comment.comment_text.replace(/<[^>]*>/g, '').trim().toLowerCase();
            const userEmail = comment.created_by?.email?.toLowerCase() || '';
            const key = `${normalizedContent}|${userEmail}`;
            // Keep the most recent comment if there are duplicates
            if (!realCommentsMap.has(key)) {
              realCommentsMap.set(key, comment);
            } else {
              const existing = realCommentsMap.get(key)!;
              if (new Date(comment.created_at) > new Date(existing.created_at)) {
                realCommentsMap.set(key, comment);
              }
            }
          });
          
          // Match optimistic comments to real ones
          const matchedOptimisticIds = new Set<string>();
          const matchedRealIds = new Set<string>();
          
          optimisticComments.forEach(optimistic => {
            const normalizedContent = optimistic.comment_text.replace(/<[^>]*>/g, '').trim().toLowerCase();
            const userEmail = optimistic.created_by?.email?.toLowerCase() || currentUserEmail.toLowerCase();
            const key = `${normalizedContent}|${userEmail}`;
            const matched = realCommentsMap.get(key);
            
            if (matched) {
              // Check if timestamps are close (within 60 seconds to account for network delay)
              const optimisticTime = new Date(optimistic.created_at).getTime();
              const realTime = new Date(matched.created_at).getTime();
              const timeDiff = Math.abs(optimisticTime - realTime);
              
              // Match if timestamp is close OR if it's a recent comment (within last 2 minutes)
              const isRecent = timeDiff < 120000; // 2 minutes
              if (isRecent) {
                matchedOptimisticIds.add(optimistic.id);
                matchedRealIds.add(matched.id);
              }
            }
          });
          
          // Keep unmatched optimistic comments (they'll be replaced when real comments arrive)
          const unmatchedOptimistic = optimisticComments.filter(c => !matchedOptimisticIds.has(c.id));
          
          // All real comments should be included (matched ones replace optimistic, unmatched ones are new)
          // Combine: all real comments + unmatched optimistic comments
          // Sort by timestamp to maintain order
          const merged = [...realComments, ...unmatchedOptimistic].sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          
          return merged;
        });
      }

      // Fetch standalone attachments (not attached to comments)
      if (attachmentsRes.ok) {
        const attachments = await attachmentsRes.json();
        setStandaloneAttachments(attachments || []);
      }
    } catch (error) {
      console.error('Failed to fetch comments/attachments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMentionTrigger = useCallback((query: string) => {
    setMentionQuery(query);
    setMentionDropdownOpen(true);
    if (mentionUsers.length === 0 && !mentionUsersLoading) {
      setMentionUsersLoading(true);
      fetch('/api/users', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : []))
        .then((users: Array<{ id: string; email: string; first_name?: string; last_name?: string; name?: string }>) => {
          const list = (Array.isArray(users) ? users : []).map((u) => ({
            id: u.id,
            email: u.email || '',
            name: u.name || (u.first_name && u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.first_name || u.last_name || u.email || ''),
          }));
          setMentionUsers(list);
        })
        .catch(() => setMentionUsers([]))
        .finally(() => setMentionUsersLoading(false));
    }
  }, [mentionUsers.length, mentionUsersLoading]);

  const mentionFiltered = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return mentionUsers.slice(0, 10);
    return mentionUsers
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 10);
  }, [mentionUsers, mentionQuery]);

  useEffect(() => {
    if (!mentionDropdownOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMentionDropdownOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mentionDropdownOpen]);

  useEffect(() => {
    if (!opened) setMentionDropdownOpen(false);
  }, [opened]);

  // Post new comment with attachments
  const handleSubmitComment = async () => {
    // Check if comment has actual content (strip HTML tags for validation) or files
    const textContent = newComment.replace(/<[^>]*>/g, '').trim();
    if (!textContent && selectedFiles.length === 0) return;

    // Create optimistic comment immediately
    const tempCommentId = `temp-${Date.now()}`;
    const optimisticComment: Comment = {
      id: tempCommentId,
      comment_text: newComment || '',
      created_at: new Date().toISOString(),
      status_at_comment: statusAtComment ?? null,
      previous_status: previousStatus ?? null,
      created_by: {
        email: currentUserEmail,
      },
      attachments: selectedFiles.map((file, index) => ({
        id: `temp-attachment-${Date.now()}-${index}`,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        uploaded_at: new Date().toISOString(),
      })),
    };

    // Add optimistic comment to UI immediately
    setComments(prev => [...prev, optimisticComment]);
    setNewComment('');
    const filesToUpload = [...selectedFiles];
    setSelectedFiles([]);
    setHasAddedComment(true);
    
    // Notify parent immediately with optimistic comment data for Matrix updates
    if (onCommentAdded) {
      onCommentAdded(optimisticComment);
    }
    
    // Close the drawer immediately (don't wait for API call)
    onClose();
    
    // Save in the background
    (async () => {
      setSubmitting(true);
      setUploadingFiles(true);
      
      try {
        // Create the comment via API
        const mentionedIds = getMentionedUserIdsFromHtml(optimisticComment.comment_text);
        const commentRes = await fetchWithRateLimit(`/api/epics/${epicId}/criteria/${taskId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            comment_text: optimisticComment.comment_text,
            status_at_comment: statusAtComment ?? null,
            previous_status: previousStatus ?? null,
            ...(mentionedIds.length > 0 ? { mentioned_user_ids: mentionedIds } : {}),
          }),
        });

        if (!commentRes.ok) {
          const error = await commentRes.json();
          // Remove optimistic comment on error
          setComments(prev => prev.filter(c => c.id !== tempCommentId));
          throw new Error(error.error || 'Failed to post comment');
        }

        const comment = await commentRes.json();
        const commentId = comment.id;

        // Upload attachments if any
        let attachmentError: string | null = null;
        if (filesToUpload.length > 0) {
          try {
            const uploadPromises = filesToUpload.map(async (file) => {
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
          } catch (uploadError: any) {
            // Comment was created successfully, but attachment upload failed
            attachmentError = uploadError.message;
          }
        }

        // Fetch attachments for the comment
        let commentAttachments: Attachment[] = [];
        try {
          const attRes = await fetchWithRateLimit(`/api/epics/${epicId}/criteria/${taskId}/comments/${commentId}/attachments`, {
            credentials: 'include',
          });
          if (attRes.ok) {
            commentAttachments = await attRes.json();
          }
        } catch (e) {
          console.warn('Failed to fetch attachments for comment:', e);
        }

        // Smoothly replace optimistic comment with real comment from server
        // This prevents flickering by directly replacing instead of refetching all comments
        setComments(prev => {
          // Find and remove the optimistic comment
          const withoutOptimistic = prev.filter(c => c.id !== tempCommentId);
          // Add the real comment with attachments
          const realComment: Comment = {
            ...comment,
            attachments: commentAttachments,
          };
          // Insert in the correct position (sorted by timestamp)
          const merged = [...withoutOptimistic, realComment].sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          return merged;
        });
        
        // Show warning if attachment upload failed but comment was created
        if (attachmentError) {
          // Use a notification instead of alert since drawer is already closed
          notifications.show({
            title: 'Attachment upload failed',
            message: `Comment posted successfully, but failed to upload attachment: ${attachmentError}`,
            color: 'orange',
            autoClose: 5000,
          });
        }
      } catch (error: any) {
        // Comment creation failed - remove optimistic comment
        setComments(prev => prev.filter(c => c.id !== tempCommentId));
        // Show error notification since drawer is already closed
        notifications.show({
          title: 'Failed to post comment',
          message: error.message || 'An error occurred while posting the comment',
          color: 'red',
          autoClose: 5000,
        });
      } finally {
        setSubmitting(false);
        setUploadingFiles(false);
      }
    })();
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

  // Helper function to get status color
  const getStatusColor = (status: string | null | undefined): string | null => {
    if (!status) return null;
    switch (status) {
      case 'GO': return '#10b981'; // green
      case 'CONDITIONAL': return 'var(--color-conditional-alloy, #FFA680)'; // Alloy
      case 'NO_GO': return '#ef4444'; // red
      case 'NOT_SET': return '#9ca3af'; // gray
      case 'NOT_APPLICABLE': return '#6b7280'; // gray
      default: return null;
    }
  };

  // Helper function to get status label
  const getStatusLabel = (status: string | null | undefined): string => {
    if (!status) return 'Unknown';
    switch (status) {
      case 'GO': return 'GO (green)';
      case 'CONDITIONAL': return 'CONDITIONAL (Alloy)';
      case 'NO_GO': return 'NO_GO (red)';
      case 'NOT_SET': return 'NOT_SET (gray)';
      case 'NOT_APPLICABLE': return 'N/A (not applicable)';
      default: return status;
    }
  };

  // Helper functions to extract URL and asset name from data source values (supports both string and object formats)
  const getUrlFromDataSourceValue = (value: string | { url: string; assetName?: string } | undefined): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.url || '';
  };

  const getAssetNameFromDataSourceValue = (value: string | { url: string; assetName?: string } | undefined): string => {
    if (!value) return '';
    if (typeof value === 'string') return '';
    return value.assetName || '';
  };

  // Fetch URL preview
  const fetchUrlPreview = async (url: string, dataSourceIndex: string) => {
    if (!url || !url.match(/^https?:\/\/.+/)) {
      setUrlPreviews(prev => ({ ...prev, [dataSourceIndex]: null }));
      return;
    }

    // Extract domain as fallback
    let domain: string | undefined;
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
    } catch (e) {
      // Invalid URL, will handle below
    }

    // Generate favicon URL for fallback
    // For subdomains, try base domain first as it often has better favicon
    let faviconDomain = domain;
    if (domain) {
      const parts = domain.split('.');
      if (parts.length > 2) {
        faviconDomain = parts.slice(-2).join('.');
      }
    }
    const favicon = faviconDomain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(faviconDomain)}&sz=64` : undefined;

    setUrlPreviewLoading(prev => ({ ...prev, [dataSourceIndex]: true }));
    try {
      const res = await fetchWithRateLimit(`/api/url-preview?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        setUrlPreviews(prev => ({ ...prev, [dataSourceIndex]: data }));
      } else {
        const errorData = await res.json().catch(() => ({}));
        // Even if metadata fetch fails, store URL, domain, and favicon for fallback display
        setUrlPreviews(prev => ({ ...prev, [dataSourceIndex]: { url, domain, favicon: errorData.favicon || favicon } }));
      }
    } catch (error) {
      console.error('Failed to fetch URL preview:', error);
      // Even on error, store URL, domain, and favicon for fallback display
      setUrlPreviews(prev => ({ ...prev, [dataSourceIndex]: { url, domain, favicon } }));
    } finally {
      setUrlPreviewLoading(prev => ({ ...prev, [dataSourceIndex]: false }));
    }
  };

  // Fetch content when drawer opens
  const fetchContent = async () => {
    setContentLoading(true);
    isInitialLoadRef.current = true;
    try {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      
      // Try to select with data_source_values first, fallback if column doesn't exist
      let data: any = null;
      let baseContent = '';
      
      const { data: dataWithColumn, error: errorWithColumn } = await supabase
        .from('epic_criterion_status')
        .select('current_status_notes, data_source_values')
        .eq('id', taskId)
        .single();
      
      if (errorWithColumn) {
        // If column doesn't exist (400 error), try without it
        if (errorWithColumn.code === 'PGRST116' || errorWithColumn.message?.includes('column') || errorWithColumn.message?.includes('data_source_values')) {
          const { data: dataWithoutColumn, error: errorWithoutColumn } = await supabase
            .from('epic_criterion_status')
            .select('current_status_notes')
            .eq('id', taskId)
            .single();
          
          if (errorWithoutColumn) {
            console.error('Failed to fetch content:', errorWithoutColumn);
            return;
          }
          data = dataWithoutColumn;
        } else {
          console.error('Failed to fetch content:', errorWithColumn);
          return;
        }
      } else {
        data = dataWithColumn;
      }
      
      // Handle case where Supabase returns array instead of object (client-side query behavior)
      if (Array.isArray(data) && data.length > 0) {
        data = data[0];
      }
      
      // Get data source values from fetched data (use local variable, not state)
      const fetchedDataSourceValues = data?.data_source_values || {};
      
      if (data) {
        baseContent = data.current_status_notes || '';
        // Strip any previously added data source content to prevent duplication
        baseContent = stripDataSourceContent(baseContent);
        baseContentRef.current = baseContent;
        // Load data source values if column exists
        if (data.data_source_values) {
          setDataSourceValues(data.data_source_values);
          // Fetch URL previews for any URL data sources
          if (criterion?.data_sources) {
            criterion.data_sources.forEach((source, index) => {
              if (source.type === 'url' && data.data_source_values[index.toString()]) {
                const urlValue = getUrlFromDataSourceValue(data.data_source_values[index.toString()]);
                if (urlValue) {
                  fetchUrlPreview(urlValue, index.toString());
                }
              }
            });
          }
        }
      }

      // Build content from data sources
      const finalContent = buildContentFromDataSources(baseContent, fetchedDataSourceValues, urlPreviews);
      setContent(finalContent);
    } catch (error) {
      console.error('Failed to fetch content:', error);
    } finally {
      setContentLoading(false);
      // Allow a brief delay to ensure state updates complete before allowing autosave
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 100);
    }
  };

  // Helper function to clean HTML by removing empty elements and excessive whitespace
  const cleanExtractedHTML = (html: string): string => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const container = doc.body;
      
      // Remove empty list items and clean up list item content
      const listItems = container.querySelectorAll('li');
      listItems.forEach((li) => {
        const textContent = li.textContent?.trim() || '';
        const innerHTML = li.innerHTML?.trim() || '';
        // Remove if empty or only contains whitespace/breaks
        if (!textContent || textContent === '' || textContent === '\n' || textContent === '\n\n' || innerHTML === '<br>' || innerHTML === '<br/>') {
          li.remove();
        } else {
          // Remove trailing <br> tags from list items
          let cleanedHTML = innerHTML;
          cleanedHTML = cleanedHTML.replace(/<br\s*\/?>\s*$/i, '');
          cleanedHTML = cleanedHTML.replace(/^\s*<br\s*\/?>/i, '');
          li.innerHTML = cleanedHTML;
        }
      });
      
      // Remove empty paragraphs and clean up paragraph content
      const paragraphs = container.querySelectorAll('p');
      paragraphs.forEach((p) => {
        const textContent = p.textContent?.trim() || '';
        const innerHTML = p.innerHTML?.trim() || '';
        // Remove if empty or only contains <br> tags
        if (!textContent || innerHTML === '<br>' || innerHTML === '<br/>' || innerHTML === '') {
          p.remove();
        } else {
          // Remove trailing <br> tags from paragraphs
          let cleanedHTML = innerHTML;
          cleanedHTML = cleanedHTML.replace(/<br\s*\/?>\s*$/i, '');
          cleanedHTML = cleanedHTML.replace(/^\s*<br\s*\/?>/i, '');
          p.innerHTML = cleanedHTML;
        }
      });
      
      // Remove empty list elements
      const lists = container.querySelectorAll('ul, ol');
      lists.forEach((list) => {
        const items = list.querySelectorAll('li');
        if (items.length === 0) {
          list.remove();
        }
      });
      
      // Remove excessive line breaks and normalize whitespace in the HTML string
      let cleanedHTML = container.innerHTML;
      
      // Remove <br> tags between list items (multiple passes to catch all cases)
      cleanedHTML = cleanedHTML.replace(/<\/li>\s*(<br\s*\/?>\s*)+<li/gi, '</li><li');
      cleanedHTML = cleanedHTML.replace(/<\/li>(<br\s*\/?>)+<li/gi, '</li><li');
      // Remove <br> tags between paragraphs
      cleanedHTML = cleanedHTML.replace(/<\/p>\s*(<br\s*\/?>\s*)+<p/gi, '</p><p');
      cleanedHTML = cleanedHTML.replace(/<\/p>(<br\s*\/?>)+<p/gi, '</p><p');
      // Remove <br> tags right before list items or lists
      cleanedHTML = cleanedHTML.replace(/(<br\s*\/?>\s*)+<li/gi, '<li');
      cleanedHTML = cleanedHTML.replace(/(<br\s*\/?>\s*)+<ul/gi, '<ul');
      cleanedHTML = cleanedHTML.replace(/(<br\s*\/?>\s*)+<ol/gi, '<ol');
      // Remove <br> tags right after list items or lists
      cleanedHTML = cleanedHTML.replace(/<\/li>\s*(<br\s*\/?>\s*)+/gi, '</li>');
      cleanedHTML = cleanedHTML.replace(/<\/ul>\s*(<br\s*\/?>\s*)+/gi, '</ul>');
      cleanedHTML = cleanedHTML.replace(/<\/ol>\s*(<br\s*\/?>\s*)+/gi, '</ol>');
      // Remove <br> tags at the start or end
      cleanedHTML = cleanedHTML.replace(/^(<br\s*\/?>\s*)+/i, '');
      cleanedHTML = cleanedHTML.replace(/(<br\s*\/?>\s*)+$/i, '');
      // Remove any remaining standalone <br> tags (not inside elements)
      cleanedHTML = cleanedHTML.replace(/(>)\s*(<br\s*\/?>\s*)+(<)/gi, '$1$3');
      // Replace multiple consecutive <br> tags with single <br>
      cleanedHTML = cleanedHTML.replace(/(<br\s*\/?>)\s*(<br\s*\/?>)+/gi, '<br>');
      
      return cleanedHTML.trim();
    } catch (error) {
      console.error('Error cleaning HTML:', error);
      return html;
    }
  };

  // Helper function to convert markdown bold (**text**) to HTML (<strong>text</strong>)
  const convertMarkdownToHTML = (text: string): string => {
    if (!text) return text;
    // Replace **text** with <strong>text</strong>
    // Use a regex that handles multiple occurrences and doesn't capture nested cases incorrectly
    return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  };

  // Escape HTML for safe insertion; if value is a URL, return a clickable link
  const escapeHtml = (s: string): string =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  // Allowlist of tags safe to render (lists, paragraphs, formatting, links)
  const ALLOWED_HTML_TAGS = new Set(['ul', 'ol', 'li', 'p', 'br', 'strong', 'em', 'b', 'i', 'a', 'span']);
  const sanitizeHtmlForDisplay = (html: string): string => {
    if (typeof document === 'undefined') return escapeHtml(html);
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const serialize = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '');
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_HTML_TAGS.has(tag)) {
          return Array.from(el.childNodes).map(serialize).join('');
        }
        if (tag === 'br') return '<br>';
        // Unwrap single <p> inside <li> for compact list display (no extra gap between bullets)
        if (tag === 'li') {
          const children = Array.from(el.childNodes);
          const singleP = children.length === 1 && children[0].nodeType === Node.ELEMENT_NODE && (children[0] as Element).tagName.toLowerCase() === 'p';
          const inner = singleP
            ? Array.from((children[0] as Element).childNodes).map(serialize).join('')
            : Array.from(el.childNodes).map(serialize).join('');
          return `<li>${inner}</li>`;
        }
        let attrs = '';
        if (tag === 'a' && el.getAttribute('href')) {
          const href = el.getAttribute('href') || '';
          if (href.startsWith('http://') || href.startsWith('https://')) {
            attrs = ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"`;
          }
        }
        const inner = Array.from(el.childNodes).map(serialize).join('');
        // Mark empty paragraphs with an emoji so empty rows are visible
        if (tag === 'p' && !inner.trim()) return '<p>📭</p>';
        return `<${tag}${attrs}>${inner}</${tag}>`;
      };
      let out = Array.from(doc.body.childNodes).map(serialize).join('');
      // Put an emoji on each empty row created by multiple <br> (so empty lines are visible)
      out = out.replace(/(<br\s*\/?>)(\s*<br\s*\/?>)+/gi, (match, firstBr) => {
        const extraBrCount = (match.match(/<br\s*\/?>/gi) || []).length - 1;
        return firstBr + Array(extraBrCount).fill('📭<br>').join('');
      });
      return out;
    } catch {
      return escapeHtml(html);
    }
  };

  const looksLikeHtml = (s: string): boolean =>
    /<ul[\s>]|<\/ul>|<ol[\s>]|<\/ol>|<li[\s>]|<\/li>|<p[\s>]|<\/p>/.test(s);

  const formatValueForHtmlDisplay = (value: string): string => {
    if (!value) return value;
    const trimmed = value.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const escaped = escapeHtml(trimmed);
      return `<a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a>`;
    }
    if (looksLikeHtml(trimmed)) return sanitizeHtmlForDisplay(trimmed);
    return escapeHtml(value);
  };

  // Helper function to format checkbox items: remove bullets and put text inline with checkboxes
  const formatCheckboxItems = (html: string): string => {
    if (!html) return html;
    
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const body = doc.body;
      
      // Find all lists
      const lists = body.querySelectorAll('ul, ol');
      
      lists.forEach((list) => {
        const listItems = list.querySelectorAll('li');
        const processedItems: Node[] = [];
        
        listItems.forEach((li) => {
          const textContent = li.textContent || '';
          const hasCheckbox = textContent.includes('☑') || textContent.includes('☐');
          
          if (hasCheckbox) {
            // Get the text content and extract checkbox
            const liHTML = li.innerHTML;
            
            // Find checkbox character
            const checkboxMatch = textContent.match(/([☑☐])/);
            if (checkboxMatch) {
              const checkbox = checkboxMatch[1];
              // Get text after checkbox, removing the checkbox character itself
              let text = textContent.replace(/[☑☐]/g, '').trim();
              
              // Create a div with inline format: checkbox + space + text
              const div = doc.createElement('div');
              div.textContent = `${checkbox} ${text}`;
              div.style.marginBottom = '4px';
              
              processedItems.push(div);
            } else {
              // No checkbox found, keep original
              processedItems.push(li.cloneNode(true));
            }
          } else {
            // No checkbox, keep original list item
            processedItems.push(li.cloneNode(true));
          }
        });
        
        // If we processed any items, replace the list
        if (processedItems.some(item => item.nodeName === 'DIV')) {
          // Create a container div or replace list with divs
          const container = doc.createElement('div');
          processedItems.forEach(item => container.appendChild(item));
          list.parentNode?.replaceChild(container, list);
        }
      });
      
      return body.innerHTML;
    } catch (error) {
      console.error('Error formatting checkbox items:', error);
      return html;
    }
  };

  // Helper function to parse HTML table and extract second column value for a keyword
  const parseDescriptionTable = (htmlDescription: string, keyword: string): string | null => {
    if (!htmlDescription || !keyword) return null;
    
    try {
      // Create a DOM parser
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlDescription, 'text/html');
      
      // Find all table rows
      const rows = doc.querySelectorAll('tr');
      
      // Search for the row containing the keyword
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          // Skip rows where first cell has colspan (header/separator rows)
          const firstCell = cells[0];
          if (firstCell.hasAttribute('colspan')) {
            continue;
          }
          
          // Check if first column contains the keyword (case-insensitive)
          const firstCellText = firstCell.textContent?.trim() || '';
          if (firstCellText && firstCellText.toLowerCase().includes(keyword.toLowerCase())) {
            // Return the second column HTML content (preserves formatting)
            const secondCell = cells[1];
            const secondCellHTML = secondCell.innerHTML?.trim() || '';
            const secondCellText = secondCell.textContent?.trim() || '';
            // Skip empty cells (check both HTML and text content)
            if (secondCellHTML && secondCellText) {
              // Clean the HTML to remove empty elements and make it more compact
              return cleanExtractedHTML(secondCellHTML);
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing description table:', error);
      return null;
    }
  };

  // Helper function to generate HTML for URL preview
  const generateUrlPreviewHTML = (preview: { title?: string; description?: string; image?: string; favicon?: string; domain?: string; url?: string; label?: string } | null): string => {
    if (!preview || !preview.url) return '';
    
    // Extract domain from URL if not provided
    let domain = preview.domain;
    if (!domain && preview.url) {
      try {
        const urlObj = new URL(preview.url);
        domain = urlObj.hostname;
      } catch (e) {
        // Invalid URL, use as-is
      }
    }
    
    // Format the URL for display (truncate if too long)
    const displayUrl = preview.url.length > 60 
      ? preview.url.substring(0, 57) + '...' 
      : preview.url;
    
    const imageHtml = preview.image 
      ? `<div style="width: 60px; height: 60px; flex-shrink: 0; overflow: hidden; border-radius: 4px; margin-right: 6px; background-color: #f0f0f0;">
          <img src="${preview.image}" alt="${preview.label || preview.title || domain || preview.url}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.parentElement.style.display='none'" />
        </div>`
      : '';
    
    const faviconHtml = !preview.image && preview.favicon
      ? `<img src="${preview.favicon}" alt="" style="width: 16px; height: 16px; flex-shrink: 0; object-fit: contain; margin-right: 8px;" onerror="this.style.display='none'" />`
      : '';
    
    // Label (expected link type) - displayed first if present
    const labelHtml = preview.label
      ? `<div style="font-size: 14px; font-weight: 600; margin-bottom: 4px; line-height: 1.4; color: #374151;">${preview.label}</div>`
      : '';
    
    // Description (asset name) - displayed second if present
    const descriptionHtml = preview.description
      ? `<div style="font-size: 14px; color: #6e6e73; margin-top: ${preview.label ? '2px' : '0'}; margin-bottom: 4px; line-height: 1.5;">${preview.description}</div>`
      : '';
    
    // URL link - displayed last
    const urlHtml = `<div style="font-size: 13px; color: #2563eb; margin-top: ${preview.description || preview.label ? '4px' : '0'}; text-decoration: underline; cursor: pointer;">${displayUrl}</div>`;
    
    const textContentHtml = `${labelHtml}${descriptionHtml}${urlHtml}`;
    
    if (preview.image) {
      return `<div style="border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; margin-top: 8px; cursor: pointer; background-color: #ffffff; transition: all 0.2s ease;" onclick="window.open('${preview.url}', '_blank', 'noopener,noreferrer')" onmouseover="this.style.backgroundColor='#f9fafb'; this.style.borderColor='#d1d5db';" onmouseout="this.style.backgroundColor='#ffffff'; this.style.borderColor='#e5e7eb';">
        <div style="display: flex; gap: 6px; align-items: flex-start;">
          ${imageHtml}
          <div style="flex: 1; min-width: 0;">
            ${textContentHtml}
          </div>
        </div>
      </div>`;
    } else if (faviconHtml) {
      return `<div style="border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; margin-top: 8px; cursor: pointer; background-color: #ffffff; transition: all 0.2s ease;" onclick="window.open('${preview.url}', '_blank', 'noopener,noreferrer')" onmouseover="this.style.backgroundColor='#f9fafb'; this.style.borderColor='#d1d5db';" onmouseout="this.style.backgroundColor='#ffffff'; this.style.borderColor='#e5e7eb';">
        <div style="display: flex; align-items: flex-start;">
          ${faviconHtml}
          <div style="flex: 1; min-width: 0;">
            ${textContentHtml}
          </div>
        </div>
      </div>`;
    } else {
      return `<div style="border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; margin-top: 8px; cursor: pointer; background-color: #ffffff; transition: all 0.2s ease;" onclick="window.open('${preview.url}', '_blank', 'noopener,noreferrer')" onmouseover="this.style.backgroundColor='#f9fafb'; this.style.borderColor='#d1d5db';" onmouseout="this.style.backgroundColor='#ffffff'; this.style.borderColor='#e5e7eb';">
        ${textContentHtml}
      </div>`;
    }
  };

  // Helper function to strip data source content from base content
  // This prevents duplication when baseContent already contains previously added data sources
  // Data sources are always appended after the base content, separated by HR tags
  const stripDataSourceContent = (content: string): string => {
    if (!content || !criterion?.data_sources || criterion.data_sources.length === 0) return content;
    
    // Data sources are added with HR separators between them
    // The pattern is: baseContent + '\n\n' + dataSource1 + <hr> + dataSource2 + ...
    // So we can split by HR tags and take only the first part (before any HR)
    const hrPattern = /<hr[^>]*>/gi;
    const parts = content.split(hrPattern);
    
    // If we found HR tags, everything before the first HR is the base content
    if (parts.length > 1) {
      return parts[0].trim();
    }
    
    // If no HR tags, check if content ends with data source patterns
    // Look for patterns that match data source content (e.g., **FieldLabel**<br>value)
    // We'll use a simpler approach: if the last part matches data source patterns, remove it
    let cleaned = content;
    
    // Try to identify data source content at the end by looking for the separator pattern
    // Data sources are added with: baseContent + '\n\n' + dataSection
    // So if we find '\n\n' followed by data source patterns, that's the separator
    const doubleNewlineIndex = cleaned.lastIndexOf('\n\n');
    if (doubleNewlineIndex > 0) {
      const afterDoubleNewline = cleaned.substring(doubleNewlineIndex + 2);
      // Check if the part after '\n\n' looks like data source content
      // Data source content typically starts with **Label** or <strong>Label</strong>
      const dataSourcePattern = /^(<strong>|<b>|\*\*)[^<*]+(<\/strong>|<\/b>|\*\*)/i;
      if (dataSourcePattern.test(afterDoubleNewline.trim())) {
        // This looks like data source content, remove it
        cleaned = cleaned.substring(0, doubleNewlineIndex).trim();
      }
    }
    
    return cleaned;
  };

  // Helper function to build content from data sources
  const buildContentFromDataSources = (
    baseContent: string,
    fetchedDataSourceValues: Record<string, string | { url: string; assetName?: string }>,
    urlPreviews: Record<string, { title?: string; description?: string; image?: string; favicon?: string; domain?: string; url?: string } | null>
  ): string => {
    // Process all data sources in order
    const dataSourceItems: Array<{ content: string; type: string }> = [];
    if (criterion?.data_sources) {
      // aha_fields is structured as { standard_fields: {...}, custom_fields: {...} }
      const ahaFieldsStruct = epic?.aha_fields as any;
      const standardFields = ahaFieldsStruct?.standard_fields || {};
      const customFields = ahaFieldsStruct?.custom_fields || {};
      
      criterion.data_sources.forEach((source, index) => {
        if (source.type === 'aha_field' && source.value) {
          let displayValue: string | null = null;
          
          // Check standard fields first
          if (standardFields[source.value] !== null && standardFields[source.value] !== undefined) {
            const fieldValue = standardFields[source.value];
            displayValue = formatAhaFieldValue(fieldValue);
          } 
          // Then check custom fields
          else if (customFields[source.value] !== null && customFields[source.value] !== undefined) {
            const fieldValue = customFields[source.value];
            displayValue = formatAhaFieldValue(fieldValue);
          }
          
          // Always show the field label, with value or "N/A" on a new line (URLs as clickable links)
          const fieldLabel = getFieldLabel(source.value);
          const valueToShow = displayValue || 'N/A';
          const markdownContent = `**${fieldLabel}**`;
          const htmlContent = convertMarkdownToHTML(markdownContent) + '<br>' + formatValueForHtmlDisplay(valueToShow);
          dataSourceItems.push({ content: htmlContent, type: 'aha_field' });
        } else if (source.type === 'aha_description_part' && source.value) {
          // Parse description HTML table to find keyword and extract second column
          const description = standardFields.description;
          let htmlContent: string | null = null;
          
          // Handle both object format (with body property) and string format
          if (description) {
            if (typeof description === 'string') {
              htmlContent = description;
            } else if (typeof description === 'object' && description !== null && 'body' in description) {
              htmlContent = typeof description.body === 'string' ? description.body : null;
            }
          }
          
          let extractedValue: string | null = null;
          if (htmlContent) {
            extractedValue = parseDescriptionTable(htmlContent, source.value);
          }
          
          // Always show the description part label, with value or "N/A" on a new line (URLs as clickable links)
          const valueToShow = extractedValue || 'N/A';
          const markdownContent = `**${source.value}**`;
          const convertedContent = convertMarkdownToHTML(markdownContent) + '<br>' + formatValueForHtmlDisplay(valueToShow);
          dataSourceItems.push({ content: convertedContent, type: 'aha_description_part' });
        } else if (source.type === 'url') {
          // Get URL value from fetched data source values
          const dataSourceValue = fetchedDataSourceValues[index.toString()];
          const urlValue = getUrlFromDataSourceValue(dataSourceValue);
          const assetName = getAssetNameFromDataSourceValue(dataSourceValue);
          if (urlValue) {
            // Check if we have a preview for this URL
            const preview = urlPreviews[index.toString()];
            // Build preview object with label (from source), description (asset name), and URL
            const previewWithLabelAndDescription = preview 
              ? { ...preview, label: source.label, description: assetName || preview.description }
              : { url: urlValue, label: source.label, description: assetName };
            const previewHtml = generateUrlPreviewHTML(previewWithLabelAndDescription);
            dataSourceItems.push({ content: previewHtml, type: 'url' });
          }
        }
      });
    }

    // Combine base content with data source values
    // Add HTML separators between different data source sections
    let finalContent = baseContent;
    if (dataSourceItems.length > 0) {
      const processedContent: string[] = [];
      
      dataSourceItems.forEach((item, idx) => {
        // Add separator between all data source items
        if (idx > 0) {
          processedContent.push('<hr style="border: none; border-top: 1px solid #e0e0e0; padding-top: 0; margin-top: 8px; margin-bottom: 8px;">');
        }
        
        processedContent.push(item.content);
      });
      
      const dataSection = processedContent.join('\n');
      finalContent = baseContent ? baseContent + '\n\n' + dataSection : dataSection.trim();
    }

    // Process final content through checkbox formatter
    finalContent = formatCheckboxItems(finalContent);

    return finalContent;
  };

  // Helper function to get field label from alias
  const getFieldLabel = (fieldAlias: string): string => {
    // First check if we have it in the fetched aha fields map
    if (ahaFieldsMap[fieldAlias]) {
      return ahaFieldsMap[fieldAlias];
    }
    
    // Fallback to standard field labels
    const standardFieldLabels: Record<string, string> = {
      'id': 'ID',
      'reference_num': 'Reference Number',
      'name': 'Name',
      'url': 'URL',
      'description': 'Description',
      'workflow_status': 'Workflow Status',
      'assigned_to_user': 'Assigned To User',
      'tags': 'Tags',
      'release': 'Release',
    };
    
    if (standardFieldLabels[fieldAlias]) {
      return standardFieldLabels[fieldAlias];
    }
    
    // For custom fields, format the alias to a readable label
    const acronymMap: Record<string, string> = {
      'csm': 'CSM',
      'wsjf': 'WSJF',
      'gtm': 'GTM',
      'ga': 'GA',
      'pm': 'PM',
      'aha': 'Aha',
      'arr': 'ARR',
      'ux': 'UX',
    };
    
    return fieldAlias
      .split('_')
      .map(word => {
        const lowerWord = word.toLowerCase();
        if (acronymMap[lowerWord]) {
          return acronymMap[lowerWord];
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  };

  // Fetch Aha field labels
  useEffect(() => {
    if (opened) {
      fetch('/api/settings/aha-fields', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.fields && Array.isArray(data.fields)) {
            const fieldsMap: Record<string, string> = {};
            data.fields.forEach((field: { alias: string; label: string }) => {
              fieldsMap[field.alias] = field.label;
            });
            setAhaFieldsMap(fieldsMap);
          }
        })
        .catch(err => console.error('Failed to fetch Aha field labels:', err));
    }
  }, [opened]);

  // Helper function to format Aha field values for display
  const formatAhaFieldValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      return value.map(v => formatAhaFieldValue(v)).filter(v => v).join(', ');
    }
    if (typeof value === 'object') {
      // Handle objects like { name: "..." } or { id: "...", name: "..." }
      if (value.name) return value.name;
      if (value.label) return value.label;
      return JSON.stringify(value);
    }
    return String(value);
  };

  // Save data source values (debounced)
  const handleSaveDataSourceValues = async (values: Record<string, string | { url: string; assetName?: string }>) => {
    setSavingDataSourceValues(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ data_source_values: values }),
      });
      if (!res.ok) {
        let errorDetails: any = null;
        try {
          errorDetails = await res.json();
        } catch (e) {
          errorDetails = { error: 'Failed to parse error response' };
        }
        throw new Error(errorDetails?.error || 'Failed to save data source values');
      }
      await res.json();
    } catch (error) {
      console.error('Failed to save data source values:', error);
    } finally {
      setSavingDataSourceValues(false);
    }
  };

  // Save content (debounced)
  const handleSaveContent = async (contentToSave: string) => {
    if (savingContent) return;
    setSavingContent(true);
    try {
      // Only save the base content (user-entered text), not the dynamically generated data sources
      // Data sources are stored separately in data_source_values and rebuilt on load
      const baseContentToSave = baseContentRef.current || contentToSave;
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: baseContentToSave }),
      });
      if (!res.ok) {
        throw new Error('Failed to save content');
      }
    } catch (error) {
      console.error('Failed to save content:', error);
      // Don't alert on every save - user can retry if needed
    } finally {
      setSavingContent(false);
    }
  };

  // Save data source values with debounce (skip during initial load)
  useEffect(() => {
    if (!opened || Object.keys(dataSourceValues).length === 0 || isInitialLoadRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      handleSaveDataSourceValues(dataSourceValues);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [dataSourceValues, opened]);

  const handleUrlDataSourceChange = (dataSourceIndex: number, url: string) => {
    const currentValue = dataSourceValues[dataSourceIndex.toString()];
    const assetName = getAssetNameFromDataSourceValue(currentValue);
    const updatedValue: { url: string; assetName?: string } | string = assetName 
      ? { url, assetName } 
      : url;
    const updatedValues = { ...dataSourceValues, [dataSourceIndex.toString()]: updatedValue };
    setDataSourceValues(updatedValues);
    
    // Clear preview if URL is empty
    if (!url || !url.match(/^https?:\/\/.+/)) {
      setUrlPreviews(prev => {
        const next = { ...prev };
        delete next[dataSourceIndex.toString()];
        return next;
      });
    }
  };

  const handleAssetNameChange = (dataSourceIndex: number, assetName: string) => {
    const currentValue = dataSourceValues[dataSourceIndex.toString()];
    const url = getUrlFromDataSourceValue(currentValue);
    const updatedValue: { url: string; assetName?: string } | string = url && assetName
      ? { url, assetName }
      : url;
    const updatedValues = { ...dataSourceValues, [dataSourceIndex.toString()]: updatedValue };
    setDataSourceValues(updatedValues);
  };

  // Fetch URL previews when data source values change (debounced)
  useEffect(() => {
    if (!criterion?.data_sources) return;
    
    const timers: NodeJS.Timeout[] = [];
    criterion.data_sources.forEach((source, index) => {
      if (source.type === 'url') {
        const dataSourceValue = dataSourceValues[index.toString()];
        const url = getUrlFromDataSourceValue(dataSourceValue);
        if (url && url.match(/^https?:\/\/.+/)) {
          const timer = setTimeout(() => {
            fetchUrlPreview(url, index.toString());
          }, 800);
          timers.push(timer);
        }
      }
    });

    return () => {
      timers.forEach(t => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSourceValues, criterion?.data_sources]);

  // Memoize string representations for stable dependency comparisons
  const urlPreviewsKey = useMemo(() => JSON.stringify(urlPreviews), [urlPreviews]);
  const dataSourceValuesKey = useMemo(() => JSON.stringify(dataSourceValues), [dataSourceValues]);

  // Rebuild content when URL previews or data source values change
  // Add minimum time between syncs to prevent duplicate synchronization
  useEffect(() => {
    if (!opened || contentLoading || Object.keys(dataSourceValues).length === 0 || !baseContentRef.current) return;
    
    const now = Date.now();
    const MIN_TIME_BETWEEN_SYNCS = 2000; // 2 seconds minimum between syncs
    
    // Check if enough time has passed since last rebuild
    if (now - lastContentRebuildRef.current < MIN_TIME_BETWEEN_SYNCS) {
      // Schedule rebuild after the minimum time has elapsed
      const timeSinceLastRebuild = now - lastContentRebuildRef.current;
      const delay = MIN_TIME_BETWEEN_SYNCS - timeSinceLastRebuild;
      const timer = setTimeout(() => {
        const rebuiltContent = buildContentFromDataSources(baseContentRef.current, dataSourceValues, urlPreviews);
        setContent(rebuiltContent);
        lastContentRebuildRef.current = Date.now();
      }, delay);
      return () => clearTimeout(timer);
    }
    
    // Rebuild content with updated previews using stored baseContent
    const rebuiltContent = buildContentFromDataSources(baseContentRef.current, dataSourceValues, urlPreviews);
    setContent(rebuiltContent);
    lastContentRebuildRef.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPreviewsKey, dataSourceValuesKey, opened, contentLoading]);

  // Auto-save content with debounce
  useEffect(() => {
    if (!opened || contentLoading) return;
    const timer = setTimeout(() => {
      handleSaveContent(content);
    }, 1000); // Debounce 1 second

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, opened, contentLoading]);

  // Fetch comments and content on open, and set initial tab
  useEffect(() => {
    if (opened) {
      fetchComments();
      fetchContent();
      setHasAddedComment(false); // Reset when drawer opens
      setActiveTab(initialTab); // Reset to initial tab when drawer opens
      lastContentRebuildRef.current = 0; // Reset sync timer on open
    }
  }, [opened, initialTab]);


  const handleClose = () => {
    // If comment is required and no comments exist yet, prevent closing
    const hasComment = comments.length > 0 || newComment.trim().length > 0 || hasAddedComment;
    if (requireComment && !hasComment) {
      setActiveTab('comments');
      return;
    }

    onClose();
  };

  const hasComment = comments.length > 0 || newComment.trim().length > 0 || hasAddedComment;
  const canClose = !requireComment || hasComment;

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      withCloseButton={false}
      position="right"
      size="xl"
      padding="lg"
      zIndex={5000}
      styles={{
        inner: {
          top: 'var(--nav-height, 64px)',
          height: 'calc(100dvh - var(--nav-height, 64px))',
        },
        overlay: {
          top: 'var(--nav-height, 64px)',
          height: 'calc(100dvh - var(--nav-height, 64px))',
        },
        content: {
          height: 'calc(100dvh - var(--nav-height, 64px))',
          display: 'flex',
          flexDirection: 'column',
        },
        header: {
          padding: 0,
        },
        title: {
          width: '100%',
        },
        body: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        },
      }}
      title={
        <div style={{ width: '100%' }}>
          {requireComment && (
            <div
              style={{
                background: 'var(--mantine-color-red-7)',
                padding: '12px 16px',
                color: 'var(--mantine-color-white)',
              }}
            >
              <Text c="white" fw={800} size="lg" lh={1.15}>
                Comment required
              </Text>
              <Text c="white" fw={700} size="sm" mt={6} lh={1.25}>
                A comment is required for this Go/No-Go score change. Please add a comment before closing.
              </Text>
            </div>
          )}
          <div style={{ padding: '12px 16px' }}>
            <Text fw={600} size="lg">
              {taskLabel}
            </Text>
            {criterion?.data_sources && criterion.data_sources.length > 0 && (
              <Text size="xs" c="dimmed" mt={4} style={{ lineHeight: 1.4 }}>
                Synced from {criterion.data_sources.length} source{criterion.data_sources.length !== 1 ? 's' : ''}:{' '}
                {criterion.data_sources.map((source, index) => {
                  let sourceText = '';
                  if (source.type === 'aha_field') {
                    const fieldLabel = getFieldLabel(source.value);
                    sourceText = `Aha: ${fieldLabel}`;
                  } else if (source.type === 'aha_description_part') {
                    sourceText = `Aha description: ${source.value}`;
                  } else if (source.type === 'url') {
                    const displayLabel = source.label || 'URL';
                    sourceText = displayLabel;
                  } else if (source.type === 'jira_jql') {
                    sourceText = 'Jira tickets';
                  } else if (source.type === 'success_metrics_defined') {
                    sourceText = 'success metrics';
                  }
                  return sourceText;
                }).filter(Boolean).map((text, index, array) => (
                  <span key={index}>
                    {index > 0 && index === array.length - 1 ? ' and ' : index > 0 ? ', ' : ''}
                    {text}
                  </span>
                ))}
              </Text>
            )}
          </div>
        </div>
      }
    >
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || 'content')}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <Tabs.List>
          <Tabs.Tab value="content">Content</Tabs.Tab>
          <Tabs.Tab value="comments">Comments & Attachments</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', paddingTop: '16px' }}>
          {/* Data sources (URL, Jira) - scrollable, limited height so content entry can take the rest */}
          {(criterion?.data_sources && (criterion.data_sources.some(s => s.type === 'url') || criterion.data_sources.some(s => s.type === 'jira_jql'))) && (
            <ScrollArea style={{ flex: '0 1 auto', maxHeight: '40vh', minHeight: 0 }} type="auto">
              <Stack gap="lg" style={{ paddingRight: '16px', paddingBottom: '16px' }}>
              {/* URL Data Sources Section */}
              {criterion?.data_sources && criterion.data_sources.some(s => s.type === 'url') && (
                <div>

                  <Stack gap="sm">
                    {criterion.data_sources.map((source, index) => {
                      if (source.type !== 'url') return null;
                      const dataSourceValue = dataSourceValues[index.toString()];
                      const urlValue = getUrlFromDataSourceValue(dataSourceValue);
                      const assetNameValue = getAssetNameFromDataSourceValue(dataSourceValue);
                      const urlSources = criterion.data_sources!.filter(s => s.type === 'url');
                      const urlIndex = urlSources.indexOf(source) + 1;
                      return (
                        <div key={index}>
                          {source.label && (
                            <Text size="sm" fw={500} mb="xs">
                              {source.label}
                            </Text>
                          )}
                          <TextInput
                            label={`URL ${urlIndex}`}
                            value={urlValue}
                            onChange={(e) => handleUrlDataSourceChange(index, e.target.value)}
                            placeholder="https://figma.com/..., https://docs.google.com/..., etc."
                            type="url"
                          />
                          <TextInput
                            label="Asset name"
                            value={assetNameValue}
                            onChange={(e) => handleAssetNameChange(index, e.target.value)}
                            placeholder="Optional: e.g., Design mockups, Product requirements, etc."
                            mt="xs"
                          />
                          {urlPreviewLoading[index.toString()] && (
                            <Text size="xs" c="dimmed" mt="xs">Loading preview...</Text>
                          )}
                        </div>
                      );
                    })}
                    {savingDataSourceValues && (
                      <Text size="xs" c="dimmed" mt="xs">Saving...</Text>
                    )}
                  </Stack>
                </div>
              )}

              {/* Jira Data Sources Section (read-only, clickable) */}
              {criterion?.data_sources && criterion.data_sources.some(s => s.type === 'jira_jql') && (
                <div>
                  <Stack gap="sm">
                    {criterion.data_sources.map((source, index) => {
                      if (source.type !== 'jira_jql') return null;
                      const jiraUrl = buildJiraIssuesUrlForOpenEpicTickets(source as any);
                      const label = (source.label || '').trim() || 'Open Jira tickets';

                      // Check if Jira URL is saved in database
                      const savedJiraUrl = dataSourceValues[index.toString()];
                      const isUrlSaved = savedJiraUrl && typeof savedJiraUrl === 'string' && savedJiraUrl.trim() !== '';
                      const isUrlSavedObject = savedJiraUrl && typeof savedJiraUrl === 'object' && 'url' in savedJiraUrl && (savedJiraUrl as any).url;
                      const hasSavedUrl = isUrlSaved || isUrlSavedObject;
                      
                      // Determine link source
                      const linkSource = hasSavedUrl ? 'saved' : (jiraUrl ? 'generated' : 'none');
                      const linkSourceText = hasSavedUrl 
                        ? 'Saved in database' 
                        : (jiraUrl ? 'Generated from epic key' : 'Not available');

                      // Show Jira favicon when we have a Jira URL and the source is from Jira (not integrations)
                      const showJiraIcon = jiraUrl && jiraEpicKeySource && (jiraEpicKeySource === 'cached' || jiraEpicKeySource === 'jira_search');
                      const jiraFaviconUrl = jiraDomain 
                        ? `https://${jiraDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/favicon.ico`
                        : 'https://www.atlassian.com/favicon.ico';

                      return (
                        <div key={index}>
                          <TextInput
                            label={label}
                            value={jiraUrl || (jiraEpicKeyLoading ? 'Searching Jira...' : '')}
                            readOnly
                            placeholder={jiraEpicKeyLoading ? 'Searching Jira for epic...' : 'No Jira epic key found'}
                            description={
                              jiraUrl
                                ? undefined
                                : 'No Jira epic key found. Searched Jira API by epic name, then AHA integrations field.'
                            }
                            rightSection={
                              jiraEpicKeyLoading ? (
                                <PurpleLoader size="sm" />
                              ) : showJiraIcon ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}>
                                  <img
                                    src={jiraFaviconUrl}
                                    alt="Jira"
                                    style={{ width: 16, height: 16, objectFit: 'contain' }}
                                    onError={(e) => {
                                      // Fallback to Atlassian favicon if domain favicon fails
                                      (e.target as HTMLImageElement).src = 'https://www.atlassian.com/favicon.ico';
                                    }}
                                  />
                                </div>
                              ) : undefined
                            }
                          />
                          {jiraUrl && hasSavedUrl && (
                            <Group gap="xs" mt={4}>
                              <Badge 
                                size="xs" 
                                color="green"
                                variant="light"
                              >
                                ✓ Saved
                              </Badge>
                              <Text size="xs" c="dimmed">
                                Saved in database
                              </Text>
                            </Group>
                          )}
                          {jiraUrl && (
                            <>
                              {/* Jira Tickets Preview */}
                              {jiraTicketsLoading[index] ? (
                                <Group gap="xs" mt="xs">
                                  <PurpleLoader size="sm" />
                                  <Text size="xs" c="dimmed">Loading tickets...</Text>
                                </Group>
                              ) : jiraTickets[index] && jiraTickets[index].length > 0 ? (
                                <Card withBorder mt="xs" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
                                  <Text size="xs" fw={500} mb="xs">
                                    Found {jiraTickets[index].length} ticket{jiraTickets[index].length !== 1 ? 's' : ''}:
                                  </Text>
                                  <Stack gap="xs">
                                    {jiraTickets[index].slice(0, 10).map((ticket) => {
                                      const ticketUrl = ticket.url || (jiraDomain 
                                        ? `https://${jiraDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/browse/${ticket.key}`
                                        : null);
                                      
                                      const statusColor = ticket.statusCategory === 'Done' 
                                        ? 'green' 
                                        : ticket.statusCategory === 'In Progress' 
                                        ? 'blue' 
                                        : 'gray';
                                      
                                      return (
                                        <Group key={ticket.key} justify="space-between" gap="xs" wrap="nowrap">
                                          <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                                            {ticketUrl ? (
                                              <Text
                                                component="a"
                                                href={ticketUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                size="xs"
                                                fw={500}
                                                c="blue"
                                                style={{ textDecoration: 'none' }}
                                                truncate
                                              >
                                                {ticket.key}
                                              </Text>
                                            ) : (
                                              <Text size="xs" fw={500} truncate>
                                                {ticket.key}
                                              </Text>
                                            )}
                                            <Badge size="xs" color={statusColor} variant="light">
                                              {ticket.status}
                                            </Badge>
                                          </Group>
                                          <Text size="xs" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }}>
                                            {ticket.summary}
                                          </Text>
                                        </Group>
                                      );
                                    })}
                                    {jiraTickets[index].length > 10 && (
                                      <Text size="xs" c="dimmed" mt="xs">
                                        ... and {jiraTickets[index].length - 10} more
                                      </Text>
                                    )}
                                  </Stack>
                                </Card>
                              ) : jiraTickets[index] && jiraTickets[index].length === 0 ? (
                                <Text size="sm" fw={600} mt="xs" ta="center">
                                  🎉 No open tickets left - great job completing and cleaning the epic!  
                                </Text>
                              ) : null}
                              
                              <Group justify="flex-end" mt="xs">
                                <Button
                                  component="a"
                                  href={jiraUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  variant="light"
                                  size="xs"
                                >
                                  Open in Jira
                                </Button>
                              </Group>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </Stack>
                </div>
              )}
              </Stack>
            </ScrollArea>
          )}
          {/* Criterion content - takes remaining height */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingRight: '16px', paddingTop: '16px' }}>
            {contentLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <PurpleLoader size="sm" />
              </div>
            ) : (
              <RichText
                value={content}
                onChange={(newContent) => {
                  setContent(newContent);
                  baseContentRef.current = newContent;
                }}
                placeholder="Add relevant content, links, and notes for this criterion..."
                rows={12}
                compactLists={true}
                readOnly={false}
                fillHeight
              />
            )}
            {!contentLoading && (!criterion?.data_sources || criterion.data_sources.length === 0) && (
              <Text size="xs" c="dimmed" mt="xs" style={{ marginTop: '8px' }}>
                No automated synchronization from Aha or other sources was defined for this criteria.
              </Text>
            )}
            {savingContent && (
              <Text size="xs" c="dimmed" mt="xs">Saving...</Text>
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="comments" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', paddingTop: '16px' }}>
          <Stack gap="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Comments List */}
            <ScrollArea 
              style={{ flex: 1, minHeight: 0 }} 
              type="auto"
              styles={{
                scrollbar: { display: 'none' },
                thumb: { display: 'none' },
              }}
            >
              {loading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <PurpleLoader size="sm" />
                </div>
              ) : comments.length === 0 ? (
                <Text size="sm" c="dimmed" style={{ padding: '12px 4px' }}>
                  No comments yet.
                </Text>
              ) : (
                <Stack gap="xs">
                  {comments.map((comment) => {
                    const isOptimistic = comment.id.startsWith('temp-');
                    return (
                    <div
                      key={comment.id}
                      style={{
                        padding: '8px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '6px',
                        backgroundColor: '#fafafa',
                        opacity: isOptimistic ? 0.7 : 1,
                      }}
                    >
                      <Group justify="space-between" gap="xs" mb={4}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                          {/* Go/No-Go score indicator dots showing before → after */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            {/* Show previous Go/No-Go score dot (before) */}
                            {comment.previous_status && getStatusColor(comment.previous_status) && (
                              <div
                                style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  backgroundColor: getStatusColor(comment.previous_status)!,
                                }}
                                title={`Previous Go/No-Go score: ${getStatusLabel(comment.previous_status)}`}
                              />
                            )}
                            {/* Show arrow if there's a Go/No-Go score change */}
                            {comment.previous_status && comment.status_at_comment && comment.previous_status !== comment.status_at_comment && (
                              <>
                                <span style={{ fontSize: '12px', color: '#6b7280' }}>→</span>
                                {/* Show new Go/No-Go score dot (after) */}
                                {getStatusColor(comment.status_at_comment) && (
                                  <div
                                    style={{
                                      width: '10px',
                                      height: '10px',
                                      borderRadius: '50%',
                                      backgroundColor: getStatusColor(comment.status_at_comment)!,
                                    }}
                                    title={`New Go/No-Go score: ${getStatusLabel(comment.status_at_comment)}`}
                                  />
                                )}
                              </>
                            )}
                            {/* If no previous Go/No-Go score but there's a status_at_comment, just show the new Go/No-Go score */}
                            {!comment.previous_status && comment.status_at_comment && getStatusColor(comment.status_at_comment) && (
                              <div
                                style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  backgroundColor: getStatusColor(comment.status_at_comment)!,
                                }}
                                title={`Status: ${getStatusLabel(comment.status_at_comment)}`}
                              />
                            )}
                          </div>
                          <div>
                            <Group gap="xs" align="center">
                              <Text size="xs" fw={600}>
                                {getUserDisplay(comment)}
                              </Text>
                              {isOptimistic && (
                                <Badge size="xs" variant="light" color="blue">
                                  Saving...
                                </Badge>
                              )}
                            </Group>
                            <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                              {formatTimestamp(comment.created_at)}
                            </Text>
                          </div>
                        </div>
                        {comment.created_by?.email === currentUserEmail && !isOptimistic && (
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={() => handleDeleteComment(comment.id)}
                            title="Delete comment"
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        )}
                      </Group>
                      <div 
                        className="text-xs text-gray-700 [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-1 [&_p]:mb-1 [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800"
                        dangerouslySetInnerHTML={{ __html: comment.comment_text }}
                        style={{
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          lineHeight: 1.4,
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
                    );
                  })}
                </Stack>
              )}
            </ScrollArea>

            {/* New Comment Input - Always visible at bottom */}
            <div
              style={{
                flexShrink: 0,
                position: 'sticky',
                bottom: 0,
                zIndex: 1,
                marginTop: 'auto',
                paddingTop: '16px',
                paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
                paddingLeft: '4px',
                paddingRight: '4px',
                borderTop: '1px solid #e0e0e0',
                background: 'var(--mantine-color-body)',
              }}
            >
              <div style={{ position: 'relative', padding: '2px' }}>
                <RichText
                  ref={richTextRef}
                  key={`comment-input-${activeTab}`}
                  value={newComment}
                  onChange={setNewComment}
                  placeholder="Type your comment here... Use @ to mention someone."
                  rows={6}
                  autoFocus={activeTab === 'comments'}
                  onMentionTrigger={handleMentionTrigger}
                />
                {mentionDropdownOpen && (
                  <div style={{ position: 'absolute', left: 4, right: 4, top: '100%', marginTop: 4, zIndex: 20, background: 'var(--mantine-color-body)', border: '1px solid var(--mantine-color-default-border)', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 220, overflow: 'auto' }}>
                    {mentionUsersLoading ? (
                      <Text size="sm" c="dimmed" p="xs">Loading...</Text>
                    ) : mentionFiltered.length === 0 ? (
                      <Text size="sm" c="dimmed" p="xs">No users found</Text>
                    ) : (
                      mentionFiltered.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            richTextRef.current?.insertMention({ id: user.id, name: user.name });
                            setMentionDropdownOpen(false);
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14 }}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <Text size="sm" fw={500}>{user.name}</Text>
                          {user.email && <Text size="xs" c="dimmed">{user.email}</Text>}
                        </button>
                      ))
                    )}
                  </div>
                )}
                {/* Post button and No comment button inside text box at bottom right */}
                <div style={{ position: 'absolute', bottom: '8px', right: '8px', zIndex: 10, display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {requireComment && onSkipComment && (
                    <Button
                      onClick={async () => {
                        if (onSkipComment && !skippingComment) {
                          setSkippingComment(true);
                          try {
                            await onSkipComment();
                          } catch (error) {
                            console.error('Failed to skip comment:', error);
                          } finally {
                            setSkippingComment(false);
                          }
                        }
                      }}
                      disabled={submitting || uploadingFiles || skippingComment}
                      loading={skippingComment}
                      size="xs"
                      variant="outline"
                      color="gray"
                    >
                      No comment
                    </Button>
                  )}
                  <Button
                    leftSection={<IconSend size={14} />}
                    onClick={handleSubmitComment}
                    loading={submitting || uploadingFiles}
                    disabled={(!newComment.replace(/<[^>]*>/g, '').trim() && selectedFiles.length === 0) || submitting || uploadingFiles}
                    size="xs"
                  >
                    {uploadingFiles ? 'Uploading...' : 'Post'}
                  </Button>
                </div>
              </div>
              
              {/* Selected files (queued for upload on Post) */}
              {selectedFiles.length > 0 && (
                <div className="mt-2">
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
                </div>
              )}
              
              <Group justify="space-between" align="center" mt="sm">
                <Group gap="sm" align="center">
                  {requireComment && onCancel && (
                    <Button
                      variant="outline"
                      color="red"
                      size="sm"
                      onClick={() => {
                        if (onCancel) {
                          onCancel();
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </Group>

                <Group gap="sm" align="center">
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
                        size="sm"
                        variant="outline"
                        leftSection={<IconPaperclip size={14} />}
                        disabled={submitting}
                      >
                        Attach File
                      </Button>
                    )}
                  </FileButton>
                </Group>
              </Group>
            </div>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  );
}






