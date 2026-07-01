'use client';

import {
  ActionIcon,
  Box,
  Drawer,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconMessageCircle, IconSend } from '@tabler/icons-react';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { FEATURE_AI_CHAT } from '@/lib/flags';

// Render assistant message content with clickable links and basic markdown
function renderMarkdown(text: string) {
  // Split into lines to preserve line breaks
  const lines = text.split('\n');
  return lines.map((line, li) => (
    <span key={li}>
      {li > 0 && <br />}
      {renderInline(line)}
    </span>
  ));
}

// Tokenise a single line into bold/link/url/plain segments
function renderInline(line: string): React.ReactNode[] {
  const pattern = /(\*\*?.+?\*\*?|\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|https?:\/\/\S+)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) {
      nodes.push(line.slice(last, match.index));
    }

    const token = match[0];

    if (token.startsWith('[')) {
      // [label](url)
      const label = match[2];
      const href = match[3];
      nodes.push(
        <a key={match.index} href={href} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--mantine-color-blue-6)', textDecoration: 'underline' }}>
          {label}
        </a>
      );
    } else if (token.startsWith('http')) {
      // bare URL
      nodes.push(
        <a key={match.index} href={token} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--mantine-color-blue-6)', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {token}
        </a>
      );
    } else if (token.startsWith('**')) {
      // **bold**
      nodes.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      // *bold*
      nodes.push(<strong key={match.index}>{token.slice(1, -1)}</strong>);
    } else {
      nodes.push(token);
    }

    last = match.index + token.length;
  }

  if (last < line.length) {
    nodes.push(line.slice(last));
  }

  return nodes;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  epicId?: string;
}

export function ChatPanel({ epicId }: ChatPanelProps) {
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const [opened, setOpened] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const viewport = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          context: epicId ? { epic_id: epicId } : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: err.error || 'Something went wrong. Please try again.',
          },
        ]);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingContent(fullText);
      }

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: fullText },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Connection error. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
  }, [input, isLoading, messages, epicId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (flagsLoading || !flags.includes(FEATURE_AI_CHAT)) return null;

  return (
    <>
      {/* Floating action button */}
      <ActionIcon
        onClick={() => setOpened(true)}
        variant="filled"
        color="blue"
        size="xl"
        radius="xl"
        aria-label="Open ClearGO Assistant"
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 300,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        <IconMessageCircle size={22} />
      </ActionIcon>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title={
          <Group gap="xs">
            <IconMessageCircle size={18} />
            <Text fw={600} size="sm">ClearGO Assistant</Text>
          </Group>
        }
        position="right"
        size={420}
        styles={{
          body: {
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 60px)',
            padding: 0,
          },
        }}
      >
        {/* Message list */}
        <ScrollArea flex={1} p="md" viewportRef={viewport}>
          {messages.length === 0 && !isLoading && (
            <Stack gap="xs" mt="lg">
              <Text size="sm" c="dimmed" ta="center">
                Ask me anything about your launches.
              </Text>
              <Text size="xs" c="dimmed" ta="center">
                "What&apos;s blocking the Payroll launch?" · "What do I need to review this week?"
              </Text>
            </Stack>
          )}

          {messages.map((m) => (
            <Box key={m.id} mb="sm" style={{ textAlign: m.role === 'user' ? 'right' : 'left' }}>
              <Text size="xs" c="dimmed" mb={2}>
                {m.role === 'user' ? 'You' : 'ClearGO'}
              </Text>
              <Box
                p="sm"
                style={{
                  display: 'inline-block',
                  maxWidth: '86%',
                  borderRadius: 10,
                  background:
                    m.role === 'user'
                      ? 'var(--mantine-color-blue-6)'
                      : 'var(--mantine-color-gray-1)',
                  color: m.role === 'user' ? '#fff' : 'inherit',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                <Text size="sm">
                  {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
                </Text>
              </Box>
            </Box>
          ))}

          {/* Streaming in-progress bubble */}
          {isLoading && (
            <Box mb="sm">
              <Text size="xs" c="dimmed" mb={2}>ClearGO</Text>
              <Box
                p="sm"
                style={{
                  display: 'inline-block',
                  maxWidth: '86%',
                  borderRadius: 10,
                  background: 'var(--mantine-color-gray-1)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {streamingContent ? (
                  <Text size="sm">{streamingContent}</Text>
                ) : (
                  <Group gap="xs">
                    <Loader size="xs" />
                    <Text size="sm" c="dimmed">Thinking…</Text>
                  </Group>
                )}
              </Box>
            </Box>
          )}
        </ScrollArea>

        {/* Input area */}
        <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
          <Group gap="xs" align="flex-end">
            <Textarea
              flex={1}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about launches, criteria, or ping a stakeholder…"
              disabled={isLoading}
              autosize
              minRows={1}
              maxRows={4}
              size="sm"
            />
            <ActionIcon
              variant="filled"
              color="blue"
              size="lg"
              loading={isLoading}
              disabled={!input.trim()}
              onClick={sendMessage}
              aria-label="Send"
            >
              <IconSend size={16} />
            </ActionIcon>
          </Group>
        </Box>
      </Drawer>
    </>
  );
}
