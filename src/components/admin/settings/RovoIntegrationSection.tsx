"use client";
import React, { useState, useEffect } from "react";
import type { AppSettings } from "@/lib/settings-db";
import { Button, TextInput } from "@mantine/core";
import { patchSettings } from "@/lib/services/settingsService";

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
};

export default function RovoIntegrationSection({ settings, setSettings }: Props) {
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    message: string;
    expiresAt: string | null;
  } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string>('');
  const [savingRedirectUrl, setSavingRedirectUrl] = useState(false);
  const [redirectUrlError, setRedirectUrlError] = useState<string | null>(null);

  useEffect(() => {
    checkConnectionStatus();
    
    // Initialize redirect URL from settings
    const defaultUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}/api/integrations/rovo/oauth`
      : '/api/integrations/rovo/oauth';
    setRedirectUrl(settings.rovo_redirect_url || defaultUrl);
    
    // Check for OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    const error = urlParams.get('error');
    
    if (connected === 'true') {
      // Clear any existing test result first
      setTestResult(null);
      // Check connection status first, then show success message
      checkConnectionStatus().then(() => {
        setTestResult({ success: true, message: 'Successfully connected to ROVO' });
        // Auto-clear success message after 5 seconds
        setTimeout(() => setTestResult(null), 5000);
      });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      setTestResult({ success: false, message: decodeURIComponent(error) });
      // Auto-clear error message after 10 seconds
      setTimeout(() => setTestResult(null), 10000);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [settings.rovo_redirect_url]);

  const checkConnectionStatus = async () => {
    setCheckingStatus(true);
    // Clear test result when checking status to avoid stale messages
    setTestResult(null);
    try {
      const response = await fetch('/api/integrations/rovo/status', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to check connection status');
      }

      const data = await response.json();
      setConnectionStatus({
        connected: data.connected,
        message: data.message,
        expiresAt: data.expiresAt,
      });
    } catch (error: any) {
      console.error('Error checking ROVO status:', error);
      setConnectionStatus({
        connected: false,
        message: 'Failed to check connection status',
        expiresAt: null,
      });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleConnect = () => {
    // Redirect to OAuth initiation endpoint
    window.location.href = '/api/integrations/rovo/oauth';
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect ROVO? This will remove all stored tokens.')) {
      return;
    }

    setDisconnecting(true);
    try {
      const response = await fetch('/api/integrations/rovo/disconnect', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      const data = await response.json();
      setTestResult({ success: true, message: data.message || 'Disconnected successfully' });
      await checkConnectionStatus();
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Failed to disconnect' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/integrations/rovo/status', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();
      setTestResult({
        success: result.connected || false,
        message: result.message || 'Connection test completed',
      });
      await checkConnectionStatus();
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Failed to test connection',
      });
    } finally {
      setTesting(false);
    }
  };

  const getDefaultRedirectUrl = (): string => {
    return typeof window !== 'undefined' 
      ? `${window.location.origin}/api/integrations/rovo/oauth`
      : '/api/integrations/rovo/oauth';
  };

  const handleRedirectUrlChange = async (value: string) => {
    setRedirectUrl(value);
    setRedirectUrlError(null);
    
    // Normalize: empty string becomes null (use default)
    const valueToSave = value.trim() === '' ? null : value.trim();
    
    // If the value matches the default and there's no saved value, don't save
    if (valueToSave === null || valueToSave === getDefaultRedirectUrl()) {
      if (!settings.rovo_redirect_url) {
        return; // Already using default
      }
    }
    
    // Don't save if it's the same as what's already saved
    if (valueToSave === settings.rovo_redirect_url) {
      return;
    }
    
    setSavingRedirectUrl(true);
    try {
      const saved = await patchSettings({ rovo_redirect_url: valueToSave });
      setSettings(saved);
    } catch (error: any) {
      console.error('Failed to save redirect URL:', error);
      setRedirectUrlError(error.message || 'Failed to save redirect URL');
      setTimeout(() => setRedirectUrlError(null), 5000);
    } finally {
      setSavingRedirectUrl(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">ROVO Integration</h2>
          <p className="text-sm text-gray-500">Connect to Atlassian ROVO AI for Jira and Confluence search and summarization</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Show connection status banner */}
        {connectionStatus ? (
          <div
            className={`p-4 rounded-lg border ${
              connectionStatus.connected
                ? 'bg-green-50 border-green-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${
                  connectionStatus.connected ? 'text-green-800' : 'text-yellow-800'
                }`}>
                  {connectionStatus.connected ? '✓ Connected' : '⚠ Not Connected'}
                </p>
                <p className={`text-xs mt-1 ${
                  connectionStatus.connected ? 'text-green-700' : 'text-yellow-700'
                }`}>
                  {connectionStatus.message}
                </p>
                {connectionStatus.expiresAt && (
                  <p className={`text-xs mt-1 ${
                    connectionStatus.connected ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    Token expires: {new Date(connectionStatus.expiresAt).toLocaleString()}
                  </p>
                )}
              </div>
              <Button
                onClick={checkConnectionStatus}
                disabled={checkingStatus}
                loading={checkingStatus}
                variant="subtle"
                size="xs"
              >
                Refresh
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg border bg-gray-50 border-gray-200">
            <p className="text-sm text-gray-700">
              {checkingStatus ? 'Checking connection status...' : 'Click "Connect to ROVO" below to get started'}
            </p>
          </div>
        )}

        {/* Show test result only if connection status is not showing conflicting info */}
        {/* Only show test result if it's a recent action (not stale) */}
        {testResult && (!connectionStatus || testResult.success === connectionStatus.connected) && (
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
          {connectionStatus && connectionStatus.connected ? (
            <>
              <Button
                onClick={handleTestConnection}
                disabled={testing}
                loading={testing}
                variant="outline"
              >
                Test Connection
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={disconnecting}
                loading={disconnecting}
                color="red"
                variant="outline"
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={checkingStatus || disconnecting}
              loading={checkingStatus}
            >
              Connect to ROVO
            </Button>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">How It Works</h3>
          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
            <li>Click "Connect to ROVO" to authenticate with your Atlassian account</li>
            <li>ROVO uses OAuth 2.1 for secure authentication</li>
            <li>Once connected, you can search Jira issues and Confluence pages</li>
            <li>Use the summarize feature to get AI-powered summaries of content</li>
            <li>All actions respect your existing Jira and Confluence permissions</li>
          </ul>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">OAuth Redirect URL</h3>
          <p className="text-xs text-gray-600 mb-2">
            Configure this <strong>exact</strong> redirect URL in your Atlassian Developer Console OAuth app settings.
            Leave empty to use the default URL.
          </p>
          <TextInput
            value={redirectUrl}
            onChange={(e) => handleRedirectUrlChange(e.target.value)}
            placeholder={getDefaultRedirectUrl()}
            className="mb-2"
            styles={{
              input: {
                fontFamily: 'monospace',
                fontSize: '0.875rem',
              }
            }}
            rightSection={savingRedirectUrl ? (
              <div className="text-xs text-gray-500">Saving...</div>
            ) : null}
            error={redirectUrlError || undefined}
          />
          {redirectUrlError && (
            <p className="text-xs text-red-600 mt-1">{redirectUrlError}</p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            ⚠️ The URL must match <strong>exactly</strong> (including protocol, domain, and path). No trailing slashes.
            Default: <span className="font-mono">{getDefaultRedirectUrl()}</span>
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">API Endpoints</h3>
          <ul className="text-xs text-gray-700 space-y-1 font-mono">
            <li>POST /api/integrations/rovo/search</li>
            <li>POST /api/integrations/rovo/summarize</li>
            <li>GET /api/integrations/rovo/status</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
