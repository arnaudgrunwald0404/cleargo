"use client";
import React from "react";
import type { AppSettings } from "@/lib/settings-db";

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
};

export default function CalendarIntegrationSection({ settings, setSettings }: Props) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Google Calendar Integration</h2>
          <p className="text-sm text-gray-500">Configure calendar check-in detection and sync settings</p>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Keywords</label>
          <input
            type="text"
            value={(settings.check_in_keywords || []).join(", ")}
            onChange={(e) => {
              const keywords = e.target.value
                .split(",")
                .map((k) => k.trim())
                .filter((k) => k.length > 0);
              setSettings({ ...settings, check_in_keywords: keywords });
            }}
            placeholder="check-in, checkin, standup, sync, stand-up, status update"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Calendar events matching these keywords will be automatically detected as check-in meetings and linked to epics
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-green-900 mb-2">Google Calendar Configuration</h3>
          <p className="text-xs text-green-800 mb-2">
            Google Calendar integration requires environment variables to be configured:
          </p>
          <ul className="text-xs text-green-700 space-y-1 list-disc list-inside mb-3">
            <li><code className="bg-green-100 px-1 rounded">GOOGLE_CALENDAR_CLIENT_ID</code> - OAuth 2.0 Client ID</li>
            <li><code className="bg-green-100 px-1 rounded">GOOGLE_CALENDAR_CLIENT_SECRET</code> - OAuth 2.0 Client Secret</li>
          </ul>
          <p className="text-xs text-green-700">
            Users can connect their Google Calendar individually in their <strong>Account</strong> settings. The integration will automatically detect check-in meetings based on the keywords above.
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">OAuth Redirect URL</h3>
          <p className="text-xs text-gray-600 mb-2">
            Configure this redirect URL in your Google Cloud Console OAuth 2.0 credentials:
          </p>
          <div className="bg-white border border-gray-300 rounded px-3 py-2 font-mono text-sm text-gray-900 break-all">
            {typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/google-calendar/oauth` : '/api/integrations/google-calendar/oauth'}
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">How It Works</h3>
          <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
            <li>Users connect their Google Calendar in <strong>Account</strong> → <strong>Integrations</strong></li>
            <li>The system syncs calendar events matching the check-in keywords</li>
            <li>Meetings are automatically linked to epics based on name matching</li>
            <li>Check-in meetings appear in the <strong>Meetings</strong> page</li>
          </ul>
        </div>
      </div>
    </div>
  );
}


