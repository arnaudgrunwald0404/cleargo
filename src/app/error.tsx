'use client';

import { useState } from 'react';
import { Button, Text, Title, Stack, Paper, Collapse, Group, ThemeIcon, Box } from '@mantine/core';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showError, setShowError] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Paper shadow="sm" radius="md" p="xl" maw={480} w="100%">
        <Stack align="center" gap="lg">
          <ThemeIcon size={64} radius="xl" color="red" variant="light">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </ThemeIcon>

          <Stack align="center" gap="xs">
            <Title order={2} ta="center" c="gray.8">
              Something went wrong
            </Title>
            <Text c="dimmed" ta="center" size="sm">
              An unexpected error occurred. Please refresh the page or try again — if the problem persists, contact support.
            </Text>
          </Stack>

          <Group>
            <Button onClick={() => window.location.reload()} variant="filled">
              Refresh page
            </Button>
            <Button onClick={reset} variant="default">
              Try again
            </Button>
          </Group>

          <Box w="100%">
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => setShowError((v) => !v)}
              fullWidth
            >
              {showError ? 'Hide error' : 'View error'}
            </Button>
            <Collapse in={showError}>
              <Paper
                mt="xs"
                p="sm"
                radius="sm"
                style={{ background: 'var(--mantine-color-gray-0)', border: '1px solid var(--mantine-color-gray-3)' }}
              >
                <Text size="xs" c="red.7" ff="monospace" style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                  {error.message || 'No error message available'}
                  {error.digest ? `\n\nDigest: ${error.digest}` : ''}
                </Text>
              </Paper>
            </Collapse>
          </Box>
        </Stack>
      </Paper>
    </div>
  );
}
