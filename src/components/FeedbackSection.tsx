"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button, Textarea, Group, Text, ActionIcon, Select, Badge } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PurpleLoader } from './PurpleLoader';
import { IconTrash, IconSend, IconPencil } from '@tabler/icons-react';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';

interface FeedbackItem {
  id: string;
  feedback_text: string;
  feedback_type?: 'EPIC' | 'PROCESS' | 'TOOL' | string;
  created_at: string;
  status?: string;
  status_updated_at?: string | null;
  epic?: { id: string; name: string } | { id: string; name: string }[] | null;
  created_by?: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

const FEEDBACK_STATUS_OPTIONS = [
  { value: 'unread', label: 'Unread' },
  { value: 'received', label: 'Received' },
  { value: 'need_more_info', label: 'Need More Info' },
  { value: 'considering', label: 'Considering' },
  { value: 'in_progress', label: 'Go ;)' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_go', label: 'No Go ;(' },
];

function feedbackStatusLabel(status: string | undefined): string {
  if (!status) return 'Unread';
  const opt = FEEDBACK_STATUS_OPTIONS.find((o) => o.value === status);
  return opt?.label ?? status;
}

interface FeedbackSectionProps {
  epicId?: string;
  currentUserEmail: string;
  isSuperAdmin?: boolean;
}

export function FeedbackSection({ epicId, currentUserEmail, isSuperAdmin = false }: FeedbackSectionProps) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newFeedback, setNewFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState<'EPIC' | 'PROCESS' | 'TOOL'>(epicId ? 'EPIC' : 'TOOL');
  const [epicOptionsLoading, setEpicOptionsLoading] = useState(false);
  const [epicOptions, setEpicOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedEpicId, setSelectedEpicId] = useState<string | null>(epicId || null);
  const [submitting, setSubmitting] = useState(false);
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    // Debounce rapid successive calls (min 500ms between requests)
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchRef.current;
    
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    if (timeSinceLastFetch < 500) {
      fetchTimeoutRef.current = setTimeout(() => {
        fetchFeedbacks();
      }, 500 - timeSinceLastFetch);
    } else {
      fetchFeedbacks();
    }
    
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [epicId]);

  const getEndpointBase = () => {
    return epicId ? `/api/epics/${epicId}/feedback` : `/api/feedback`;
  };

  useEffect(() => {
    // When used on a specific epic, lock behavior to that epic + EPIC type.
    if (epicId) {
      setFeedbackType('EPIC');
      setSelectedEpicId(epicId);
    }
  }, [epicId]);

  useEffect(() => {
    // Only needed for the global feedback form when user wants to tag feedback to an epic.
    if (epicId) return;
    if (feedbackType !== 'EPIC') return;
    if (epicOptions.length > 0) return;

    const loadEpics = async () => {
      setEpicOptionsLoading(true);
      try {
        const res = await fetchWithRateLimit('/api/epics', { credentials: 'include', maxRetries: 1 });
        if (res.ok) {
          const data = await res.json();
          const options =
            Array.isArray(data)
              ? data
                  .filter((e: any) => e && typeof e.id === 'string' && typeof e.name === 'string')
                  .map((e: any) => ({ value: e.id, label: e.name }))
                  .sort((a: any, b: any) => a.label.localeCompare(b.label))
              : [];
          setEpicOptions(options);
        }
      } catch (e) {
        console.warn('Failed to load epics for feedback:', e);
      } finally {
        setEpicOptionsLoading(false);
      }
    };

    loadEpics();
  }, [epicId, feedbackType, epicOptions.length]);

  const fetchFeedbacks = async () => {
    lastFetchRef.current = Date.now();
    setLoading(true);
    try {
      const res = await fetchWithRateLimit(getEndpointBase(), {
        maxRetries: 1,
      });
      if (res.ok) {
        const data = await res.json();
        setFeedbacks(data);
      }
    } catch (error) {
      console.error('Failed to fetch feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  const resolvedEpicName = (feedback: FeedbackItem): string | null => {
    const epicVal: any = (feedback as any).epic;
    if (!epicVal) return null;
    const candidate = Array.isArray(epicVal) ? epicVal[0] : epicVal;
    if (!candidate || typeof candidate !== 'object') return null;
    if (typeof candidate.name === 'string' && candidate.name.trim()) return candidate.name.trim();
    return null;
  };

  const feedbackTypeLabel = (type?: string): string => {
    const t = (type || '').toUpperCase();
    if (t === 'EPIC') return 'Epic';
    if (t === 'PROCESS') return 'Process';
    if (t === 'TOOL') return 'Tool';
    return 'Feedback';
  };

  const feedbackTypeColor = (type?: string) => {
    const t = (type || '').toUpperCase();
    if (t === 'EPIC') return 'blue';
    if (t === 'PROCESS') return 'teal';
    if (t === 'TOOL') return 'grape';
    return 'gray';
  };

  const handleSubmitFeedback = async () => {
    if (!newFeedback.trim()) return;

    setSubmitting(true);
    try {
      const payload: any = { feedback_text: newFeedback.trim() };
      if (!epicId) {
        payload.feedback_type = feedbackType;
        if (feedbackType === 'EPIC' && selectedEpicId) {
          payload.epic_id = selectedEpicId;
        }
      }

      const res = await fetch(getEndpointBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to post feedback');
      }

      setNewFeedback('');
      if (!epicId && feedbackType !== 'EPIC') {
        setSelectedEpicId(null);
      }
      await fetchFeedbacks();
    } catch (error: any) {
      alert(`Failed to post feedback: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFeedback = async (feedbackId: string) => {
    if (!confirm('Are you sure you want to delete this feedback?')) return;

    try {
      const base = epicId ? `/api/epics/${epicId}/feedback` : `/api/feedback`;
      const res = await fetch(`${base}/${feedbackId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete feedback');
      }

      await fetchFeedbacks();
    } catch (error: any) {
      alert(`Failed to delete feedback: ${error.message}`);
    }
  };

  const handleStartEdit = (feedback: FeedbackItem) => {
    setEditingFeedbackId(feedback.id);
    setEditingText(feedback.feedback_text);
  };

  const handleCancelEdit = () => {
    setEditingFeedbackId(null);
    setEditingText('');
  };

  const handleSaveEdit = async () => {
    if (!editingFeedbackId || !editingText.trim()) return;

    setSavingEdit(true);
    try {
      const base = epicId ? `/api/epics/${epicId}/feedback` : `/api/feedback`;
      const res = await fetch(`${base}/${editingFeedbackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ feedback_text: editingText.trim() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update feedback');
      }

      setEditingFeedbackId(null);
      setEditingText('');
      await fetchFeedbacks();
    } catch (error: any) {
      alert(`Failed to update feedback: ${error.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStatusChange = async (feedbackId: string, newStatus: string) => {
    setUpdatingStatusId(feedbackId);
    try {
      const res = await fetch(`/api/feedback/${feedbackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update status');
      }
      const data = await res.json();
      await fetchFeedbacks();
      if (data.slack_notification_sent) {
        notifications.show({
          title: 'Slack notification sent',
          message: 'The feedback author has been notified via Slack.',
          color: 'green',
        });
      }
    } catch (error: any) {
      alert(`Failed to update status: ${error.message}`);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getUserDisplay = (feedback: FeedbackItem): string => {
    if (!feedback.created_by) return 'Unknown';
    const { first_name, last_name, email } = feedback.created_by;
    if (first_name && last_name) return `${first_name} ${last_name}`;
    if (first_name) return first_name;
    if (last_name) return last_name;
    return email;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Feedback</h2>
      
      {/* Add Feedback Form */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        {!epicId && (
          <Group gap="sm" mb="sm" align="flex-end">
            <Select
              label="Type"
              value={feedbackType}
              onChange={(value) => setFeedbackType((value as any) || 'TOOL')}
              data={[
                { value: 'EPIC', label: 'Feedback on Epics' },
                { value: 'PROCESS', label: 'Feedback on the process' },
                { value: 'TOOL', label: 'Feedback on the tool' },
              ]}
              w={260}
            />
            {feedbackType === 'EPIC' && (
              <Select
                label="Epic (optional)"
                placeholder={epicOptionsLoading ? 'Loading epics...' : 'Select an epic'}
                searchable
                clearable
                value={selectedEpicId}
                onChange={setSelectedEpicId}
                data={epicOptions}
                w={420}
              />
            )}
          </Group>
        )}
        <Textarea
          placeholder="Share feedback on an epic, the process, or the tool…"
          value={newFeedback}
          onChange={(e) => setNewFeedback(e.currentTarget.value)}
          minRows={3}
          maxRows={6}
          disabled={submitting}
          mb="sm"
        />
        <Group justify="flex-end">
          <Button
            leftSection={<IconSend size={16} />}
            onClick={handleSubmitFeedback}
            loading={submitting}
            disabled={!newFeedback.trim() || submitting}
          >
            Post Feedback
          </Button>
        </Group>
      </div>

      {/* Feedback List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <PurpleLoader size="sm" />
        </div>
      ) : feedbacks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Text size="sm" c="dimmed">
            No feedback yet. Be the first to provide feedback!
          </Text>
        </div>
      ) : (
        <div className="space-y-4">
          {feedbacks.map((feedback) => (
            <div
              key={feedback.id}
              style={{
                padding: '16px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                backgroundColor: '#fafafa',
              }}
            >
              <Group justify="space-between" mb="sm">
                <div>
                  <Group gap="xs">
                    <Text size="sm" fw={600}>
                      {getUserDisplay(feedback)}
                    </Text>
                    <Badge size="sm" variant="light" color={feedbackTypeColor(feedback.feedback_type)}>
                      {feedbackTypeLabel(feedback.feedback_type)}
                    </Badge>
                    {resolvedEpicName(feedback) && (
                      <Badge size="sm" variant="light" color="blue">
                        {resolvedEpicName(feedback)}
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {formatTimestamp(feedback.created_at)}
                  </Text>
                </div>
                <Group gap="sm" align="center">
                  {isSuperAdmin ? (
                    <Select
                      size="xs"
                      w={140}
                      value={feedback.status ?? 'unread'}
                      onChange={(value) => value && handleStatusChange(feedback.id, value)}
                      data={FEEDBACK_STATUS_OPTIONS}
                      disabled={updatingStatusId === feedback.id}
                    />
                  ) : (
                    <Text size="xs" c="dimmed">
                      {feedbackStatusLabel(feedback.status)}
                      {feedback.status_updated_at != null && (
                        <> · {formatTimestamp(feedback.status_updated_at)}</>
                      )}
                    </Text>
                  )}
                  {feedback.created_by?.email === currentUserEmail && (
                    <Group gap="xs">
                      {editingFeedbackId !== feedback.id ? (
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={() => handleStartEdit(feedback)}
                          title="Edit feedback"
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                      ) : null}
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => handleDeleteFeedback(feedback.id)}
                        title="Delete feedback"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  )}
                </Group>
              </Group>
              {editingFeedbackId === feedback.id ? (
                <div className="mt-2">
                  <Textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.currentTarget.value)}
                    minRows={3}
                    maxRows={6}
                    disabled={savingEdit}
                    mb="sm"
                  />
                  <Group gap="xs">
                    <Button size="xs" onClick={handleSaveEdit} loading={savingEdit} disabled={!editingText.trim()}>
                      Save
                    </Button>
                    <Button size="xs" variant="subtle" onClick={handleCancelEdit} disabled={savingEdit}>
                      Cancel
                    </Button>
                  </Group>
                </div>
              ) : (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {feedback.feedback_text}
                </Text>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}







