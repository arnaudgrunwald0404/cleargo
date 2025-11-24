"use client";

import { useEffect, useState } from "react";
import { AppSettings } from "@/lib/settings-db";

export default function AdminSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Helper for array fields (allowlisted_domains)
    const [domainInput, setDomainInput] = useState("");

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

    if (loading) return <main className="centered"><p>Loading settings...</p></main>;
    if (!settings) return <main className="centered"><p style={{ color: "red" }}>Failed to load settings.</p></main>;

    return (
        <main className="centered">
            <h1>Admin Settings</h1>

            {error && <p style={{ color: "red", marginBottom: 16 }}>{error}</p>}
            {success && <p style={{ color: "green", marginBottom: 16 }}>{success}</p>}

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                <section>
                    <h2>Readiness Thresholds</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                        <label>
                            Tier 1 Threshold
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={settings.threshold_tier1}
                                onChange={(e) => setSettings({ ...settings, threshold_tier1: Number(e.target.value) })}
                            />
                        </label>
                        <label>
                            Tier 2 Threshold
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={settings.threshold_tier2}
                                onChange={(e) => setSettings({ ...settings, threshold_tier2: Number(e.target.value) })}
                            />
                        </label>
                        <label>
                            Tier 3 Threshold
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={settings.threshold_tier3}
                                onChange={(e) => setSettings({ ...settings, threshold_tier3: Number(e.target.value) })}
                            />
                        </label>
                    </div>
                </section>

                <section>
                    <h2>General Configuration</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <label>
                            Staleness Window (Days)
                            <input
                                type="number"
                                min="1"
                                value={settings.staleness_days}
                                onChange={(e) => setSettings({ ...settings, staleness_days: Number(e.target.value) })}
                            />
                        </label>
                        <label>
                            Timezone
                            <select
                                value={settings.timezone}
                                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                            >
                                <option value="America/New_York">America/New_York</option>
                                <option value="America/Los_Angeles">America/Los_Angeles</option>
                                <option value="Europe/London">Europe/London</option>
                                <option value="UTC">UTC</option>
                            </select>
                        </label>
                    </div>
                    <div style={{ marginTop: 16 }}>
                        <label>
                            Digest Schedule (Cron-like)
                            <input
                                type="text"
                                value={settings.digest_schedule}
                                onChange={(e) => setSettings({ ...settings, digest_schedule: e.target.value })}
                                placeholder="MON_09_00"
                            />
                        </label>
                    </div>
                </section>

                <section>
                    <h2>Allowlisted Domains</h2>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <input
                            type="text"
                            value={domainInput}
                            onChange={(e) => setDomainInput(e.target.value)}
                            placeholder="example.com"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }}
                        />
                        <button type="button" onClick={addDomain}>Add</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {settings.allowlisted_domains.map((domain) => (
                            <span key={domain} style={{ background: "#eee", padding: "4px 8px", borderRadius: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                {domain}
                                <button
                                    type="button"
                                    onClick={() => removeDomain(domain)}
                                    style={{ border: "none", background: "none", cursor: "pointer", color: "red", fontWeight: "bold" }}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                </section>

                <section>
                    <h2>Integrations & Fallbacks</h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <label>
                            Fallback Product Ops Email
                            <input
                                type="email"
                                value={settings.fallback_user_email}
                                onChange={(e) => setSettings({ ...settings, fallback_user_email: e.target.value })}
                            />
                        </label>
                        <label>
                            Email Sender
                            <input
                                type="text"
                                value={settings.email_sender}
                                onChange={(e) => setSettings({ ...settings, email_sender: e.target.value })}
                            />
                        </label>
                        <label>
                            Aha Webhook Secret
                            <input
                                type="password"
                                value={settings.aha_webhook_secret || ""}
                                onChange={(e) => setSettings({ ...settings, aha_webhook_secret: e.target.value })}
                            />
                        </label>
                    </div>
                </section>

                <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" disabled={saving} style={{ padding: "10px 20px", fontSize: "1.1em", cursor: "pointer" }}>
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </form>
        </main>
    );
}
