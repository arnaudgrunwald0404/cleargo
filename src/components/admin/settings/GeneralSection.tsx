"use client";
import React, { useEffect, useState } from "react";
import type { AppSettings } from "@/lib/settings-db";
import { TagsInput } from "@mantine/core";
import { canRolesPerform } from "@/lib/permissions";

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  currentUserRoles: string[];
};

export default function GeneralSection({ settings, setSettings, currentUserRoles }: Props) {
  const [canEditAhaTags, setCanEditAhaTags] = useState(false);

  useEffect(() => {
    canRolesPerform(currentUserRoles, "settings.ahaTags.update").then(setCanEditAhaTags);
  }, [currentUserRoles]);
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

      {/* Google Calendar Check-in Keywords */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Google Calendar Check-in Keywords</h2>
            <p className="text-sm text-gray-500">Keywords to identify check-in meetings in calendar events</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Keywords (comma-separated)</label>
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
            Calendar events matching these keywords will be automatically detected as check-in meetings
          </p>
        </div>
      </div>

      {/* Aha! Integration Tags */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Aha! Integration Tags</h2>
            <p className="text-sm text-gray-500">Tags that trigger inclusion in the Launch Console</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Allowed Tags</label>
          <TagsInput
            value={settings.aha_tags || ['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo']}
            onChange={(tags) => setSettings({ ...settings, aha_tags: tags })}
            placeholder={canEditAhaTags ? "Enter tags..." : "Contact admin to modify tags"}
            disabled={!canEditAhaTags}
            clearable={canEditAhaTags}
            className="w-full"
            classNames={{
              input: "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg",
              pill: "bg-indigo-50 text-indigo-700 font-medium"
            }}
          />
          {!canEditAhaTags && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Only users with the "Update AHA Tags" permission can modify these tags.
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Epics with any of these tags (or "Launch Candidate" = true) will be synced.
          </p>
        </div>
      </div>
    </>
  );
}
