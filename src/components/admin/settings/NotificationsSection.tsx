"use client";
import React, { useEffect, useRef } from "react";
import type { AppSettings } from "@/lib/settings-db";

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

  // Create a stable string representation of notification settings for comparison
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

    return JSON.stringify(allNotificationFlags);
  };

  // Update prevValuesRef when settings change after a save
  // This handles the case where autoSaveSettings updates settings
  useEffect(() => {
    const currentKey = getSettingsKey();
    
    // If we have a pending save and the current key matches it, update the ref
    if (pendingSaveRef.current && pendingSaveRef.current === currentKey) {
      prevValuesRef.current = currentKey;
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
      } finally {
        savingRef.current = false;
      }
    }, NOTIFICATION_SAVE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      if (!savingRef.current) {
        // Only clear pending if we're not in the middle of saving
        pendingSaveRef.current = null;
      }
    };
  }, [settings, onSave]);

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
          
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
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

                  return (
                    <tr key={notifType.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 font-medium">
                        {notifType.category}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {notifType.label}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={slackValue && slackNotificationsEnabled}
                          disabled={!slackNotificationsEnabled}
                          onChange={(e) => {
                            setSettings({ ...settings, [slackKey]: e.target.checked } as any);
                          }}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={emailValue && emailNotificationsEnabled}
                          disabled={!emailNotificationsEnabled}
                          onChange={(e) => {
                            setSettings({ ...settings, [emailKey]: e.target.checked } as any);
                          }}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        />
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
          </ul>
        </div>
      </div>
    </div>
  );
}
