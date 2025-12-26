"use client";

import { useState, useEffect } from 'react';
import { Button, Textarea, Group, Text, ActionIcon, Loader } from '@mantine/core';
import { IconTrash, IconSend } from '@tabler/icons-react';

interface FeedbackItem {
  id: string;
  feedback_text: string;
  created_at: string;
  created_by?: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

interface FeedbackSectionProps {
  epicId: string;
  currentUserEmail: string;
}

export function FeedbackSection({ epicId, currentUserEmail }: FeedbackSectionProps) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newFeedback, setNewFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchFeedbacks();
  }, [epicId]);

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/feedback`, {
        credentials: 'include',
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

  const handleSubmitFeedback = async () => {
    if (!newFeedback.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ feedback_text: newFeedback.trim() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to post feedback');
      }

      setNewFeedback('');
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
      const res = await fetch(`/api/epics/${epicId}/feedback/${feedbackId}`, {
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
        <Text size="sm" fw={600} mb="xs">Add Feedback</Text>
        <Textarea
          placeholder="Enter your feedback about this launch..."
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
          <Loader size="sm" />
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
                  <Text size="sm" fw={600}>
                    {getUserDisplay(feedback)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatTimestamp(feedback.created_at)}
                  </Text>
                </div>
                {feedback.created_by?.email === currentUserEmail && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => handleDeleteFeedback(feedback.id)}
                    title="Delete feedback"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {feedback.feedback_text}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}






