"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import Link from "next/link";

/**
 * Launch Hold: this epic ships before the launch it belongs to, and RevOps has
 * not cleared it — so it would be live and visible before it can be quoted or
 * sold correctly.
 *
 * Two sizes because it appears in two very different places: a dense release list
 * where it has to survive being one of many columns, and the epic's own page where
 * it should stop the reader.
 */

export interface LaunchHoldInfo {
    daysEarly: number;
    reason: string;
    launchId: string;
    launchName: string;
    launchDate: string;
}

function formatDate(d: string): string {
    try {
        return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return d;
    }
}

/** Compact pill for the release list. */
export function LaunchHoldPill({ hold }: { hold: LaunchHoldInfo }) {
    return (
        <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
            style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
            title={hold.reason}
        >
            <IconAlertTriangle size={11} />
            Launch Hold
        </span>
    );
}

/** Full banner for the epic detail page. */
export function LaunchHoldBanner({ hold }: { hold: LaunchHoldInfo }) {
    return (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 mb-4">
            <div className="flex items-start gap-2">
                <IconAlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-red-800">Launch Hold</div>
                    <p className="text-xs text-red-700 mt-1">{hold.reason}</p>
                    <p className="text-xs text-red-700 mt-1">
                        Releases {hold.daysEarly} day{hold.daysEarly === 1 ? "" : "s"} before{" "}
                        <Link
                            href={`/gtm-launches/${hold.launchId}`}
                            className="underline underline-offset-2 font-medium"
                        >
                            {hold.launchName}
                        </Link>{" "}
                        ({formatDate(hold.launchDate)}). Clear RevOps sign-off, or move the release
                        behind the launch.
                    </p>
                </div>
            </div>
        </div>
    );
}
