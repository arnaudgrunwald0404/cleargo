"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { Drawer, Button, Group, Text, Stack, ActionIcon, ScrollArea, FileButton, Badge, Card, Image, TextInput, Tabs } from '@mantine/core';
import { PurpleLoader } from './PurpleLoader';
import { IconTrash, IconSend, IconPaperclip, IconX, IconPencil } from '@tabler/icons-react';
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
  criterion?: { data_sources?: Array<{ type: string; value: string; label?: string }> | null };
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
  const [dataSourceValues, setDataSourceValues] = useState<Record<string, string | { url: string; assetName?: string }>>({});
  const [urlPreviews, setUrlPreviews] = useState<Record<string, { title?: string; description?: string; image?: string; favicon?: string; domain?: string; url?: string } | null>>({});
  const [urlPreviewLoading, setUrlPreviewLoading] = useState<Record<string, boolean>>({});
  const [savingDataSourceValues, setSavingDataSourceValues] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [isContentEditMode, setIsContentEditMode] = useState(false);
  const baseContentRef = useRef<string>('');
  const isInitialLoadRef = useRef<boolean>(false);
  
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
      const res = await fetch(`/api/url-preview?url=${encodeURIComponent(url)}`);
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
      ? `<img src="${preview.favicon}" alt="" style="width: 48px; height: 48px; flex-shrink: 0; object-fit: contain;" onerror="this.style.display='none'" />`
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
        <div style="display: flex; gap: 12px; align-items: flex-start;">
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
          // Check standard fields first
          if (standardFields[source.value] !== null && standardFields[source.value] !== undefined) {
            const fieldValue = standardFields[source.value];
            const displayValue = formatAhaFieldValue(fieldValue);
            if (displayValue) {
              const markdownContent = `**${source.value}**: ${displayValue}`;
              const htmlContent = convertMarkdownToHTML(markdownContent);
              dataSourceItems.push({ content: htmlContent, type: 'aha_field' });
            }
          } 
          // Then check custom fields
          else if (customFields[source.value] !== null && customFields[source.value] !== undefined) {
            const fieldValue = customFields[source.value];
            const displayValue = formatAhaFieldValue(fieldValue);
            if (displayValue) {
              const markdownContent = `**${source.value}**: ${displayValue}`;
              const htmlContent = convertMarkdownToHTML(markdownContent);
              dataSourceItems.push({ content: htmlContent, type: 'aha_field' });
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
              const markdownContent = `**${source.value}**: ${extractedValue}`;
              const convertedContent = convertMarkdownToHTML(markdownContent);
              dataSourceItems.push({ content: convertedContent, type: 'aha_description_part' });
            }
          }
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
          processedContent.push('<hr style="border: none; border-top: 1px solid #e0e0e0; padding-top: 0px;margin-top: 20px;">');
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
  useEffect(() => {
    if (!opened || contentLoading || Object.keys(dataSourceValues).length === 0 || !baseContentRef.current) return;
    
    // Rebuild content with updated previews using stored baseContent
    const rebuiltContent = buildContentFromDataSources(baseContentRef.current, dataSourceValues, urlPreviews);
    setContent(rebuiltContent);
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
      setIsContentEditMode(false); // Reset edit mode when drawer opens
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

            {/* Criterion Content Section - Takes available space */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              {!contentLoading && !isContentEditMode && (
                <Group justify="flex-end" mb="xs">
                  <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<IconPencil size={14} />}
                    onClick={() => setIsContentEditMode(true)}
                  >
                    Edit
                  </Button>
                </Group>
              )}
              {contentLoading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <PurpleLoader size="sm" />
                </div>
              ) : (
                <ScrollArea 
                  style={{ flex: 1, minHeight: 0 }}
                  styles={{
                    scrollbar: { display: 'none' },
                    thumb: { display: 'none' },
                    viewport: { paddingBottom: 0 },
                  }}
                >
                  <div style={{ paddingBottom: 0, marginBottom: 0 }}>
                    <RichText
                      value={content}
                      onChange={(newContent) => {
                        setContent(newContent);
                        // Update baseContentRef when user edits
                        // Note: This assumes the user is only editing the base content part,
                        // not the data sources section (which should be read-only/non-editable)
                        // Data sources are dynamically generated and appended, so they shouldn't be in the editable area
                        if (isContentEditMode) {
                          baseContentRef.current = newContent;
                        }
                      }}
                      placeholder="Add relevant content, links, and notes for this criterion..."
                      rows={12}
                      compactLists={true}
                      readOnly={!isContentEditMode}
                    />
                  </div>
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






