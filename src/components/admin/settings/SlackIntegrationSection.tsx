"use client";
import React from "react";
import type { AppSettings } from "@/lib/settings-db";

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
};

export default function SlackIntegrationSection({ settings, setSettings }: Props) {
  // Note: Slack settings may need to be added to AppSettings interface if they don't exist yet
  const slackDefaultChannel = (settings as any).slack_default_channel || '';
  const slackChannels = (settings as any).slack_channels || {};

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
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-purple-900 mb-2">Slack Configuration</h3>
          <p className="text-xs text-purple-800 mb-2">
            Slack integration requires environment variables to be configured:
          </p>
          <ul className="text-xs text-purple-700 space-y-1 list-disc list-inside">
            <li><code className="bg-purple-100 px-1 rounded">SLACK_BOT_TOKEN</code> - Bot User OAuth Token</li>
            <li><code className="bg-purple-100 px-1 rounded">SLACK_SIGNING_SECRET</code> - Signing Secret</li>
            <li><code className="bg-purple-100 px-1 rounded">SLACK_APP_ID</code> - App ID</li>
          </ul>
          <p className="text-xs text-purple-700 mt-3">
            See the <strong>Slack Integration Setup Guide</strong> in the documentation for detailed setup instructions.
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Webhook Endpoints</h3>
          <div className="space-y-2 text-xs text-gray-600">
            <div>
              <strong>Events:</strong>{' '}
              <code className="bg-gray-100 px-1 rounded">
                {typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/slack/events` : '/api/integrations/slack/events'}
              </code>
            </div>
            <div>
              <strong>Interactions:</strong>{' '}
              <code className="bg-gray-100 px-1 rounded">
                {typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/slack/interactions` : '/api/integrations/slack/interactions'}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


