"use client";

import { useState } from "react";
import {
  Title,
  Text,
  Stack,
  Card,
  Group,
  Button,
  ThemeIcon,
  Alert,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useClipboard } from "@mantine/hooks";
import {
  IconKey,
  IconCopy,
  IconCheck,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";

export default function DeveloperSettingsPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const clipboard = useClipboard({ timeout: 2000 });

  const loadApiKey = async () => {
    if (apiKey) { setApiKeyVisible(true); return; }
    setApiKeyLoading(true);
    try {
      const res = await fetch("/api/me/api-key", { credentials: "include" });
      const data = await res.json();
      if (data.key) { setApiKey(data.key); setApiKeyVisible(true); }
      else notifications.show({ title: "Error", message: data.error ?? "Could not load API key.", color: "red" });
    } catch {
      notifications.show({ title: "Error", message: "Could not load API key.", color: "red" });
    } finally {
      setApiKeyLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title order={2} style={{ fontFamily: "var(--font-marcellus), serif", color: "var(--color-gray-900)" }}>
          Developer / API Access
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          Manage the shared API key used to authenticate Claude Code and AI tools against ClearGo.
        </Text>
      </div>

      <Stack gap="lg">
        <Card withBorder radius="md" padding="lg">
          <Group gap="sm" mb="md">
            <ThemeIcon variant="light" color="violet" size="md">
              <IconKey size={16} />
            </ThemeIcon>
            <div>
              <Text fw={600} size="md">Shared API Key</Text>
              <Text size="sm" c="dimmed">
                This key is set via the <code>CLEARGO_AI_API_KEY</code> environment variable in Netlify.
              </Text>
            </div>
          </Group>

          <Stack gap="md">
            <TextInput
              label="X-ClearGo-Key"
              value={apiKeyVisible && apiKey ? apiKey : ""}
              placeholder={apiKeyVisible ? "" : "••••••••••••••••••••••••••••••••"}
              readOnly
              type={apiKeyVisible ? "text" : "password"}
              rightSection={
                <Group gap={4} wrap="nowrap" pr={4}>
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    color="gray"
                    onClick={() => (apiKey ? setApiKeyVisible((v) => !v) : loadApiKey())}
                    loading={apiKeyLoading}
                    leftSection={apiKeyVisible ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                  >
                    {apiKeyVisible ? "Hide" : "Reveal"}
                  </Button>
                  {apiKey && (
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      color={clipboard.copied ? "green" : "gray"}
                      onClick={() => clipboard.copy(apiKey)}
                      leftSection={clipboard.copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                    >
                      {clipboard.copied ? "Copied" : "Copy"}
                    </Button>
                  )}
                </Group>
              }
              rightSectionWidth={apiKey ? 150 : 90}
            />

            <Alert
              variant="light"
              color="violet"
              icon={<IconKey size={14} />}
              style={{ fontSize: "var(--mantine-font-size-xs)" }}
            >
              <Text size="xs" fw={500} mb={6}>One-time shell setup</Text>
              <Text size="xs" c="dimmed" mb={4}>
                Add this to <code>~/.zshrc</code> (or <code>~/.bashrc</code>), then restart your terminal:
              </Text>
              <Text
                size="xs"
                ff="monospace"
                style={{
                  background: "var(--mantine-color-gray-1)",
                  padding: "6px 10px",
                  borderRadius: 4,
                  display: "block",
                  userSelect: "all",
                }}
              >
                {apiKey
                  ? `export CLEARGO_AI_API_KEY="${apiKey}"`
                  : 'export CLEARGO_AI_API_KEY="<reveal key above>"'}
              </Text>
            </Alert>
          </Stack>
        </Card>
      </Stack>
    </div>
  );
}
