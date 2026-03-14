"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Drawer, Button, Group, Stack, TextInput, NumberInput, Select, MultiSelect, Accordion, ActionIcon, Badge } from "@mantine/core";
import { IconPencil, IconTrash, IconGripVertical, IconPlus, IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import { useSettings } from "@/contexts/SettingsContext";
import { addLaunchCriterion, updateLaunchCriterion, deleteLaunchCriterion } from "@/lib/services/settingsService";
import { PurpleLoader } from "@/components/PurpleLoader";

const TIER_OPTIONS = [
    { value: "TIER_1", label: "Tier 1" },
    { value: "TIER_2", label: "Tier 2" },
    { value: "TIER_3", label: "Tier 3" },
];

const GATE_OPTIONS = [
    { value: "hard", label: "Hard Gate" },
    { value: "soft", label: "Soft Gate" },
];

// Default phases for a new launch workflow — users can add/rename/reorder
const DEFAULT_PHASES = [
    "Phase 1: Strategy & Positioning",
    "Phase 2: Product Readiness & Validation",
    "Phase 3: Messaging & Asset Build",
    "Phase 4: Internal Enablement & Activation",
    "Phase 5: Launch",
    "Phase 6: Post-Launch Optimization",
];

export default function LaunchCriteriaManager() {
    const { launchCriteria, launchCriteriaLoading, fetchLaunchCriteria, users } = useSettings();

    // Phase management — derive phases from existing criteria + allow adding new ones
    const existingPhases = useMemo(() => {
        const set = new Set<string>();
        for (const c of launchCriteria) {
            if (c.phase) set.add(c.phase);
        }
        return Array.from(set);
    }, [launchCriteria]);

    const [customPhases, setCustomPhases] = useState<string[]>([]);
    const [newPhaseName, setNewPhaseName] = useState("");

    // Merge existing and custom, maintain order (existing first, then custom additions)
    const allPhases = useMemo(() => {
        const ordered = [...existingPhases];
        for (const p of customPhases) {
            if (!ordered.includes(p)) ordered.push(p);
        }
        return ordered;
    }, [existingPhases, customPhases]);

    const addPhase = () => {
        const name = newPhaseName.trim();
        if (!name || allPhases.includes(name)) return;
        setCustomPhases((prev) => [...prev, name]);
        setNewPhaseName("");
    };

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({
        label: "",
        description: "",
        phase: "",
        gate: "",
        tier_applicability: [] as string[],
        sort_order: 0,
        default_owner_email: "",
        default_due_offset_days: "" as string | number,
    });
    const [saving, setSaving] = useState(false);

    const criteriaByPhase = useMemo(() => {
        const grouped: Record<string, any[]> = {};
        // Initialize all known phases (even empty ones)
        for (const phase of allPhases) {
            grouped[phase] = [];
        }
        for (const c of launchCriteria) {
            const phase = c.phase || "Uncategorized";
            if (!grouped[phase]) grouped[phase] = [];
            grouped[phase].push(c);
        }
        // Sort each group by sort_order
        for (const key of Object.keys(grouped)) {
            grouped[key].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        }
        return grouped;
    }, [launchCriteria, allPhases]);

    // Ordered phases: allPhases first, then any "Uncategorized" at the end
    const orderedPhases = useMemo(() => {
        const result = [...allPhases];
        if (criteriaByPhase["Uncategorized"]?.length > 0 && !result.includes("Uncategorized")) {
            result.push("Uncategorized");
        }
        return result.filter((p) => criteriaByPhase[p] && criteriaByPhase[p].length > 0 || allPhases.includes(p));
    }, [allPhases, criteriaByPhase]);

    const phaseOptions = useMemo(() => {
        return allPhases.map((p) => ({ value: p, label: p }));
    }, [allPhases]);

    const ownerOptions = useMemo(() => {
        return users
            .filter((u: any) => u.email)
            .map((u: any) => ({ value: u.email, label: u.name || u.email }));
    }, [users]);

    const resetForm = () => {
        setForm({
            label: "",
            description: "",
            phase: "",
            gate: "",
            tier_applicability: [],
            sort_order: 0,
            default_owner_email: "",
            default_due_offset_days: "",
        });
        setEditingId(null);
    };

    const openAdd = (phase?: string) => {
        resetForm();
        if (phase) {
            setForm((f) => ({ ...f, phase }));
        }
        setDrawerOpen(true);
    };

    const openEdit = (c: any) => {
        setEditingId(c.id);
        setForm({
            label: c.label || "",
            description: c.description || "",
            phase: c.phase || "",
            gate: c.gate || "",
            tier_applicability: c.tier_applicability || [],
            sort_order: c.sort_order ?? 0,
            default_owner_email: c.default_owner_email || "",
            default_due_offset_days: c.default_due_offset_days ?? "",
        });
        setDrawerOpen(true);
    };

    const handleSave = useCallback(async () => {
        if (!form.label.trim()) return;
        setSaving(true);
        try {
            const payload = {
                label: form.label.trim(),
                description: form.description.trim() || null,
                phase: form.phase.trim() || null,
                gate: form.gate || null,
                tier_applicability: form.tier_applicability.length > 0 ? form.tier_applicability : null,
                sort_order: form.sort_order,
                default_owner_email: form.default_owner_email || null,
                default_due_offset_days: form.default_due_offset_days !== "" ? Number(form.default_due_offset_days) : null,
            };

            if (editingId) {
                await updateLaunchCriterion(editingId, payload);
            } else {
                await addLaunchCriterion(payload as any);
            }
            await fetchLaunchCriteria();
            setDrawerOpen(false);
            resetForm();
        } catch (error: any) {
            console.error("Failed to save launch criterion:", error);
        } finally {
            setSaving(false);
        }
    }, [form, editingId, fetchLaunchCriteria]);

    const handleDelete = useCallback(async () => {
        if (!editingId) return;
        setSaving(true);
        try {
            await deleteLaunchCriterion(editingId);
            await fetchLaunchCriteria();
            setDrawerOpen(false);
            resetForm();
        } catch (error: any) {
            console.error("Failed to delete launch criterion:", error);
        } finally {
            setSaving(false);
        }
    }, [editingId, fetchLaunchCriteria]);

    return (
        <div className="space-y-6">
            {/* Phase Management */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Launch Phases</h2>
                        <p className="text-sm text-gray-500">Define the phases that group launch tasks (like release stages)</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                    {allPhases.map((phase) => {
                        const count = criteriaByPhase[phase]?.length || 0;
                        return (
                            <Badge
                                key={phase}
                                size="lg"
                                variant="light"
                                color="orange"
                                rightSection={
                                    <span className="text-xs text-orange-600 ml-1">{count}</span>
                                }
                            >
                                {phase}
                            </Badge>
                        );
                    })}
                </div>
                <div className="flex gap-2">
                    <TextInput
                        placeholder="New phase name..."
                        value={newPhaseName}
                        onChange={(e) => setNewPhaseName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addPhase()}
                        size="sm"
                        className="flex-1"
                    />
                    <Button
                        size="sm"
                        variant="light"
                        color="orange"
                        onClick={addPhase}
                        disabled={!newPhaseName.trim()}
                    >
                        Add Phase
                    </Button>
                </div>
            </div>

            {/* Task Templates by Phase */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Launch Criteria Templates</h2>
                            <p className="text-sm text-gray-500">Define tasks that auto-populate when a new launch is created</p>
                        </div>
                    </div>
                    <button
                        onClick={() => openAdd()}
                        className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors flex items-center gap-1"
                    >
                        <IconPlus className="w-4 h-4" />
                        Add Task
                    </button>
                </div>

                {launchCriteriaLoading ? (
                    <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
                        <PurpleLoader size="sm" />
                        <span>Loading...</span>
                    </div>
                ) : orderedPhases.length === 0 && launchCriteria.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500 mb-2">No launch criteria templates yet.</p>
                        <p className="text-sm text-gray-400">Add phases above, then add task templates to each phase.</p>
                    </div>
                ) : (
                    <Accordion multiple defaultValue={orderedPhases} variant="separated">
                        {orderedPhases.map((phase) => (
                            <Accordion.Item key={phase} value={phase}>
                                <Accordion.Control>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{phase}</span>
                                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                            {criteriaByPhase[phase]?.length || 0} tasks
                                        </span>
                                    </div>
                                </Accordion.Control>
                                <Accordion.Panel>
                                    <div className="space-y-1">
                                        {(criteriaByPhase[phase] || []).map((c: any) => (
                                            <div
                                                key={c.id}
                                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 group"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-gray-900 truncate">{c.label}</div>
                                                    {c.description && (
                                                        <div className="text-xs text-gray-500 truncate">{c.description}</div>
                                                    )}
                                                </div>
                                                {c.default_owner_email && (
                                                    <span className="text-xs text-gray-400 shrink-0">{c.default_owner_email}</span>
                                                )}
                                                {c.default_due_offset_days != null && (
                                                    <span className="text-xs text-gray-400 shrink-0 bg-gray-100 px-2 py-0.5 rounded">
                                                        {c.default_due_offset_days}d before
                                                    </span>
                                                )}
                                                {c.gate && (
                                                    <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${c.gate === 'hard' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        {c.gate === 'hard' ? 'Hard' : 'Soft'}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => openEdit(c)}
                                                    className="p-1 rounded hover:bg-gray-200 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <IconPencil className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        {/* Add task to this phase */}
                                        <button
                                            onClick={() => openAdd(phase)}
                                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors w-full"
                                        >
                                            <IconPlus className="w-4 h-4" />
                                            Add task to {phase}
                                        </button>
                                    </div>
                                </Accordion.Panel>
                            </Accordion.Item>
                        ))}
                    </Accordion>
                )}
            </div>

            {/* Edit/Add Drawer */}
            <Drawer
                opened={drawerOpen}
                onClose={() => { setDrawerOpen(false); resetForm(); }}
                title={editingId ? "Edit Launch Task Template" : "Add Launch Task Template"}
                position="right"
                size="xl"
                padding="lg"
            >
                <Stack gap="md">
                    <TextInput
                        label="Task Name"
                        value={form.label}
                        onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                        required
                        placeholder="e.g., Prepare press release"
                    />
                    <TextInput
                        label="Description"
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="What does this task involve?"
                    />
                    <Select
                        label="Phase"
                        value={form.phase || null}
                        onChange={(v) => setForm((f) => ({ ...f, phase: v || "" }))}
                        data={phaseOptions}
                        searchable
                        allowDeselect
                        placeholder="Select or type a phase"
                        nothingFoundMessage="No matching phase"
                    />
                    <TextInput
                        label="Or create a new phase"
                        placeholder="Type a new phase name"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const trimmed = e.currentTarget.value.trim();
                                if (trimmed && !allPhases.includes(trimmed)) {
                                    setCustomPhases((prev: string[]) => [...prev, trimmed]);
                                }
                                setForm((f) => ({ ...f, phase: trimmed }));
                                e.currentTarget.value = '';
                            }
                        }}
                    />
                    <Select
                        label="Gate Type"
                        value={form.gate || null}
                        onChange={(v) => setForm((f) => ({ ...f, gate: v || "" }))}
                        data={GATE_OPTIONS}
                        clearable
                        placeholder="Optional"
                    />
                    <MultiSelect
                        label="Tier Applicability"
                        value={form.tier_applicability}
                        onChange={(v) => setForm((f) => ({ ...f, tier_applicability: v }))}
                        data={TIER_OPTIONS}
                        placeholder="All tiers if empty"
                    />
                    <Select
                        label="Default Owner"
                        value={form.default_owner_email || null}
                        onChange={(v) => setForm((f) => ({ ...f, default_owner_email: v || "" }))}
                        data={ownerOptions}
                        searchable
                        clearable
                        placeholder="Select default assignee"
                    />
                    <NumberInput
                        label="Due Offset (days before launch)"
                        value={form.default_due_offset_days !== "" ? Number(form.default_due_offset_days) : undefined}
                        onChange={(v) => setForm((f) => ({ ...f, default_due_offset_days: v ?? "" }))}
                        placeholder="e.g., 14 = due 14 days before launch"
                        allowDecimal={false}
                        min={0}
                    />
                    <NumberInput
                        label="Sort Order"
                        value={form.sort_order}
                        onChange={(v) => setForm((f) => ({ ...f, sort_order: Number(v) || 0 }))}
                        allowDecimal={false}
                        min={0}
                    />
                    <Group justify="flex-end" mt="xl">
                        {editingId && (
                            <Button variant="outline" color="red" onClick={handleDelete} loading={saving}>
                                Delete
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => { setDrawerOpen(false); resetForm(); }}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} loading={saving}>
                            {editingId ? "Save" : "Add"}
                        </Button>
                    </Group>
                </Stack>
            </Drawer>
        </div>
    );
}
