"use client";
import React, { useEffect, useRef, useState } from "react";
import type { AppSettings } from "@/lib/settings-db";
import { Modal, Button, Code, ScrollArea, Tabs, Text, Group, Badge } from "@mantine/core";
import { IconEye, IconCode, IconFileText } from "@tabler/icons-react";

const NOTIFICATION_SAVE_DEBOUNCE_MS = 1500;

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  onSave?: (updatedSettings: AppSettings) => Promise<void>;
};

type NotificationType = 'nudge_1_week_before' | 'nudge_on_due_date' | 'nudge_daily_after_due';

const notificationLabels: Record<NotificationType, string> = {
  nudge_1_week_before: '1 Week Before Due Date',
  nudge_on_due_date: 'On Due Date',
  nudge_daily_after_due: 'Daily After Due Date',
};

// All notification types with human-readable labels
const allNotificationTypes = [
  { key: 'criteria_assignment', label: 'Criteria Assignment', category: 'Assignment' },
  { key: 'criteria_nudge', label: 'Criteria Nudge', category: 'Reminder' },
  { key: 'retro_reminder', label: 'Retro Reminder', category: 'Reminder' },
  { key: 'success_review_reminder', label: 'Success Review Reminder', category: 'Reminder' },
  { key: 'gtm_access_nudge', label: 'GTM Access Confirmation', category: 'Reminder' },
  { key: 'stale_criterion', label: 'Stale Criterion', category: 'Alert' },
  { key: 'launch_risk_alert', label: 'Launch Risk Alert', category: 'Alert' },
  { key: 'go_no_go_decision', label: 'Go/No-Go Decision', category: 'Alert' },
  { key: 'weekly_digest', label: 'Weekly Digest', category: 'Digest' },
  { key: 'launch_status_change', label: 'Launch Status Change', category: 'Update' },
  { key: 'criterion_update', label: 'Criterion Update', category: 'Update' },
  { key: 'launch_created', label: 'Launch Created', category: 'Update' },
  { key: 'delegation', label: 'Delegation', category: 'Assignment' },
  { key: 'scorecard_alert', label: 'Scorecard Alert', category: 'Alert' },
  { key: 'escalation_alert', label: 'Escalation Alert', category: 'Alert' },
  { key: 'criterion_comment_or_attachment', label: 'Criterion Comment/Attachment', category: 'Update' },
] as const;

// Notification types that are ready for Slack (have handlers implemented)
const slackReadyTypes = new Set([
  'criteria_assignment',
  'criteria_nudge',
  'retro_reminder',
  'stale_criterion',
  'launch_risk_alert',
  'go_no_go_decision',
  'weekly_digest',
  'launch_status_change',
  'delegation',
  'scorecard_alert',
  'criterion_comment_or_attachment',
  'gtm_access_nudge',
]);

// Notification types that are ready for Email (have handlers implemented)
const emailReadyTypes = new Set([
  'launch_status_change',
  'launch_risk_alert',
  'criteria_nudge',
]);

// Helper function to check if a notification type is ready for a channel
const isNotificationReady = (type: string, channel: 'slack' | 'email'): boolean => {
  if (channel === 'slack') {
    return slackReadyTypes.has(type);
  } else {
    return emailReadyTypes.has(type);
  }
};

export default function NotificationsSection({ settings, setSettings, onSave }: Props) {
  // Slack notification settings
  const slackNudge1WeekBefore = settings.slack_nudge_1_week_before ?? true;
  const slackNudgeOnDueDate = settings.slack_nudge_on_due_date ?? true;
  const slackNudgeDailyAfter = settings.slack_nudge_daily_after_due ?? true;
  const slackNotificationsEnabled = (settings as any).slack_notifications_enabled ?? true;

  // Email notification settings
  const emailNudge1WeekBefore = (settings as any).email_nudge_1_week_before ?? true;
  const emailNudgeOnDueDate = (settings as any).email_nudge_on_due_date ?? true;
  const emailNudgeDailyAfter = (settings as any).email_nudge_daily_after_due ?? true;
  const emailNotificationsEnabled = (settings as any).email_notifications_enabled ?? true;

  // Track previous values to avoid infinite loops
  const prevValuesRef = useRef<string>('');
  const savingRef = useRef(false);
  const isFirstRun = useRef(true);
  const pendingSaveRef = useRef<string | null>(null);

  // Template viewer state
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateType, setTemplateType] = useState<string | null>(null);
  const [templateChannel, setTemplateChannel] = useState<'slack' | 'email' | null>(null);
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);
  const [templateSubject, setTemplateSubject] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const handleViewTemplate = async (type: string, channel: 'slack' | 'email') => {
    setTemplateType(type);
    setTemplateChannel(channel);
    setTemplateModalOpen(true);
    setTemplatePreview(null);
    setTemplateSubject(null);
    setTemplateError(null);
    setTemplateLoading(true);

    try {
      const response = await fetch(`/api/admin/notification-templates?type=${type}&channel=${channel}`);
      const data = await response.json();

      if (!response.ok) {
        setTemplateError(data.error || 'Failed to load template preview');
        setTemplateLoading(false);
        return;
      }

      setTemplatePreview(data.preview);
      setTemplateSubject(data.subject);
    } catch (error: any) {
      setTemplateError(error.message || 'Failed to load template preview');
    } finally {
      setTemplateLoading(false);
    }
  };

  // Create a stable string representation of notification settings for comparison
  // Sort keys to ensure consistent JSON.stringify output regardless of property order
  const getSettingsKey = () => {
    const allNotificationFlags: Record<string, boolean> = {
      slack_nudge_1_week_before: settings.slack_nudge_1_week_before ?? true,
      slack_nudge_on_due_date: settings.slack_nudge_on_due_date ?? true,
      slack_nudge_daily_after_due: settings.slack_nudge_daily_after_due ?? true,
      email_nudge_1_week_before: (settings as any).email_nudge_1_week_before ?? true,
      email_nudge_on_due_date: (settings as any).email_nudge_on_due_date ?? true,
      email_nudge_daily_after_due: (settings as any).email_nudge_daily_after_due ?? true,
      slack_notifications_enabled: (settings as any).slack_notifications_enabled ?? true,
      email_notifications_enabled: (settings as any).email_notifications_enabled ?? true,
    };

    // Add all notification type flags
    allNotificationTypes.forEach(notifType => {
      const slackKey = `slack_${notifType.key}`;
      const emailKey = `email_${notifType.key}`;
      allNotificationFlags[slackKey] = (settings[slackKey as keyof AppSettings] ?? true) as boolean;
      allNotificationFlags[emailKey] = (settings[emailKey as keyof AppSettings] ?? true) as boolean;
    });

    // Sort keys to ensure consistent stringification
    const sortedKeys = Object.keys(allNotificationFlags).sort();
    const sortedFlags: Record<string, boolean> = {};
    sortedKeys.forEach(key => {
      sortedFlags[key] = allNotificationFlags[key];
    });

    return JSON.stringify(sortedFlags);
  };

  // Update prevValuesRef when settings change after a save
  // This handles the case where autoSaveSettings updates settings
  useEffect(() => {
    const currentKey = getSettingsKey();
    
    // If we have a pending save and the current key matches it, update the ref
    // This means the save completed and settings were updated with the same values
    if (pendingSaveRef.current && pendingSaveRef.current === currentKey) {
      prevValuesRef.current = currentKey;
      pendingSaveRef.current = null;
      return;
    }
    
    // If we just finished saving (savingRef is false but we had a pending save)
    // and the current key matches the pending save, update the ref
    if (!savingRef.current && pendingSaveRef.current && pendingSaveRef.current === currentKey) {
      prevValuesRef.current = currentKey;
      pendingSaveRef.current = null;
      return;
    }
    
    // If we're not saving and the key matches previous, ensure refs are synced
    // This handles cases where settings update but values didn't actually change
    if (!savingRef.current && prevValuesRef.current === currentKey) {
      // Settings updated but values are the same - ensure pendingSaveRef is cleared
      pendingSaveRef.current = null;
    }
  }, [settings]);

  // Persist notification settings to API when they change (debounced)
  useEffect(() => {
    if (!onSave) return;
    
    const currentKey = getSettingsKey();

    // Skip first run - initialize the ref
    if (isFirstRun.current) {
      isFirstRun.current = false;
      prevValuesRef.current = currentKey;
      return;
    }

    // If values haven't changed, skip
    if (prevValuesRef.current === currentKey) {
      return;
    }

    // If already saving, skip (prevent concurrent saves)
    if (savingRef.current) {
      return;
    }

    // If this key matches a pending save, we're already processing it
    if (pendingSaveRef.current === currentKey) {
      return;
    }

    // Mark as saving to prevent concurrent saves
    savingRef.current = true;
    pendingSaveRef.current = currentKey;

    // Debounce the save
    const timer = setTimeout(async () => {
      try {
        await onSave(settings);
        // The settings will be updated by autoSaveSettings, which will trigger
        // the other useEffect to update prevValuesRef
      } catch (err) {
        console.error("Failed to save notification settings:", err);
        // On error, clear pending save and reset saving flag
        pendingSaveRef.current = null;
        prevValuesRef.current = currentKey; // Reset to current to prevent retry loop
      } finally {
        savingRef.current = false;
      }
    }, NOTIFICATION_SAVE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // Don't clear pendingSaveRef here - let the other useEffect handle it
      // Only reset saving flag if timer was cleared before completion
      if (savingRef.current) {
        // Timer was cleared but we're still marked as saving - this shouldn't happen
        // but reset to be safe
        savingRef.current = false;
      }
    };
  }, [settings]); // Removed onSave from dependencies - it's stable via useCallback

  const handleSlackToggle = (type: NotificationType, checked: boolean) => {
    const keyMap: Record<NotificationType, keyof AppSettings> = {
      nudge_1_week_before: 'slack_nudge_1_week_before',
      nudge_on_due_date: 'slack_nudge_on_due_date',
      nudge_daily_after_due: 'slack_nudge_daily_after_due',
    };
    setSettings({ ...settings, [keyMap[type]]: checked } as any);
  };

  const handleEmailToggle = (type: NotificationType, checked: boolean) => {
    const keyMap: Record<NotificationType, string> = {
      nudge_1_week_before: 'email_nudge_1_week_before',
      nudge_on_due_date: 'email_nudge_on_due_date',
      nudge_daily_after_due: 'email_nudge_daily_after_due',
    };
    setSettings({ ...settings, [keyMap[type]]: checked } as any);
  };

  const handleSystemFlagToggle = (channel: 'slack' | 'email', checked: boolean) => {
    if (channel === 'slack') {
      setSettings({ ...settings, slack_notifications_enabled: checked } as any);
    } else {
      setSettings({ ...settings, email_notifications_enabled: checked } as any);
    }
  };

  const getSlackValue = (type: NotificationType): boolean => {
    switch (type) {
      case 'nudge_1_week_before':
        return slackNudge1WeekBefore;
      case 'nudge_on_due_date':
        return slackNudgeOnDueDate;
      case 'nudge_daily_after_due':
        return slackNudgeDailyAfter;
    }
  };

  const getEmailValue = (type: NotificationType): boolean => {
    switch (type) {
      case 'nudge_1_week_before':
        return emailNudge1WeekBefore;
      case 'nudge_on_due_date':
        return emailNudgeOnDueDate;
      case 'nudge_daily_after_due':
        return emailNudgeDailyAfter;
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          <p className="text-sm text-gray-500">Configure notification settings for Slack and Email</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* System Flags */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">System Flags</h3>
          <p className="text-xs text-gray-600 mb-4">
            Enable or disable notification channels globally. When disabled, no notifications will be sent through that channel.
          </p>
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">Slack Notifications</span>
                <p className="text-xs text-gray-500">Enable all Slack notifications</p>
              </div>
              <input
                type="checkbox"
                checked={slackNotificationsEnabled}
                onChange={(e) => handleSystemFlagToggle('slack', e.target.checked)}
                className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </label>
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">Email Notifications</span>
                <p className="text-xs text-gray-500">Enable all email notifications</p>
              </div>
              <input
                type="checkbox"
                checked={emailNotificationsEnabled}
                onChange={(e) => handleSystemFlagToggle('email', e.target.checked)}
                className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </label>
          </div>
        </div>

        {/* Criteria Notification Matrix */}
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Criteria Notification Settings</h3>
            <p className="text-xs text-gray-600 mt-1">
              Configure when to send notifications for criteria. Select which channels should receive notifications for each trigger.
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50">
                    Notification Trigger
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 w-32">
                    Slack
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 w-32">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(Object.keys(notificationLabels) as NotificationType[]).map((type) => (
                  <tr key={type} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {notificationLabels[type]}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={getSlackValue(type) && slackNotificationsEnabled}
                        disabled={!slackNotificationsEnabled}
                        onChange={(e) => handleSlackToggle(type, e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={getEmailValue(type) && emailNotificationsEnabled}
                        disabled={!emailNotificationsEnabled}
                        onChange={(e) => handleEmailToggle(type, e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* All Notification Types Matrix */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">All Notification Types</h3>
            <p className="text-xs text-gray-600 mt-1">
              Enable or disable specific notification types for Slack and Email channels.
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Notification Type
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider w-32">
                    Slack
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider w-32">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allNotificationTypes.map((notifType) => {
                  const slackKey = `slack_${notifType.key}` as keyof AppSettings;
                  const emailKey = `email_${notifType.key}` as keyof AppSettings;
                  const slackValue = (settings[slackKey] ?? true) as boolean;
                  const emailValue = (settings[emailKey] ?? true) as boolean;
                  
                  const slackReady = isNotificationReady(notifType.key, 'slack');
                  const emailReady = isNotificationReady(notifType.key, 'email');
                  const isRowDisabled = !slackReady && !emailReady;

                  return (
                    <tr 
                      key={notifType.key} 
                      className={`${isRowDisabled ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}
                    >
                      <td className={`px-4 py-3 text-xs font-medium ${isRowDisabled ? 'text-gray-400' : 'text-gray-500'}`}>
                        {notifType.category}
                      </td>
                      <td className={`px-4 py-3 text-sm ${isRowDisabled ? 'text-gray-400' : 'text-gray-700'}`}>
                        {notifType.label}
                        {isRowDisabled && (
                          <span className="ml-2 text-xs text-gray-400 italic">(Not implemented)</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-center ${!slackReady ? 'bg-gray-50' : ''}`}>
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="checkbox"
                            checked={slackValue && slackNotificationsEnabled}
                            disabled={!slackNotificationsEnabled || !slackReady}
                            onChange={(e) => {
                              setSettings({ ...settings, [slackKey]: e.target.checked } as any);
                            }}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!slackReady ? 'Slack handler not implemented' : undefined}
                          />
                          {slackReady && (
                            <button
                              onClick={() => handleViewTemplate(notifType.key, 'slack')}
                              className="text-gray-400 hover:text-indigo-600 transition-colors"
                              title="View Slack template"
                            >
                              <IconEye size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-center ${!emailReady ? 'bg-gray-50' : ''}`}>
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="checkbox"
                            checked={emailValue && emailNotificationsEnabled}
                            disabled={!emailNotificationsEnabled || !emailReady}
                            onChange={(e) => {
                              setSettings({ ...settings, [emailKey]: e.target.checked } as any);
                            }}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!emailReady ? 'Email handler not implemented' : undefined}
                          />
                          {emailReady && (
                            <button
                              onClick={() => handleViewTemplate(notifType.key, 'email')}
                              className="text-gray-400 hover:text-indigo-600 transition-colors"
                              title="View Email template"
                            >
                              <IconEye size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Additional Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">How it works</h4>
          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
            <li>System flags control whether notifications are sent at all through each channel</li>
            <li>Individual notification triggers can be enabled/disabled per channel</li>
            <li>When a system flag is disabled, all checkboxes for that channel are disabled</li>
            <li>User-level notification preferences are managed in <strong>User Management</strong></li>
            <li>All notifications are logged in the <strong>notification_log</strong> table regardless of these settings</li>
            <li>Click the eye icon next to enabled notification types to view their templates</li>
          </ul>
        </div>
      </div>

      {/* Template Viewer Modal */}
      <Modal
        opened={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <IconFileText size={20} />
            <span>
              {templateType && allNotificationTypes.find(t => t.key === templateType)?.label} - {templateChannel?.toUpperCase()} Preview
            </span>
          </div>
        }
        size="xl"
      >
        {templateLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Generating preview...</div>
          </div>
        ) : templateError ? (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <Text size="sm" className="text-yellow-800">
                {templateError.includes('not implemented') ? (
                  <>
                    This template is not yet implemented. The notification type exists in the system but the template handler has not been created yet.
                  </>
                ) : (
                  templateError
                )}
              </Text>
            </div>
          </div>
        ) : templatePreview ? (
          <div className="space-y-4">
            {templateSubject && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <Text size="sm" fw={600} className="text-gray-700 mb-1">
                  {templateChannel === 'email' ? 'Subject:' : 'Preview Text:'}
                </Text>
                <Text size="sm" className="text-gray-600">{templateSubject}</Text>
              </div>
            )}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <Text size="xs" fw={600} className="text-gray-600 uppercase">
                  {templateChannel === 'slack' ? 'Slack Message Preview' : 'Email Preview'}
                </Text>
              </div>
              <ScrollArea h={500}>
                <div 
                  className="p-4"
                  dangerouslySetInnerHTML={{ __html: templatePreview }}
                />
              </ScrollArea>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <Text size="xs" className="text-blue-800">
                <strong>Note:</strong> This is an example preview with mock data. Actual notifications will use real epic names, dates, and user information.
              </Text>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
