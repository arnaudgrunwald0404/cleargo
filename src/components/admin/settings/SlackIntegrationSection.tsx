"use client";
import React, { useState, useEffect, useRef } from "react";
import type { AppSettings } from "@/lib/settings-db";
import type { SlackThemeConfig } from "@/lib/slack/theme";
import { defaultSlackTheme } from "@/lib/slack/theme";

const SLACK_SAVE_DEBOUNCE_MS = 1500;

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  onSave?: (updatedSettings: AppSettings) => Promise<void>;
};

export default function SlackIntegrationSection({ settings, setSettings, onSave }: Props) {
  // Note: Slack settings may need to be added to AppSettings interface if they don't exist yet
  const slackDefaultChannel = (settings as any).slack_default_channel || '';
  const slackChannels = (settings as any).slack_channels || {};
  
  // Slack theme configuration
  const slackTheme: SlackThemeConfig = (settings as any).slack_theme || defaultSlackTheme;
  const [localTheme, setLocalTheme] = useState<SlackThemeConfig>(slackTheme);

  // Update local theme when settings change
  useEffect(() => {
    setLocalTheme((settings as any).slack_theme || defaultSlackTheme);
  }, [settings]);

  // Persist Slack settings to API when they change (debounced)
  const isFirstRun = useRef(true);
  
  // Create stable stringified values for dependencies (always defined, never undefined)
  const slackChannelsStr = JSON.stringify(slackChannels);
  const slackThemeStr = JSON.stringify(slackTheme);
  
  useEffect(() => {
    if (!onSave) return;
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      onSave(settings).catch((err) => {
        console.error("Failed to save Slack settings:", err);
      });
    }, SLACK_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    slackDefaultChannel,
    slackChannelsStr,
    slackThemeStr,
    onSave,
  ]);

  const updateTheme = (updates: Partial<SlackThemeConfig>) => {
    const newTheme = {
      ...localTheme,
      ...updates,
      colors: { ...localTheme.colors, ...updates.colors },
      emojis: {
        ...localTheme.emojis,
        ...updates.emojis,
        risk: { ...localTheme.emojis.risk, ...updates.emojis?.risk },
        decision: { ...localTheme.emojis.decision, ...updates.emojis?.decision },
        nudge: { ...localTheme.emojis.nudge, ...updates.emojis?.nudge },
      },
      branding: { ...localTheme.branding, ...updates.branding },
    };
    setLocalTheme(newTheme);
    setSettings({ ...settings, slack_theme: newTheme } as any);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Slack Integration</h2>
          <p className="text-sm text-gray-500">Configure Slack notifications and channels</p>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Slack Channel</label>
          <input
            type="text"
            value={slackDefaultChannel}
            onChange={(e) => setSettings({ ...settings, slack_default_channel: e.target.value } as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="#launch-readiness"
          />
          <p className="text-xs text-gray-500 mt-1">Default channel for launch notifications (e.g., #launch-readiness)</p>
        </div>

        <div className="border-t border-gray-200 pt-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Slack Notification Theme</h3>
          <p className="text-xs text-gray-500 mb-4">
            Customize the appearance of Slack notifications including colors, emojis, and branding.
          </p>
          
          <div className="space-y-6">
            {/* Colors */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Colors</h4>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(localTheme.colors).map(([key, value]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">{key}</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => updateTheme({ colors: { ...localTheme.colors, [key]: e.target.value } })}
                        className="h-8 w-16 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => updateTheme({ colors: { ...localTheme.colors, [key]: e.target.value } })}
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Emojis */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Emojis</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">General</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Stale Criterion</label>
                      <input
                        type="text"
                        value={localTheme.emojis.stale}
                        onChange={(e) => updateTheme({ emojis: { ...localTheme.emojis, stale: e.target.value } })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Assignment</label>
                      <input
                        type="text"
                        value={localTheme.emojis.assignment}
                        onChange={(e) => updateTheme({ emojis: { ...localTheme.emojis, assignment: e.target.value } })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Comment</label>
                      <input
                        type="text"
                        value={localTheme.emojis.comment}
                        onChange={(e) => updateTheme({ emojis: { ...localTheme.emojis, comment: e.target.value } })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Digest</label>
                      <input
                        type="text"
                        value={localTheme.emojis.digest}
                        onChange={(e) => updateTheme({ emojis: { ...localTheme.emojis, digest: e.target.value } })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Risk Levels</label>
                  <div className="grid grid-cols-3 gap-4">
                    {(['high', 'medium', 'low'] as const).map((level) => (
                      <div key={level}>
                        <label className="block text-xs text-gray-500 mb-1 capitalize">{level}</label>
                        <input
                          type="text"
                          value={localTheme.emojis.risk[level]}
                          onChange={(e) => updateTheme({ emojis: { ...localTheme.emojis, risk: { ...localTheme.emojis.risk, [level]: e.target.value } } })}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                          maxLength={2}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Decision Types</label>
                  <div className="grid grid-cols-3 gap-4">
                    {(['go', 'conditional', 'noGo'] as const).map((type) => (
                      <div key={type}>
                        <label className="block text-xs text-gray-500 mb-1">{type === 'noGo' ? 'No Go' : type === 'conditional' ? 'Conditional' : 'Go'}</label>
                        <input
                          type="text"
                          value={localTheme.emojis.decision[type]}
                          onChange={(e) => updateTheme({ emojis: { ...localTheme.emojis, decision: { ...localTheme.emojis.decision, [type]: e.target.value } } })}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                          maxLength={2}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Nudge Types</label>
                  <div className="grid grid-cols-3 gap-4">
                    {(['weekBefore', 'dueToday', 'overdue'] as const).map((type) => (
                      <div key={type}>
                        <label className="block text-xs text-gray-500 mb-1">
                          {type === 'weekBefore' ? '1 Week Before' : type === 'dueToday' ? 'Due Today' : 'Overdue'}
                        </label>
                        <input
                          type="text"
                          value={localTheme.emojis.nudge[type]}
                          onChange={(e) => updateTheme({ emojis: { ...localTheme.emojis, nudge: { ...localTheme.emojis.nudge, [type]: e.target.value } } })}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                          maxLength={2}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Branding */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Branding</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">App Name</label>
                  <input
                    type="text"
                    value={localTheme.branding.appName}
                    onChange={(e) => updateTheme({ branding: { ...localTheme.branding, appName: e.target.value } })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="ClearGO"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Logo URL (Optional)</label>
                  <input
                    type="url"
                    value={localTheme.branding.logoUrl || ''}
                    onChange={(e) => updateTheme({ branding: { ...localTheme.branding, logoUrl: e.target.value || undefined } })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="https://example.com/logo.png"
                  />
                  <p className="text-xs text-gray-500 mt-1">URL to your logo image (will be displayed in notifications)</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Footer Text (Optional)</label>
                  <input
                    type="text"
                    value={localTheme.branding.footerText || ''}
                    onChange={(e) => updateTheme({ branding: { ...localTheme.branding, footerText: e.target.value || undefined } })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Powered by ClearGO"
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional footer text to display in notifications</p>
                </div>
              </div>
            </div>

            {/* Reset to defaults */}
            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setLocalTheme(defaultSlackTheme);
                  setSettings({ ...settings, slack_theme: defaultSlackTheme } as any);
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


