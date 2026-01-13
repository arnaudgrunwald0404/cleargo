"use client";

import { useState, useEffect } from 'react';
import { Drawer, Button, Group, Text, Stack, ActionIcon, ScrollArea, FileButton, Badge, Card, Image, TextInput, Tabs } from '@mantine/core';
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
  criterion?: { data_sources?: Array<{ type: string; value: string }> | null };
  epic?: { aha_fields?: Record<string, any> | null } | null;
  initialTab?: 'content' | 'comments'; // Which tab to open initially (default: 'content')
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
  criterion,
  epic,
  initialTab = 'content',
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
  const [dataSourceValues, setDataSourceValues] = useState<Record<string, string>>({});
  const [urlPreviews, setUrlPreviews] = useState<Record<string, { title?: string; description?: string; image?: string; domain?: string; url?: string } | null>>({});
  const [urlPreviewLoading, setUrlPreviewLoading] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  
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
        setComments(commentsWithAttachments);
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
      await fetchComments(); // This will also fetch attachments
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

  // Fetch URL preview
  const fetchUrlPreview = async (url: string, dataSourceIndex: string) => {
    if (!url || !url.match(/^https?:\/\/.+/)) {
      setUrlPreviews(prev => ({ ...prev, [dataSourceIndex]: null }));
      return;
    }

    setUrlPreviewLoading(prev => ({ ...prev, [dataSourceIndex]: true }));
    try {
      const res = await fetch(`/api/url-preview?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        setUrlPreviews(prev => ({ ...prev, [dataSourceIndex]: data }));
      } else {
        setUrlPreviews(prev => ({ ...prev, [dataSourceIndex]: null }));
      }
    } catch (error) {
      console.error('Failed to fetch URL preview:', error);
      setUrlPreviews(prev => ({ ...prev, [dataSourceIndex]: null }));
    } finally {
      setUrlPreviewLoading(prev => ({ ...prev, [dataSourceIndex]: false }));
    }
  };

  // Fetch content when drawer opens
  const fetchContent = async () => {
    setContentLoading(true);
    try {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      const { data, error } = await supabase
        .from('epic_criterion_status')
        .select('current_status_notes, data_source_values')
        .eq('id', taskId)
        .single();
      
      let baseContent = '';
      if (!error && data) {
        baseContent = data.current_status_notes || '';
        // Load data source values
        if (data.data_source_values) {
          setDataSourceValues(data.data_source_values);
          // Fetch URL previews for any URL data sources
          if (criterion?.data_sources) {
            criterion.data_sources.forEach((source, index) => {
              if (source.type === 'url' && data.data_source_values[index.toString()]) {
                fetchUrlPreview(data.data_source_values[index.toString()], index.toString());
              }
            });
          }
        }
      }

      // Append Aha field values if criterion has data_sources
      const ahaFieldValues: string[] = [];
      if (criterion?.data_sources && epic?.aha_fields) {
        // aha_fields is structured as { standard_fields: {...}, custom_fields: {...} }
        const ahaFieldsStruct = epic.aha_fields as any;
        const standardFields = ahaFieldsStruct?.standard_fields || {};
        const customFields = ahaFieldsStruct?.custom_fields || {};
        
        criterion.data_sources.forEach((source) => {
          if (source.type === 'aha_field' && source.value) {
            // Check standard fields first
            if (standardFields[source.value] !== null && standardFields[source.value] !== undefined) {
              const fieldValue = standardFields[source.value];
              const displayValue = formatAhaFieldValue(fieldValue);
              if (displayValue) {
                ahaFieldValues.push(`**${source.value}**: ${displayValue}`);
              }
            } 
            // Then check custom fields
            else if (customFields[source.value] !== null && customFields[source.value] !== undefined) {
              const fieldValue = customFields[source.value];
              const displayValue = formatAhaFieldValue(fieldValue);
              if (displayValue) {
                ahaFieldValues.push(`**${source.value}**: ${displayValue}`);
              }
            }
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
            
            if (htmlContent) {
              const extractedValue = parseDescriptionTable(htmlContent, source.value);
              if (extractedValue) {
                ahaFieldValues.push(`**${source.value}**: ${extractedValue}`);
              }
            }
          }
        });
      }

      // Combine base content with Aha field values
      let finalContent = baseContent;
      if (ahaFieldValues.length > 0) {
        const ahaSection = `\n\n${ahaFieldValues.join('\n')}`;
        finalContent = baseContent ? baseContent + ahaSection : ahaSection.trim();
      }

      setContent(finalContent);
    } catch (error) {
      console.error('Failed to fetch content:', error);
    } finally {
      setContentLoading(false);
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
  const handleSaveDataSourceValues = async (values: Record<string, string>) => {
    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ data_source_values: values }),
      });
      if (!res.ok) {
        throw new Error('Failed to save data source values');
      }
    } catch (error) {
      console.error('Failed to save data source values:', error);
    }
  };

  // Save content (debounced)
  const handleSaveContent = async (contentToSave: string) => {
    if (savingContent) return;
    setSavingContent(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: contentToSave }),
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

  // Save data source values with debounce
  useEffect(() => {
    if (!opened || Object.keys(dataSourceValues).length === 0) return;
    const timer = setTimeout(() => {
      handleSaveDataSourceValues(dataSourceValues);
    }, 1000);
    return () => clearTimeout(timer);
  }, [dataSourceValues, opened]);

  const handleUrlDataSourceChange = (dataSourceIndex: number, url: string) => {
    const updatedValues = { ...dataSourceValues, [dataSourceIndex.toString()]: url };
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

  // Fetch URL previews when data source values change (debounced)
  useEffect(() => {
    if (!criterion?.data_sources) return;
    
    const timers: NodeJS.Timeout[] = [];
    criterion.data_sources.forEach((source, index) => {
      if (source.type === 'url') {
        const url = dataSourceValues[index.toString()];
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
    }
  }, [opened, initialTab]);

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
    <Drawer
      opened={opened}
      onClose={handleClose}
      position="right"
      size="xl"
      padding="lg"
      title={
        <div>
          <Text fw={600} size="lg">{taskLabel}</Text>
          {requireComment && !hasComment && (
            <Text size="xs" c="red" mt={4}>
              A comment is required for CONDITIONAL or NO_GO ratings. Please add a comment before closing.
            </Text>
          )}
        </div>
      }
    >
      <Text size="lg" fw={600} mb="md">{taskLabel}</Text>
      
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'content')} style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
        <Tabs.List>
          <Tabs.Tab value="content">Content</Tabs.Tab>
          <Tabs.Tab value="comments">Comments & Attachments</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', paddingTop: '16px' }}>
          <Stack gap="lg" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* URL Data Sources Section */}
            {criterion?.data_sources && criterion.data_sources.some(s => s.type === 'url') && (
              <div>
                <Text size="sm" fw={600} mb="xs">Data Sources</Text>
                <Stack gap="sm">
                  {criterion.data_sources.map((source, index) => {
                    if (source.type !== 'url') return null;
                    const urlValue = dataSourceValues[index.toString()] || '';
                    const urlSources = criterion.data_sources!.filter(s => s.type === 'url');
                    const urlIndex = urlSources.indexOf(source) + 1;
                    return (
                      <div key={index}>
                        <TextInput
                          label={`URL ${urlIndex}`}
                          value={urlValue}
                          onChange={(e) => handleUrlDataSourceChange(index, e.target.value)}
                          placeholder="https://figma.com/..., https://docs.google.com/..., etc."
                          type="url"
                        />
                        {urlPreviewLoading[index.toString()] && (
                          <Text size="xs" c="dimmed" mt="xs">Loading preview...</Text>
                        )}
                        {!urlPreviewLoading[index.toString()] && urlPreviews[index.toString()] && (() => {
                          const preview = urlPreviews[index.toString()];
                          if (!preview) return null;
                          return (
                            <Card
                              withBorder
                              padding="sm"
                              radius="md"
                              mt="sm"
                              style={{ cursor: 'pointer' }}
                              onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
                            >
                              <Group gap="sm" align="flex-start">
                                {preview.image && (
                                  <div style={{ width: 60, height: 60, flexShrink: 0, overflow: 'hidden', borderRadius: '4px' }}>
                                    <Image
                                      src={preview.image}
                                      alt={preview.title || 'Preview'}
                                      width="100%"
                                      height="100%"
                                      fit="cover"
                                      style={{ display: 'block' }}
                                    />
                                  </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  {preview.title && (
                                    <Text size="sm" fw={500} lineClamp={2} mb={4}>
                                      {preview.title}
                                    </Text>
                                  )}
                                  {preview.description && (
                                    <Text size="xs" c="dimmed" lineClamp={2} mb={4}>
                                      {preview.description}
                                    </Text>
                                  )}
                                  {preview.domain && (
                                    <Text size="xs" c="dimmed" style={{ textTransform: 'uppercase' }}>
                                      {preview.domain}
                                    </Text>
                                  )}
                                </div>
                              </Group>
                            </Card>
                          );
                        })()}
                      </div>
                    );
                  })}
                </Stack>
              </div>
            )}

            {/* Criterion Content Section - Takes available space */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              {contentLoading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <PurpleLoader size="sm" />
                </div>
              ) : (
                <ScrollArea style={{ flex: 1, minHeight: 0 }}>
                  <RichText
                    value={content}
                    onChange={setContent}
                    placeholder="Add relevant content, links, and notes for this criterion..."
                    rows={12}
                    compactLists={true}
                  />
                </ScrollArea>
              )}
              {savingContent && (
                <Text size="xs" c="dimmed" mt="xs">Saving...</Text>
              )}
            </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="comments" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', paddingTop: '16px' }}>
          <Stack gap="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Comments List */}
            {(comments.length > 0 || standaloneAttachments.length > 0) && (
              <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <PurpleLoader size="sm" />
                  </div>
                ) : (
                  <Stack gap="xs">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        style={{
                          padding: '8px',
                          border: '1px solid #e0e0e0',
                          borderRadius: '6px',
                          backgroundColor: '#fafafa',
                        }}
                      >
                        <Group justify="space-between" gap="xs" mb={4}>
                          <div>
                            <Text size="xs" fw={600}>
                              {getUserDisplay(comment)}
                            </Text>
                            <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
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
                    ))}
                  </Stack>
                )}
              </ScrollArea>
            )}

            {/* New Comment Input - Always visible at bottom */}
            <div style={{ flexShrink: 0, marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #e0e0e0' }}>
              <div style={{ position: 'relative' }}>
                <RichText
                  value={newComment}
                  onChange={setNewComment}
                  placeholder="Type your comment here..."
                  rows={2}
                />
                {/* Post button inside text box at bottom right */}
                <div style={{ position: 'absolute', bottom: '8px', right: '8px', zIndex: 10 }}>
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
              
              <Group justify="flex-start" mt="sm">
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
            </div>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  );
}






