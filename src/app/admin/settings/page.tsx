"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppSettings } from "@/lib/settings-db";

export default function AdminSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Helper for array fields (allowlisted_domains)
    const [domainInput, setDomainInput] = useState("");
    
    // Helper for pod -> product manager mapping
    const [podMappingPod, setPodMappingPod] = useState("");
    const [podMappingEmail, setPodMappingEmail] = useState("");

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch(`/api/settings?t=${Date.now()}`);
            if (!res.ok) throw new Error("Failed to fetch settings");
            const data = await res.json();
            setSettings(data);
        } catch (error: any) {
            console.error(error);
            setError(error.message || "Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });

            if (!res.ok) throw new Error("Failed to save settings");

            const updated = await res.json();
            setSettings(updated);
            setSuccess("Settings saved successfully");
            setTimeout(() => setSuccess(null), 3000);
        } catch (error: any) {
            console.error(error);
            setError(error.message || "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const addDomain = () => {
        if (!domainInput.trim() || !settings) return;
        if (settings.allowlisted_domains.includes(domainInput.trim())) return;

        setSettings({
            ...settings,
            allowlisted_domains: [...settings.allowlisted_domains, domainInput.trim()],
        });
        setDomainInput("");
    };

    const removeDomain = (domain: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            allowlisted_domains: settings.allowlisted_domains.filter((d) => d !== domain),
        });
    };

    const addPodMapping = () => {
        if (!podMappingPod.trim() || !podMappingEmail.trim() || !settings) return;
        const mapping = settings.pod_product_manager_mapping || {};
        if (mapping[podMappingPod.trim()]) return; // Already exists

        setSettings({
            ...settings,
            pod_product_manager_mapping: {
                ...mapping,
                [podMappingPod.trim()]: podMappingEmail.trim(),
            },
        });
        setPodMappingPod("");
        setPodMappingEmail("");
    };

    const removePodMapping = (pod: string) => {
        if (!settings) return;
        const mapping = settings.pod_product_manager_mapping || {};
        const { [pod]: removed, ...rest } = mapping;
        setSettings({
            ...settings,
            pod_product_manager_mapping: rest,
        });
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-600">Loading settings...</p>
                </div>
            </main>
        );
    }

    if (!settings) {
        return (
            <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
                <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
                    Failed to load settings.
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/" className="text-gray-500 hover:text-gray-700 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
                                <p className="text-sm text-gray-500">Configure application settings</p>
                            </div>
                        </div>
                        {success && (
                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg border border-green-200">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-sm font-medium">{success}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSave} className="space-y-6">
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
                                    min="1"
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

                    {/* Allowlisted Domains */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Allowlisted Domains</h2>
                                <p className="text-sm text-gray-500">Email domains permitted to access the application</p>
                            </div>
                        </div>
                        <div className="flex gap-3 mb-4">
                            <input
                                type="text"
                                value={domainInput}
                                onChange={(e) => setDomainInput(e.target.value)}
                                placeholder="example.com"
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                            <button
                                type="button"
                                onClick={addDomain}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                            >
                                Add Domain
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {settings.allowlisted_domains.map((domain) => (
                                <span key={domain} className="inline-flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                                    <span className="text-sm text-gray-700">{domain}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeDomain(domain)}
                                        className="text-gray-400 hover:text-red-600 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Integrations & Fallbacks */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Integrations & Fallbacks</h2>
                                <p className="text-sm text-gray-500">Email, webhooks, and fallback user configuration</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fallback Product Ops Email</label>
                                <input
                                    type="email"
                                    value={settings.fallback_user_email}
                                    onChange={(e) => setSettings({ ...settings, fallback_user_email: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Sender</label>
                                <input
                                    type="text"
                                    value={settings.email_sender}
                                    onChange={(e) => setSettings({ ...settings, email_sender: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Aha Webhook Secret</label>
                                <input
                                    type="password"
                                    value={settings.aha_webhook_secret || ""}
                                    onChange={(e) => setSettings({ ...settings, aha_webhook_secret: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Pod -> Product Manager Mapping */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Pod → Product Manager Mapping</h2>
                                <p className="text-sm text-gray-500">Map pod names to product manager emails for criteria resolution</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                            <input
                                type="text"
                                value={podMappingPod}
                                onChange={(e) => setPodMappingPod(e.target.value)}
                                placeholder="Pod Name"
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPodMapping(); } }}
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                            <input
                                type="email"
                                value={podMappingEmail}
                                onChange={(e) => setPodMappingEmail(e.target.value)}
                                placeholder="Product Manager Email"
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPodMapping(); } }}
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                            <button
                                type="button"
                                onClick={addPodMapping}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                            >
                                Add Mapping
                            </button>
                        </div>
                        <div className="space-y-2">
                            {settings.pod_product_manager_mapping && Object.keys(settings.pod_product_manager_mapping).length > 0 ? (
                                Object.entries(settings.pod_product_manager_mapping).map(([pod, email]) => (
                                    <div key={pod} className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                                        <div className="flex items-center gap-3">
                                            <span className="font-medium text-gray-900">{pod}</span>
                                            <span className="text-gray-400">→</span>
                                            <span className="text-gray-700">{email}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removePodMapping(pod)}
                                            className="text-gray-400 hover:text-red-600 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500 italic">No pod mappings configured</p>
                            )}
                        </div>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 font-medium transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving...
                                </span>
                            ) : (
                                "Save Changes"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}
