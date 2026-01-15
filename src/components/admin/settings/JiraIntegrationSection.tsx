"use client";
import React, { useState } from "react";
import type { AppSettings } from "@/lib/settings-db";
import { Button } from "@mantine/core";

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
};

export default function JiraIntegrationSection({ settings, setSettings }: Props) {
  const [jiraDomain, setJiraDomain] = useState(settings.jira_domain || 'clearco.atlassian.net');
  const [jiraEmail, setJiraEmail] = useState(settings.jira_email || '');
  const [jiraApiToken, setJiraApiToken] = useState(settings.jira_api_token || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jira_domain: jiraDomain.trim() || null,
          jira_email: jiraEmail.trim() || null,
          jira_api_token: jiraApiToken.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save Jira settings');
      }

      const updated = await response.json();
      setSettings(updated);
      setTestResult({ success: true, message: 'Settings saved successfully' });
      setTimeout(() => setTestResult(null), 3000);
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/integrations/jira/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          domain: jiraDomain.trim(),
          email: jiraEmail.trim(),
          api_token: jiraApiToken.trim(),
        }),
      });

      const result = await response.json();
      setTestResult({
        success: result.success || false,
        message: result.message || 'Connection test completed',
      });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Failed to test connection',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Jira Integration</h2>
          <p className="text-sm text-gray-500">Configure Jira to match epics with AHA epics by name</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Jira Domain <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={jiraDomain}
            onChange={(e) => setJiraDomain(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="clearco.atlassian.net"
          />
          <p className="text-xs text-gray-500 mt-1">Your Jira domain (e.g., clearco.atlassian.net)</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Jira Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={jiraEmail}
            onChange={(e) => setJiraEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="your-email@clearcompany.com"
          />
          <p className="text-xs text-gray-500 mt-1">Email associated with your Jira API token</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Jira API Token <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={jiraApiToken}
            onChange={(e) => setJiraApiToken(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="ATATT3xFfGF0..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Your Jira API token. Create one at{' '}
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-800 underline"
            >
              Atlassian Account Settings
            </a>
          </p>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-lg ${
              testResult.success
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            <p className="text-sm">{testResult.message}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={handleTestConnection}
            disabled={testing || !jiraDomain || !jiraEmail || !jiraApiToken}
            loading={testing}
            variant="outline"
          >
            Test Connection
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !jiraDomain || !jiraEmail || !jiraApiToken}
            loading={saving}
          >
            Save Settings
          </Button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">How It Works</h3>
          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
            <li>Configure your Jira domain, email, and API token above</li>
            <li>The integration will search for Jira epics that match AHA epic names</li>
            <li>Epics are matched by exact name comparison</li>
            <li>Use the API endpoints to retrieve matched epics programmatically</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
