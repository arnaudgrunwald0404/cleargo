"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function AdminSettingsPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/admin/settings/users/users");
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <PurpleLoader size="lg" />
            </div>
    );
}
