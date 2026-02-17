"use client";

import { useSettings } from "@/contexts/SettingsContext";
import NotificationsSection from "@/components/admin/settings/NotificationsSection";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function NotificationsPage() {
    const {
        settings,
        setSettings,
        currentUserRoles,
        saving,
        autoSaveSettings,
    } = useSettings();

    if (!settings) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <PurpleLoader size="lg" />
            </div>
        );
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        await autoSaveSettings(settings);
    };

    return (
        <>
            <form onSubmit={handleSave} className="space-y-6 mb-6">
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </form>
            <NotificationsSection
                settings={settings}
                setSettings={setSettings}
                onSave={autoSaveSettings}
            />
            <form onSubmit={handleSave} className="space-y-6 mt-6">
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </form>
        </>
    );
}
