"use client";
import React, { useState } from "react";
import type { AppSettings } from "@/lib/settings-db";
import { notifications } from "@mantine/notifications";
import { ALL_FEATURE_FLAGS } from "@/lib/flags";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  currentUserRoles: string[];
};

export default function GeneralSection({ settings, setSettings, currentUserRoles }: Props) {
  const [recalculating, setRecalculating] = useState(false);
  const { refetch: refetchFeatureFlags } = useFeatureFlags();

  const handleRecalculateReadiness = async () => {
    if (recalculating) return;

    setRecalculating(true);
    notifications.show({
      id: 'recalculate-readiness',
      title: 'Recalculating Readiness',
      message: 'Processing all epics... This may take a few moments.',
      loading: true,
      autoClose: false,
    });

    try {
      const response = await fetch('/api/admin/recalculate-readiness', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to recalculate readiness');
      }

      notifications.update({
        id: 'recalculate-readiness',
        title: 'Recalculation Complete',
        message: data.hasErrors
          ? `Processed ${data.processed} of ${data.total} epics. ${data.errors.length} error(s) occurred.`
          : `Successfully recalculated readiness for ${data.processed} epic(s).`,
        color: data.hasErrors ? 'yellow' : 'green',
        autoClose: 5000,
      });
    } catch (error: any) {
      notifications.update({
        id: 'recalculate-readiness',
        title: 'Recalculation Failed',
        message: error.message || 'An error occurred while recalculating readiness',
        color: 'red',
        autoClose: 5000,
      });
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <>
      {/* Readiness Thresholds */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Readiness Thresholds</h2>
            <p className="text-sm text-gray-500">Minimum readiness scores required per tier</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tier 1 Threshold</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={settings.threshold_tier1}
              onChange={(e) => setSettings({ ...settings, threshold_tier1: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">{(settings.threshold_tier1 * 100).toFixed(0)}%</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tier 2 Threshold</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={settings.threshold_tier2}
              onChange={(e) => setSettings({ ...settings, threshold_tier2: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">{(settings.threshold_tier2 * 100).toFixed(0)}%</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tier 3 Threshold</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={settings.threshold_tier3}
              onChange={(e) => setSettings({ ...settings, threshold_tier3: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">{(settings.threshold_tier3 * 100).toFixed(0)}%</p>
          </div>
        </div>
      </div>

      {/* General Configuration */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">General Configuration</h2>
            <p className="text-sm text-gray-500">Staleness, timezone, and digest settings</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Staleness Window (Days)</label>
            <input
              type="number"
              min={1}
              value={settings.staleness_days}
              onChange={(e) => setSettings({ ...settings, staleness_days: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/London">Europe/London</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Digest Schedule</label>
          <input
            type="text"
            value={settings.digest_schedule}
            onChange={(e) => setSettings({ ...settings, digest_schedule: e.target.value })}
            placeholder="MON_09_00"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">Format: DAY_HH_MM (e.g., MON_09_00)</p>
        </div>
      </div>

      {/* User Interface Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">User Interface Settings</h2>
            <p className="text-sm text-gray-500">Customize the home page experience</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex-1">
              <label htmlFor="enable-activity-feed" className="block text-sm font-medium text-gray-900 mb-1">
                Enable Activity Feed
              </label>
              <p className="text-xs text-gray-600">
                Display a real-time activity feed on the home page showing criteria changes, new epics, and release updates
              </p>
            </div>
            <div className="ml-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="enable-activity-feed"
                  type="checkbox"
                  checked={settings.enable_activity_feed !== false}
                  onChange={(e) => setSettings({ ...settings, enable_activity_feed: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Flags */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Feature Flags</h2>
            <p className="text-sm text-gray-500">Enable or disable features for the app</p>
          </div>
        </div>
        <div className="space-y-4">
          {ALL_FEATURE_FLAGS.map(({ key, label, description }) => {
            const enabled = Array.isArray(settings.feature_flags) && settings.feature_flags.includes(key);
            return (
              <div key={key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1">
                  <label htmlFor={`feature-${key}`} className="block text-sm font-medium text-gray-900 mb-1">
                    {label}
                  </label>
                  <p className="text-xs text-gray-600">{description}</p>
                </div>
                <div className="ml-4">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id={`feature-${key}`}
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => {
                        const current = Array.isArray(settings.feature_flags) ? [...settings.feature_flags] : [];
                        const next = e.target.checked
                          ? (current.includes(key) ? current : [...current, key])
                          : current.filter((f) => f !== key);
                        setSettings({ ...settings, feature_flags: next });
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Epic Recalculation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Recalculate Epic Readiness</h2>
            <p className="text-sm text-gray-500">
              Recalculate readiness scores, readiness labels, and risk levels for all epics
            </p>
          </div>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={handleRecalculateReadiness}
            disabled={recalculating}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              recalculating
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
            }`}
          >
            {recalculating ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Recalculating...
              </span>
            ) : (
              'Recalculate All Epics'
            )}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            This will process all non-archived epics and update their readiness scores, status labels, and risk levels based on current criteria.
          </p>
        </div>
      </div>
    </>
  );
}
