"use client";
import React, { useState, useEffect, useRef } from "react";
import type { AppSettings } from "@/lib/settings-db";
import { TagsInput, TextInput, Select } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { canRolesPerform } from "@/lib/permissions";
import AhaFieldsSection from "./AhaFieldsSection";
import { patchSettings } from "@/lib/services/settingsService";

type AhaField = { alias: string; label: string; key: string | null; type?: string };

type SyncResult = {
  success: boolean;
  message: string;
  synced: number;
  failed: number;
  total: number;
  errors?: Array<{ aha_id: string; name: string; error: string }>;
};

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  currentUserRoles: string[];
  availableAhaFields?: AhaField[];
  ahaFieldsLoading?: boolean;
  draggedFieldAlias?: string | null;
  setDraggedFieldAlias?: (alias: string | null) => void;
  ahaFieldsSaving?: boolean;
  syncing?: boolean;
  syncResult?: SyncResult | null;
  onAutoSaveFields?: (fields: string[]) => void;
  onSynchronize?: () => void;
};

export default function AhaIntegrationSection({ 
  settings, 
  setSettings, 
  currentUserRoles,
  availableAhaFields = [],
  ahaFieldsLoading = false,
  draggedFieldAlias = null,
  setDraggedFieldAlias,
  ahaFieldsSaving = false,
  syncing = false,
  syncResult = null,
  onAutoSaveFields,
  onSynchronize,
}: Props) {
  const [canViewWebhookUrl, setCanViewWebhookUrl] = useState(false);
  const [canUpdateWebhookUrl, setCanUpdateWebhookUrl] = useState(false);
  const [canEditAhaTags, setCanEditAhaTags] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ 
    success: boolean; 
    message: string; 
    error?: string;
    webhookUrl?: string;
    endpoint?: string;
    status?: number;
    response?: any;
    hint?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncingEpics, setSyncingEpics] = useState(false);
  const [webhookEnvironment, setWebhookEnvironment] = useState<'development' | 'production'>(
    (settings.aha_webhook_environment === 'development' || settings.aha_webhook_environment === 'production') 
      ? settings.aha_webhook_environment 
      : 'development'
  );
  const [productionWebhookUrl, setProductionWebhookUrl] = useState<string | null>(null);
  const webhookTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tagsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const environmentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCanViewWebhookUrl(canRolesPerform(currentUserRoles, "settings.webhookUrl.read"));
    setCanUpdateWebhookUrl(canRolesPerform(currentUserRoles, "settings.webhookUrl.update"));
    setCanEditAhaTags(canRolesPerform(currentUserRoles, "settings.ahaTags.update"));
  }, [currentUserRoles]);

  useEffect(() => {
    // Sync environment from settings when settings change
    if (settings.aha_webhook_environment === 'development' || settings.aha_webhook_environment === 'production') {
      setWebhookEnvironment(settings.aha_webhook_environment);
    }
  }, [settings.aha_webhook_environment]);

  // Fetch production webhook URL from server
  useEffect(() => {
    if (webhookEnvironment === 'production') {
      setProductionWebhookUrl(null); // Reset while fetching
      fetch('/api/settings/webhook-url')
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (data.webhookUrl && !data.webhookUrl.includes('localhost') && !data.webhookUrl.includes('127.0.0.1')) {
            console.log('Fetched production webhook URL:', data.webhookUrl, 'source:', data.source);
            setProductionWebhookUrl(data.webhookUrl);
          } else {
            console.warn('No valid production webhook URL in API response:', data);
            if (data.warning) {
              setSaveError(data.warning);
              setTimeout(() => setSaveError(null), 10000);
            }
            setProductionWebhookUrl(null);
          }
        })
        .catch(error => {
          console.error('Failed to fetch production webhook URL:', error);
          setProductionWebhookUrl(null);
        });
    } else {
      setProductionWebhookUrl(null);
    }
  }, [webhookEnvironment]);

  const getProductionWebhookUrl = () => {
    // Prioritize NEXT_PUBLIC_APP_URL environment variable
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/aha/webhook`;
    }
    // Fallback to window.location.origin if env var not set
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api/integrations/aha/webhook`;
    }
    return '/api/integrations/aha/webhook';
  };

  const autoSaveWebhookUrl = async (webhookUrl: string) => {
    if (!canUpdateWebhookUrl) {
      console.warn("Cannot save webhook URL: user doesn't have permission");
      setSaveError("You don't have permission to update the webhook URL");
      setTimeout(() => setSaveError(null), 5000);
      return;
    }
    
    // Get the computed default URL
    const computedDefault = getProductionWebhookUrl();
    
    // In production mode, if the value matches the computed default, save as null (use auto-detect)
    if (webhookEnvironment === 'production' && webhookUrl === computedDefault) {
      const valueToSave = null;
      if (valueToSave === settings.aha_webhook_url) {
        return; // Already set to null
      }
      try {
        setSaving(true);
        setSaveError(null);
        const saved = await patchSettings({ aha_webhook_url: valueToSave });
        setSettings(saved);
        console.log("Successfully saved webhook URL:", saved);
      } catch (error: any) {
        console.error("Failed to auto-save webhook URL:", error);
        const errorMessage = error.message || "Failed to save webhook URL";
        setSaveError(errorMessage);
        setTimeout(() => setSaveError(null), 5000);
      } finally {
        setSaving(false);
      }
      return;
    }
    
    // If the value matches the computed default and there's no saved value, don't save
    // (let it use the computed default)
    if (webhookUrl === computedDefault && !settings.aha_webhook_url) {
      return;
    }
    
    // Normalize: empty string becomes null
    const valueToSave = webhookUrl.trim() === '' ? null : webhookUrl.trim();
    
    // Don't save if it's the same as what's already saved
    if (valueToSave === settings.aha_webhook_url) {
      return;
    }
    
    setSaving(true);
    setSaveError(null);
    try {
      console.log("Attempting to save webhook URL:", { valueToSave, originalValue: webhookUrl });
      const saved = await patchSettings({
        aha_webhook_url: valueToSave,
      });
      console.log("Successfully saved webhook URL:", saved);
      setSettings(saved);
    } catch (error: any) {
      console.error("Failed to auto-save webhook URL:", error);
      const errorMessage = error.message || "Failed to save webhook URL";
      setSaveError(errorMessage);
      // Clear error after 5 seconds
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const autoSaveTags = async (tags: string[]) => {
    if (!canEditAhaTags) return;
    setSaving(true);
    try {
      const saved = await patchSettings({
        aha_tags: tags,
      });
      setSettings(saved);
    } catch (error: any) {
      console.error("Failed to auto-save tags:", error);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (webhookTimeoutRef.current) {
        clearTimeout(webhookTimeoutRef.current);
      }
      if (tagsTimeoutRef.current) {
        clearTimeout(tagsTimeoutRef.current);
      }
    };
  }, []);

  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    setWebhookTestResult(null);
    
    // Get the current webhook URL based on environment mode
    // In production mode, use the production URL; in development, use the stored ngrok URL
    let currentWebhookUrl: string;
    if (webhookEnvironment === 'production' && productionWebhookUrl) {
      currentWebhookUrl = productionWebhookUrl;
    } else {
      currentWebhookUrl = settings.aha_webhook_url || 
        (typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/aha/webhook` : '/api/integrations/aha/webhook');
    }
    
    try {
      const response = await fetch("/api/integrations/aha/webhook/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          webhookUrl: currentWebhookUrl
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setWebhookTestResult({
          success: true,
          message: "Webhook test sent successfully",
          webhookUrl: data.webhookUrl,
          endpoint: data.endpoint,
          status: data.status,
          response: data.response,
        });
      } else {
        // Extract error details from various possible locations
        // Prioritize 'details' over 'error' since 'error' might be generic
        const errorMessage = data.details ||
                            data.response?.details ||
                            data.error || 
                            data.response?.error || 
                            data.message || 
                            (data.response ? JSON.stringify(data.response) : null) ||
                            "Unknown error";
        setWebhookTestResult({
          success: false,
          message: data.message || "Webhook test failed",
          error: errorMessage,
          webhookUrl: data.webhookUrl,
          endpoint: data.endpoint,
          status: data.status,
          response: data.response,
          hint: data.hint,
        });
      }
    } catch (error: any) {
      setWebhookTestResult({
        success: false,
        message: "Failed to test webhook",
        error: error.message || String(error),
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Aha! Integration</h1>
          <p className="text-sm text-gray-500">Configure webhook, tags, and field synchronization</p>
        </div>
      </div>

      {/* Webhook Configuration Section */}
      <section className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Webhook Configuration</h2>
            <p className="text-sm text-gray-500">Set up the webhook URL in your Aha! workspace to receive epic updates</p>
          </div>
          <button
            type="button"
            onClick={handleTestWebhook}
            disabled={testingWebhook}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 h-fit"
          >
            {testingWebhook ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Testing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Test Webhook
              </>
            )}
          </button>
        </div>
        {canViewWebhookUrl ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Environment</label>
              <Select
                value={webhookEnvironment}
                onChange={(value) => {
                  if (value === 'development' || value === 'production') {
                    setWebhookEnvironment(value);
                    setSettings({ ...settings, aha_webhook_environment: value });
                    if (canUpdateWebhookUrl) {
                      if (environmentTimeoutRef.current) {
                        clearTimeout(environmentTimeoutRef.current);
                      }
                      environmentTimeoutRef.current = setTimeout(async () => {
                        try {
                          await patchSettings({ aha_webhook_environment: value });
                        } catch (error: any) {
                          console.error('Failed to save environment:', error);
                          setSaveError(error.message || 'Failed to save environment. The database column may not exist yet - please apply the migration first.');
                          setTimeout(() => setSaveError(null), 5000);
                          // Revert the state on error
                          setWebhookEnvironment(settings.aha_webhook_environment === 'development' || settings.aha_webhook_environment === 'production' 
                            ? settings.aha_webhook_environment 
                            : 'development');
                        }
                      }, 500);
                    }
                  }
                }}
                data={[
                  { value: 'development', label: 'Development' },
                  { value: 'production', label: 'Production' }
                ]}
                disabled={!canUpdateWebhookUrl}
                className="mb-4"
              />
              <label className="block text-sm font-medium text-gray-700 mb-2">Webhook URL</label>
              <p className="text-sm text-gray-500 mb-1">
                Configure this URL in your Aha! workspace webhook settings (under Integrations → HTTP Webhook):
              </p>
              <div className="mt-2 space-y-1 mb-3">
                <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
                  <li>Hook URL: Copy the URL below</li>
                  <li>Events: Epic created, Epic updated</li>
                  <li>Aha! does not use webhook secrets - just configure the URL.</li>
                  {webhookEnvironment === 'development' && (
                    <li className="text-amber-600">Development mode: Use ngrok or other tunneling service for local testing</li>
                  )}
                  {webhookEnvironment === 'production' && (
                    <li className="text-green-600">Production mode: Uses your production domain URL</li>
                  )}
                </ul>
              </div>
              {webhookEnvironment === 'development' ? (
                <TextInput
                  value={settings.aha_webhook_url ?? ''}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSettings({ ...settings, aha_webhook_url: newValue || null });
                    if (canUpdateWebhookUrl) {
                      if (webhookTimeoutRef.current) {
                        clearTimeout(webhookTimeoutRef.current);
                      }
                      webhookTimeoutRef.current = setTimeout(() => {
                        autoSaveWebhookUrl(newValue);
                      }, 1000);
                    }
                  }}
                  placeholder="https://your-ngrok-url.ngrok-free.dev/api/integrations/aha/webhook"
                  disabled={!canUpdateWebhookUrl}
                  classNames={{
                    input: "font-mono text-sm"
                  }}
                />
              ) : (
                <>
                  <div className="relative">
                    <TextInput
                      value={productionWebhookUrl || 'Loading production URL...'}
                      readOnly
                      disabled={!productionWebhookUrl}
                      classNames={{
                        input: `font-mono text-sm bg-gray-50 pr-20 ${!productionWebhookUrl ? 'opacity-50' : ''}`
                      }}
                    />
                    {productionWebhookUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(productionWebhookUrl).then(() => {
                            notifications.show({
                              title: 'Copied!',
                              message: 'Webhook URL copied to clipboard',
                              color: 'green',
                              autoClose: 2000,
                            });
                          }).catch(() => {
                            // Fallback: select the text
                            const input = document.querySelector('input[value*="/api/integrations/aha/webhook"]') as HTMLInputElement;
                            if (input) {
                              input.select();
                              document.execCommand('copy');
                            }
                          });
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded border border-indigo-200 transition-colors"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                  {!productionWebhookUrl && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠️ Unable to fetch production URL. Make sure NEXT_PUBLIC_APP_URL is set in your environment variables.
                    </p>
                  )}
                  {productionWebhookUrl && (
                    <p className="text-xs text-gray-500 mt-1">
                      This is your production webhook URL. Copy it and paste it into Aha! webhook settings.
                    </p>
                  )}
                </>
              )}
              {saveError && (
                <p className="text-xs text-red-600 mt-1">{saveError}</p>
              )}
              {webhookTestResult && (
                <div className={`mt-2 px-3 py-2 rounded border text-xs ${webhookTestResult.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      {webhookTestResult.success ? (
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                      <span className="font-medium">{webhookTestResult.message}</span>
                    </div>
                    {webhookTestResult.success && (
                      <div className="pl-5 space-y-0.5 text-xs opacity-90">
                        {webhookTestResult.status && (
                          <div>Status: <span className="font-mono">{webhookTestResult.status}</span></div>
                        )}
                        {webhookTestResult.endpoint && (
                          <div>Endpoint: <span className="font-mono">{webhookTestResult.endpoint}</span></div>
                        )}
                        {webhookTestResult.response && typeof webhookTestResult.response === 'object' && (
                          <div>
                            Response: <span className="font-mono">{JSON.stringify(webhookTestResult.response, null, 2).substring(0, 100)}</span>
                            {JSON.stringify(webhookTestResult.response).length > 100 && '...'}
                          </div>
                        )}
                      </div>
                    )}
                    {webhookTestResult.error && (
                      <div className="pl-5 text-xs opacity-90 mt-1">
                        <div className="font-medium mb-1">Error:</div>
                        <div className="font-mono break-words">{webhookTestResult.error}</div>
                      </div>
                    )}
                    {webhookTestResult.hint && (
                      <div className="pl-5 text-xs opacity-90 mt-2 pt-2 border-t border-red-300">
                        <div className="font-medium mb-1">💡 Hint:</div>
                        <div>{webhookTestResult.hint}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {saving && canUpdateWebhookUrl && (
                <p className="text-xs text-gray-500 mt-1">Saving...</p>
              )}
              {!canUpdateWebhookUrl && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Only users with the "Update Webhook URL" permission can modify this URL.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              You don't have permission to view the webhook URL. Contact your administrator if you need access.
            </p>
          </div>
        )}
      </section>

      {/* Integration Tags Section */}
      <section className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Integration Tags</h2>
            <p className="text-sm text-gray-500">Tags that trigger inclusion in the Launch Console</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!confirm("This will sync all epics from Aha that match your tag criteria AND belong to releases already synced in the system. This complements webhooks by ensuring no epics are missed. Continue?")) {
                return;
              }
              
              setSyncingEpics(true);
              try {
                const res = await fetch("/api/integrations/aha/sync?sync_all=true", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                });
                
                if (!res.ok) {
                  const errorData = await res.json();
                  throw new Error(errorData.error || "Failed to sync epics");
                }
                
                const result = await res.json();
                const skipDetails = [];
                if (result.results.skipped_no_release > 0) {
                  skipDetails.push(`${result.results.skipped_no_release} with no release`);
                }
                if (result.results.skipped_release_not_synced > 0) {
                  skipDetails.push(`${result.results.skipped_release_not_synced} with unsynced release`);
                }
                const skipMessage = skipDetails.length > 0 ? `\nSkipped: ${skipDetails.join(', ')}` : '';
                
                alert(`Success: ${result.message}\n\nTotal epics fetched: ${result.results.total}\nCreated: ${result.results.created}\nUpdated: ${result.results.updated}${skipMessage}${result.results.errors.length > 0 ? `\nErrors: ${result.results.errors.length}` : ""}`);
              } catch (error: any) {
                alert(`Error: ${error.message}`);
              } finally {
                setSyncingEpics(false);
              }
            }}
            disabled={syncingEpics}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 h-fit"
          >
            {syncingEpics ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Syncing Epics...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Epics from Aha
              </>
            )}
          </button>
        </div>
        <div>
          <TagsInput
            value={settings.aha_tags || ['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo']}
            onChange={(tags) => {
              setSettings({ ...settings, aha_tags: tags });
              if (canEditAhaTags) {
                if (tagsTimeoutRef.current) {
                  clearTimeout(tagsTimeoutRef.current);
                }
                tagsTimeoutRef.current = setTimeout(() => {
                  autoSaveTags(tags);
                }, 1000);
              }
            }}
            placeholder={canEditAhaTags ? "Enter tags..." : "Contact admin to modify tags"}
            disabled={!canEditAhaTags}
            clearable={canEditAhaTags}
            className="w-full"
            classNames={{
              input: "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg",
              pill: "bg-indigo-50 text-indigo-700 font-medium"
            }}
          />
          {saving && canEditAhaTags && (
            <p className="text-xs text-gray-500 mt-1">Saving...</p>
          )}
          {!canEditAhaTags && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Only users with the "Update AHA Tags" permission can modify these tags.
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Epics with any of these tags (or "ClearGO Candidate" = Yes) will be synced.
          </p>
        </div>
      </section>

      {/* AHA Epic Fields Section */}
      {onAutoSaveFields && onSynchronize && setDraggedFieldAlias && (
        <section className="pt-8 border-t border-gray-200">
          <AhaFieldsSection
            settings={settings}
            setSettings={setSettings}
            availableAhaFields={availableAhaFields}
            loading={ahaFieldsLoading}
            draggedFieldAlias={draggedFieldAlias}
            setDraggedFieldAlias={setDraggedFieldAlias}
            saving={ahaFieldsSaving}
            syncing={syncing}
            syncResult={syncResult}
            onAutoSaveFields={onAutoSaveFields}
            onSynchronize={onSynchronize}
          />
        </section>
      )}
    </div>
  );
}


