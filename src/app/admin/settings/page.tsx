"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppMode } from "@/contexts/AppModeContext";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function AdminSettingsPage() {
    const router = useRouter();
    const { appMode } = useAppMode();

    useEffect(() => {
        // Redirect to the first settings page based on the current app mode
        if (appMode === 'launch') {
            router.replace("/admin/settings/launch-schedule");
        } else {
            router.replace("/admin/settings/releases");
        }
    }, [router, appMode]);

    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <PurpleLoader size="lg" />
            </div>
    );
}
