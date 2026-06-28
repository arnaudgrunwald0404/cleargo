"use client";

import { useState, useEffect } from "react";
import {
  Title,
  Text,
  Stack,
  Card,
  Group,
  Button,
  SegmentedControl,
  Divider,
  Badge,
  Alert,
  Loader,
  ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBell,
  IconBrandSlack,
  IconMail,
  IconCheck,
  IconAlertCircle,
  IconKey,
  IconCopy,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import { useClipboard } from "@mantine/hooks";
import { TextInput } from "@mantine/core";

type NotificationChannel = "email" | "slack" | "both" | "none";

interface NotificationPreferences {
  gate_signoff_ready?: NotificationChannel;
  criteria_nudge?: NotificationChannel;
  criteria_assignment?: NotificationChannel;
  weekly_digest?: NotificationChannel;
}

interface UserProfile {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  slack_handle?: string | null;
  receive_slack_notifications?: boolean;
  notification_preferences?: NotificationPreferences;
}

const CHANNEL_OPTIONS = [
  { label: "Slack", value: "slack" },
  { label: "Email", value: "email" },
  { label: "Both", value: "both" },
  { label: "Off", value: "none" },
];

const EVENT_CONFIGS: Array<{
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  systemDefault: NotificationChannel;
}> = [
  {
    key: "gate_signoff_ready",
    label: "Approval requests",
    description:
      "Notify me when all criteria in a category are complete and it’s time for my Go/No-Go decision.",
    systemDefault: "slack",
  },
  {
    key: "criteria_assignment",
    label: "New assignments",
    description:
      "Notify me when a criterion is assigned or delegated to me.",
    systemDefault: "slack",
  },
  {
    key: "criteria_nudge",
    label: "Criteria reminders",
    description:
      "Send me reminders when I have overdue criteria that need my input.",
    systemDefault: "slack",
  },
  {
    key: "weekly_digest",
    label: "Weekly digest",
    description:
      "A weekly summary of my launches and outstanding action items.",
    systemDefault: "slack",
  },
];

export default function UserSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const clipboard = useClipboard({ timeout: 2000 });

  const loadApiKey = async () => {
    if (apiKey) { setApiKeyVisible(true); return; }
    setApiKeyLoading(true);
    try {
      const res = await fetch('/api/me/api-key', { credentials: 'include' });
      const data = await res.json();
      if (data.key) { setApiKey(data.key); setApiKeyVisible(true); }
      else notifications.show({ title: 'Error', message: data.error ?? 'Could not load API key.', color: 'red' });
    } catch {
      notifications.show({ title: 'Error', message: 'Could not load API key.', color: 'red' });
    } finally {
      setApiKeyLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setProfile(data.user);
          setPrefs(data.user.notification_preferences ?? {});
        }
      })
      .catch(() => {
        notifications.show({
          title: "Error",
          message: "Failed to load your settings.",
          color: "red",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChannelChange = (
    key: keyof NotificationPreferences,
    value: string
  ) => {
    setPrefs((prev) => ({ ...prev, [key]: value as NotificationChannel }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notification_preferences: prefs }),
      });
      if (!res.ok) throw new Error("Save failed");
      setDirty(false);
      notifications.show({
        title: "Saved",
        message: "Your notification preferences have been updated.",
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch {
      notifications.show({
        title: "Error",
        message: "Failed to save your preferences. Please try again.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-platinum)",
        }}
      >
        <Loader color="indigo" />
      </div>
    );
  }

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email ||
    "";

  const hasSlack = !!profile?.receive_slack_notifications && !!profile?.slack_handle;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-platinum)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          paddingLeft: "var(--page-container-padding-x)",
          paddingRight: "var(--page-container-padding-x)",
          paddingTop: "var(--page-container-padding-top)",
          paddingBottom: 48,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <Title
            order={1}
            style={{
              fontFamily: "var(--font-marcellus), serif",
              color: "var(--color-gray-900)",
              fontSize: "var(--font-size-4xl)",
              fontWeight: "var(--font-weight-bold)",
              margin: 0,
            }}
          >
            My Settings
          </Title>
          {displayName && (
            <Text
              size="lg"
              style={{
                color: "var(--color-gray-500)",
                marginTop: "0.5rem",
              }}
            >
              {displayName}
            </Text>
          )}
        </div>

        <Stack gap="xl">
          {/* Notification Preferences */}
          <Card withBorder radius="md" padding="lg">
            <Group gap="sm" mb="md">
              <ThemeIcon variant="light" color="indigo" size="md">
                <IconBell size={16} />
              </ThemeIcon>
              <div>
                <Text fw={600} size="md">
                  Notification Preferences
                </Text>
                <Text size="sm" c="dimmed">
                  Choose how you want to receive each type of notification.
                </Text>
              </div>
            </Group>

            {/* Slack status banner */}
            {!hasSlack && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="yellow"
                variant="light"
                mb="md"
                style={{ fontSize: "var(--mantine-font-size-sm)" }}
              >
                Your Slack account isn&apos;t linked yet. Slack notifications
                will fall back to email until an admin connects your handle.
                You can still set Slack as your preferred channel and it will
                activate once linked.
              </Alert>
            )}

            <Stack gap={0}>
              {EVENT_CONFIGS.map((event, idx) => {
                const currentValue =
                  prefs[event.key] ?? event.systemDefault;

                return (
                  <div key={event.key}>
                    {idx > 0 && <Divider my="md" />}
                    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xl">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Group gap="xs" mb={2}>
                          <Text fw={500} size="sm">
                            {event.label}
                          </Text>
                          {prefs[event.key] === undefined && (
                            <Badge size="xs" variant="outline" color="gray">
                              default
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                          {event.description}
                        </Text>
                      </div>
                      <SegmentedControl
                        value={currentValue}
                        onChange={(v) => handleChannelChange(event.key, v)}
                        data={CHANNEL_OPTIONS}
                        size="xs"
                        style={{ flexShrink: 0 }}
                        styles={{
                          root: { backgroundColor: "var(--color-gray-100)" },
                        }}
                      />
                    </Group>
                  </div>
                );
              })}
            </Stack>
          </Card>

          {/* Channel legend */}
          <Card withBorder radius="md" padding="md" bg="gray.0">
            <Text size="xs" c="dimmed" fw={500} mb="xs">
              Channel guide
            </Text>
            <Stack gap={4}>
              {[
                {
                  icon: <IconBrandSlack size={14} />,
                  label: "Slack",
                  detail: "Direct message to your linked Slack account",
                },
                {
                  icon: <IconMail size={14} />,
                  label: "Email",
                  detail: `Sent to ${profile?.email ?? "your email"}`,
                },
                {
                  icon: (
                    <Group gap={2}>
                      <IconBrandSlack size={14} />
                      <IconMail size={14} />
                    </Group>
                  ),
                  label: "Both",
                  detail: "Slack DM and email",
                },
              ].map(({ icon, label, detail }) => (
                <Group key={label} gap="xs">
                  <Text size="xs" c="dimmed" style={{ width: 60, fontWeight: 600 }}>
                    {label}
                  </Text>
                  <Group gap={4} c="dimmed">
                    {icon}
                    <Text size="xs" c="dimmed">
                      {detail}
                    </Text>
                  </Group>
                </Group>
              ))}
            </Stack>
          </Card>

          {/* Developer / API Access */}
          <Card withBorder radius="md" padding="lg">
            <Group gap="sm" mb="md">
              <ThemeIcon variant="light" color="violet" size="md">
                <IconKey size={16} />
              </ThemeIcon>
              <div>
                <Text fw={600} size="md">Developer / API Access</Text>
                <Text size="sm" c="dimmed">
                  Use this key to authenticate Claude Code and AI tools against ClearGo.
                </Text>
              </div>
            </Group>

            <Stack gap="md">
              <TextInput
                label="X-ClearGo-Key"
                value={apiKeyVisible && apiKey ? apiKey : ''}
                placeholder={apiKeyVisible ? '' : '••••••••••••••••••••••••••••••••'}
                readOnly
                type={apiKeyVisible ? 'text' : 'password'}
                rightSection={
                  <Group gap={4} wrap="nowrap" pr={4}>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      color="gray"
                      onClick={() => apiKey ? setApiKeyVisible(v => !v) : loadApiKey()}
                      loading={apiKeyLoading}
                      leftSection={apiKeyVisible ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                    >
                      {apiKeyVisible ? 'Hide' : 'Reveal'}
                    </Button>
                    {apiKey && (
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        color={clipboard.copied ? 'green' : 'gray'}
                        onClick={() => clipboard.copy(apiKey)}
                        leftSection={clipboard.copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                      >
                        {clipboard.copied ? 'Copied' : 'Copy'}
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
                style={{ fontSize: 'var(--mantine-font-size-xs)' }}
              >
                <Text size="xs" fw={500} mb={6}>One-time shell setup</Text>
                <Text size="xs" c="dimmed" mb={4}>
                  Add this to <code>~/.zshrc</code> (or <code>~/.bashrc</code>), then restart your terminal:
                </Text>
                <Text
                  size="xs"
                  ff="monospace"
                  style={{
                    background: 'var(--mantine-color-gray-1)',
                    padding: '6px 10px',
                    borderRadius: 4,
                    display: 'block',
                    userSelect: 'all',
                  }}
                >
                  {apiKey
                    ? `export CLEARGO_AI_API_KEY="${apiKey}"`
                    : 'export CLEARGO_AI_API_KEY="<reveal key above>"'}
                </Text>
              </Alert>
            </Stack>
          </Card>

          {/* Save */}
          <Group justify="flex-end">
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!dirty}
              color="indigo"
              leftSection={<IconCheck size={16} />}
            >
              Save preferences
            </Button>
          </Group>
        </Stack>
      </div>
    </div>
  );
}
