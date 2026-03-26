"use client";

import { useSettings } from "@/contexts/SettingsContext";
import GeneralSection from "@/components/admin/settings/GeneralSection";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function GeneralPage() {
    const {
        settings,
        setSettings,
        currentUserRoles,
        saving,
        autoSaveSettings,
    } = useSettings();

    if (!settings) {
        return <PurpleLoader size="lg" fullPage />;
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        await autoSaveSettings(settings);
    };

    return (
        <>
            <GeneralSection
                settings={settings}
                setSettings={setSettings}
                currentUserRoles={currentUserRoles}
            />
            <form onSubmit={handleSave} className="space-y-6 mt-6">
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
        </>
    );
}
