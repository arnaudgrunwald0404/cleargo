"use client";

import { useState } from 'react';
import { Modal, Button, Group, Text, Stack, FileButton, List, ActionIcon, Loader } from '@mantine/core';
import { IconPaperclip, IconTrash, IconDownload, IconFile } from '@tabler/icons-react';

interface FileAttachment {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  uploaded_at: string;
  uploaded_by?: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

interface FileAttachmentModalProps {
  opened: boolean;
  onClose: () => void;
  epicId: string;
  taskId: string; // launch_criterion_status id
  taskLabel: string;
  onAttachmentAdded?: () => void; // Callback when attachment is added (for refresh)
}

export function FileAttachmentModal({
  opened,
  onClose,
  epicId,
  taskId,
  taskLabel,
  onAttachmentAdded,
}: FileAttachmentModalProps) {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Fetch attachments when modal opens
  const fetchAttachments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}/attachments`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setAttachments(data);
      }
    } catch (error) {
      console.error('Failed to fetch attachments:', error);
    } finally {
      setLoading(false);
    }
  };

  // Upload file
  const handleFileUpload = async (file: File | null) => {
    if (!file) return;

    // Check file size (max 50MB)
    if (file.size > 52428800) {
      alert('File size must be less than 50MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}/attachments`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to upload file');
      }

      // Refresh attachments list
      await fetchAttachments();
      
      // Notify parent to refresh counts
      if (onAttachmentAdded) {
        onAttachmentAdded();
      }
    } catch (error: any) {
      alert(`Failed to upload file: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Download file
  const handleDownload = async (attachmentId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}/attachments/${attachmentId}`, {
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to download file');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      alert(`Failed to download file: ${error.message}`);
    }
  };

  // Delete file
  const handleDelete = async (attachmentId: string) => {
    if (!confirm('Are you sure you want to delete this attachment?')) return;

    try {
      const res = await fetch(`/api/epics/${epicId}/criteria/${taskId}/attachments/${attachmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete file');
      }

      // Refresh attachments list
      await fetchAttachments();
      
      // Notify parent to refresh counts
      if (onAttachmentAdded) {
        onAttachmentAdded();
      }
    } catch (error: any) {
      alert(`Failed to delete file: ${error.message}`);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Fetch attachments on open
  if (opened && attachments.length === 0 && !loading) {
    fetchAttachments();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <div>
          <Text fw={600} size="lg">File Attachments</Text>
          <Text size="sm" c="dimmed">{taskLabel}</Text>
        </div>
      }
      size="md"
    >
      <Stack gap="md">
        <FileButton onChange={handleFileUpload} accept="*">
          {(props) => (
            <Button
              {...props}
              leftSection={<IconPaperclip size={16} />}
              loading={uploading}
              disabled={uploading}
            >
              Upload File
            </Button>
          )}
        </FileButton>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Loader size="sm" />
          </div>
        ) : attachments.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" p="md">
            No attachments yet
          </Text>
        ) : (
          <List spacing="sm">
            {attachments.map((attachment) => (
              <List.Item
                key={attachment.id}
                icon={<IconFile size={16} />}
                style={{
                  padding: '8px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {attachment.file_name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatFileSize(attachment.file_size)} • {new Date(attachment.uploaded_at).toLocaleDateString()}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <ActionIcon
                      variant="subtle"
                      color="blue"
                      onClick={() => handleDownload(attachment.id, attachment.file_name)}
                      title="Download"
                    >
                      <IconDownload size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => handleDelete(attachment.id)}
                      title="Delete"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              </List.Item>
            ))}
          </List>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}






