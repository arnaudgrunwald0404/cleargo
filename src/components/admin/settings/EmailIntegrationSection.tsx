"use client";
import React from "react";
import type { AppSettings } from "@/lib/settings-db";

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
};

export default function EmailIntegrationSection({ settings, setSettings }: Props) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Email Integration</h2>
          <p className="text-sm text-gray-500">Configure email sender and fallback settings</p>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Sender</label>
          <input
            type="text"
            value={settings.email_sender}
            onChange={(e) => setSettings({ ...settings, email_sender: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="noreply@example.com"
          />
          <p className="text-xs text-gray-500 mt-1">Email address used as the sender for all system emails</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fallback Product Ops Email</label>
          <input
            type="email"
            value={settings.fallback_user_email}
            onChange={(e) => setSettings({ ...settings, fallback_user_email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="product-ops@example.com"
          />
          <p className="text-xs text-gray-500 mt-1">Fallback email address for Product Ops notifications when no specific owner is assigned</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Email Templates</h3>
          <p className="text-xs text-blue-800 mb-2">
            Configure email templates for invitations, reminders, and criteria updates in the <strong>Email Templates</strong> section.
          </p>
        </div>
      </div>
    </div>
  );
}


