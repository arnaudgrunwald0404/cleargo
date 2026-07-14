"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PurpleLoader } from "@/components/PurpleLoader";
import { IconCheck, IconX, IconChevronDown } from "@tabler/icons-react";
import { getEpicDisplayName } from "@/lib/epicDisplayName";

interface EpicRow {
    id: string;
    name: string;
    product_component: string | null;
    pod: string | null;
    status: string;
    target_launch_date: string | null;
    launch_ref: string | null;
    aha_fields?: Record<string, any> | null;
}

function getClearGOCandidateRaw(epic: { aha_fields?: Record<string, any> | null }): string | boolean | undefined {
    const customFields = (epic.aha_fields as any)?.custom_fields;
    if (!customFields || typeof customFields !== "object") return undefined;
    const v = customFields.cleargo_candidate;
    return v === null || v === undefined ? undefined : v;
}

const LAUNCH_REF_PATTERN = /^\d{4}_Q[1-4]_.+$/;
const LAUNCH_REF_PREFIX_PATTERN = /^\d{4}_Q[1-4]_$/;
const SPECIAL_LAUNCH_REFS = ["No Launch"];

function formatLaunchRefPlaceholder(): string {
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    return `${now.getFullYear()}_Q${q}_`;
}

function parseModule(product_component: string | null): string {
    if (!product_component) return "—";
    try {
        const arr = JSON.parse(product_component);
        if (Array.isArray(arr) && arr.length > 0) return arr[0];
    } catch { /* not JSON */ }
    return product_component;
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

function statusBadge(status: string) {
    const s = status?.toLowerCase().replace(/_/g, " ") ?? "";
    let bg = "bg-gray-100";
    let text = "text-gray-700";
    if (s.includes("released") || s.includes("launched") || s === "go") {
        bg = "bg-emerald-100";
        text = "text-emerald-800";
    } else if (s.includes("progress") || s.includes("conditional")) {
        bg = "bg-amber-100";
        text = "text-amber-800";
    } else if (s.includes("cancel")) {
        bg = "bg-red-100";
        text = "text-red-700";
    } else if (s === "planned" || s === "pre_release" || s === "pre release") {
        bg = "bg-blue-100";
        text = "text-blue-700";
    }
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
            {status?.replace(/_/g, " ") || "—"}
        </span>
    );
}

function LaunchRefCell({
    epicId,
    currentValue,
    allRefs,
    onSave,
}: {
    epicId: string;
    currentValue: string | null;
    allRefs: string[];
    onSave: (epicId: string, ref: string | null) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [input, setInput] = useState(currentValue || "");
    const [saving, setSaving] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const placeholder = formatLaunchRefPlaceholder();

    const filteredRefs = useMemo(() => {
        const base = [...new Set([...SPECIAL_LAUNCH_REFS, ...allRefs])];
        if (!input) return base;
        return base.filter((r) => r.toLowerCase().includes(input.toLowerCase()));
    }, [allRefs, input]);

    const isSpecial = SPECIAL_LAUNCH_REFS.some((s) => s.toLowerCase() === input.toLowerCase());
    const isValid = !input || isSpecial || LAUNCH_REF_PATTERN.test(input);
    const isPrefixOnly = !isSpecial && LAUNCH_REF_PREFIX_PATTERN.test(input);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editing]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setEditing(false);
                setInput(currentValue || "");
                setShowDropdown(false);
            }
        }
        if (editing) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [editing, currentValue]);

    const handleSave = async (value: string) => {
        const matchedSpecial = SPECIAL_LAUNCH_REFS.find((s) => s.toLowerCase() === value.toLowerCase());
        if (matchedSpecial) value = matchedSpecial;
        if (value && !matchedSpecial && !LAUNCH_REF_PATTERN.test(value)) return;
        setSaving(true);
        try {
            await onSave(epicId, value || null);
            setEditing(false);
            setShowDropdown(false);
        } finally {
            setSaving(false);
        }
    };

    if (!editing) {
        return (
            <button
                onClick={() => {
                    setInput(currentValue || "");
                    setEditing(true);
                    setShowDropdown(true);
                }}
                className="text-left w-full px-2 py-1 rounded hover:bg-gray-100 text-sm min-h-[32px]"
            >
                {currentValue ? (
                    <span className="font-medium text-gray-900">{currentValue}</span>
                ) : (
                    <span className="text-gray-400 italic">Click to assign...</span>
                )}
            </button>
        );
    }

    return (
        <div ref={containerRef} className="relative">
            <div className="flex items-center gap-1">
                <div className="relative flex-1">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave(input);
                            if (e.key === "Escape") {
                                setEditing(false);
                                setInput(currentValue || "");
                                setShowDropdown(false);
                            }
                        }}
                        placeholder={`${placeholder}feature_name`}
                        className={`w-full pl-2 pr-7 py-1 border rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                            input && !isValid ? "border-red-400 bg-red-50" : "border-gray-300"
                        }`}
                        disabled={saving}
                    />
                    <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                    >
                        <IconChevronDown size={14} />
                    </button>
                </div>
                <button
                    onClick={() => handleSave(input)}
                    disabled={saving || (!!input && !isValid) || isPrefixOnly}
                    className="p-1 rounded hover:bg-emerald-50 text-emerald-600 disabled:opacity-30"
                    title="Save"
                >
                    {saving ? <PurpleLoader size="sm" /> : <IconCheck size={16} />}
                </button>
                {currentValue && (
                    <button
                        onClick={() => handleSave("")}
                        disabled={saving}
                        className="p-1 rounded hover:bg-red-50 text-red-500 disabled:opacity-30"
                        title="Clear"
                    >
                        <IconX size={16} />
                    </button>
                )}
            </div>
            {input && !isValid && (
                <p className="text-xs text-red-500 mt-0.5 ml-1">
                    Format: YYYY_QX_description (e.g. {placeholder}my_feature)
                </p>
            )}
            {showDropdown && filteredRefs.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredRefs.map((ref) => (
                        <button
                            key={ref}
                            onClick={() => {
                                setInput(ref);
                                handleSave(ref);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 border-b border-gray-100 last:border-b-0 ${
                                ref === currentValue ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-700"
                            }`}
                        >
                            {ref}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function LaunchScheduleSection() {
    const [epics, setEpics] = useState<EpicRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [allRefs, setAllRefs] = useState<string[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [epicsRes, refsRes] = await Promise.all([
                fetch("/api/epics"),
                fetch("/api/epics/launch-refs"),
            ]);
            if (epicsRes.ok) {
                const data = await epicsRes.json();
                setEpics(Array.isArray(data) ? data : []);
            }
            if (refsRes.ok) {
                const data = await refsRes.json();
                setAllRefs(data.refs || []);
            }
        } catch (err) {
            console.error("Failed to fetch data:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const candidateEpics = useMemo(() => {
        return epics
            .filter((e) => {
                const raw = getClearGOCandidateRaw(e);
                return raw === "Yes" || raw === "Yes - UI Framework" || raw === true;
            })
            .sort((a, b) => {
                if (!a.target_launch_date && !b.target_launch_date) return 0;
                if (!a.target_launch_date) return 1;
                if (!b.target_launch_date) return -1;
                return a.target_launch_date.localeCompare(b.target_launch_date);
            });
    }, [epics]);

    const handleSaveLaunchRef = useCallback(
        async (epicId: string, ref: string | null) => {
            const res = await fetch(`/api/epics/${epicId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ launch_ref: ref }),
            });
            if (!res.ok) throw new Error("Failed to update launch ref");

            setEpics((prev) =>
                prev.map((e) => (e.id === epicId ? { ...e, launch_ref: ref } : e))
            );
            if (ref && !allRefs.includes(ref)) {
                setAllRefs((prev) => [...prev, ref].sort());
            }
        },
        [allRefs]
    );

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Launch Schedule</h2>
                        <p className="text-sm text-gray-500">
                            ClearGO candidate epics — assign a launch reference to group epics into launch windows
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
                        <PurpleLoader size="sm" />
                        <span>Loading epics...</span>
                    </div>
                ) : candidateEpics.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500">No ClearGO candidate epics found.</p>
                    </div>
                ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Name
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                                        Module
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                                        Release Status
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                                        Release Date
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-64">
                                        Launch Ref
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {candidateEpics.map((epic) => (
                                    <tr key={epic.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                            {getEpicDisplayName(epic)}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-600">
                                            {parseModule(epic.product_component)}
                                        </td>
                                        <td className="px-4 py-2">
                                            {statusBadge(epic.status)}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-600">
                                            {formatDate(epic.target_launch_date)}
                                        </td>
                                        <td className="px-4 py-2">
                                            <LaunchRefCell
                                                epicId={epic.id}
                                                currentValue={epic.launch_ref}
                                                allRefs={allRefs}
                                                onSave={handleSaveLaunchRef}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <p className="mt-4 text-xs text-gray-400">
                    {candidateEpics.length} epic{candidateEpics.length !== 1 ? "s" : ""} · Launch Ref format: YYYY_QX_description
                </p>
            </div>
        </div>
    );
}
