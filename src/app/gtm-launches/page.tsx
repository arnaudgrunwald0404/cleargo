"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PurpleLoader } from "@/components/PurpleLoader";

interface GTMLaunch {
    launch_ref: string;
    epic_count: number;
    target_launch_date: string | null;
    readiness_pct: number;
    risk_level: string | null;
}

function formatDate(d: string | null): string {
    if (!d) return "—";
    try {
        return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return d;
    }
}

function readinessBadge(pct: number) {
    let bg = "bg-gray-100";
    let text = "text-gray-700";
    if (pct >= 80) {
        bg = "bg-emerald-100";
        text = "text-emerald-800";
    } else if (pct >= 40) {
        bg = "bg-amber-100";
        text = "text-amber-800";
    } else if (pct > 0) {
        bg = "bg-red-100";
        text = "text-red-700";
    }
    return (
        <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : pct > 0 ? "bg-red-500" : "bg-gray-300"}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
                {pct}%
            </span>
        </div>
    );
}

function riskBadge(risk: string | null) {
    if (!risk) return <span className="text-gray-400 text-sm">—</span>;
    const r = risk.toUpperCase();
    let bg = "bg-gray-100";
    let text = "text-gray-700";
    if (r === "HIGH") {
        bg = "bg-red-100";
        text = "text-red-700";
    } else if (r === "MEDIUM") {
        bg = "bg-amber-100";
        text = "text-amber-800";
    } else if (r === "LOW") {
        bg = "bg-emerald-100";
        text = "text-emerald-800";
    }
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
            {risk}
        </span>
    );
}

export default function GTMLaunchesPage() {
    const router = useRouter();
    const [launches, setLaunches] = useState<GTMLaunch[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/gtm-launches");
                if (res.ok) {
                    const data = await res.json();
                    setLaunches(data.launches || []);
                }
            } catch (err) {
                console.error("Failed to fetch GTM launches:", err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <main className="min-h-screen" style={{ background: "var(--color-platinum)" }}>
            <div
                style={{
                    maxWidth: "var(--page-container-max-width)",
                    margin: "0 auto",
                    paddingLeft: "var(--page-container-padding-x)",
                    paddingRight: "var(--page-container-padding-x)",
                    paddingTop: "var(--page-container-padding-top)",
                    paddingBottom: "var(--spacing-8)",
                }}
            >
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "var(--font-heading)" }}>
                        GTM Launches
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Active launch windows grouped by launch reference
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-gray-500">
                        <PurpleLoader size="sm" />
                        <span>Loading launches...</span>
                    </div>
                ) : launches.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                        <p className="text-gray-500">No active GTM launches.</p>
                        <p className="text-sm text-gray-400 mt-1">
                            Assign a Launch Ref to epics in Settings &rarr; Launch Schedule.
                        </p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Launch Name
                                    </th>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                                        Target Date
                                    </th>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-44">
                                        Readiness
                                    </th>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                                        Risk
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {launches.map((l) => (
                                    <tr
                                        key={l.launch_ref}
                                        onClick={() =>
                                            router.push(
                                                `/gtm-launches/${encodeURIComponent(l.launch_ref)}`
                                            )
                                        }
                                        className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                                    >
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-gray-900">
                                                    {l.launch_ref}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {l.epic_count} epic{l.epic_count !== 1 ? "s" : ""}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-gray-600">
                                            {formatDate(l.target_launch_date)}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {readinessBadge(l.readiness_pct)}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {riskBadge(l.risk_level)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </main>
    );
}
