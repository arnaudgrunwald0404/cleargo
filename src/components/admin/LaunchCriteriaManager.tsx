"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Drawer, Button, Group, Stack, TextInput, NumberInput, Select, MultiSelect, Checkbox, Avatar, Combobox, useCombobox, InputBase, Text } from "@mantine/core";
import { IconTrash, IconPlus, IconAlertCircle } from "@tabler/icons-react";
import { useSettings } from "@/contexts/SettingsContext";
import { addLaunchCriterion, updateLaunchCriterion, deleteLaunchCriterion } from "@/lib/services/settingsService";
import { PurpleLoader } from "@/components/PurpleLoader";
import { fetchWithRateLimit } from "@/lib/fetch-with-rate-limit";

const POD_PM_PLACEHOLDER = "[name of pod's product manager]";

const TIER_OPTIONS = [
    { value: "ALL", label: "All" },
    { value: "TIER_1", label: "Tier 1" },
    { value: "TIER_2", label: "Tier 2" },
    { value: "TIER_3", label: "Tier 3" },
    { value: "TIER_1_AND_2", label: "Tier 1 & 2" },
];

export default function LaunchCriteriaManager() {
    const { launchCriteria, launchCriteriaLoading, fetchLaunchCriteria, users } = useSettings();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const sortedCriteria = useMemo(() => {
        return [...launchCriteria].sort(
            (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.label || "").localeCompare(b.label || "")
        );
    }, [launchCriteria]);

    async function submitEdit(id: string, patch: Record<string, any>) {
        setError(null);
        try {
            await updateLaunchCriterion(id, patch);
            await fetchLaunchCriteria();
        } catch (e: any) {
            setError(e.message || "Failed to update");
        }
    }

    async function handleReorder(dragId: string, _targetId: string, targetIndex: number) {
        const dragIndex = sortedCriteria.findIndex((c: any) => c.id === dragId);
        if (dragIndex === -1) return;

        const newItems = [...sortedCriteria];
        const [dragged] = newItems.splice(dragIndex, 1);
        newItems.splice(targetIndex, 0, dragged);

        const updates = newItems.map((item: any, index: number) => ({
            id: item.id,
            sort_order: index,
        }));

        try {
            const batchSize = 5;
            for (let i = 0; i < updates.length; i += batchSize) {
                const batch = updates.slice(i, i + batchSize);
                await Promise.all(
                    batch.map((u) => updateLaunchCriterion(u.id, { sort_order: u.sort_order }))
                );
                if (i + batchSize < updates.length) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
            }
            await fetchLaunchCriteria();
        } catch (e) {
            console.error("Reorder failed:", e);
            setError("Failed to reorder items");
        }
    }

    function formatOwner(email: string | null) {
        if (!email) return "—";
        if (email === POD_PM_PLACEHOLDER) return "PM of the pod";
        const user = users.find((u: any) => u.email === email);
        if (user) {
            const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
            return name || email;
        }
        return email;
    }

    function formatTierLabel(tier: any): string {
        if (!tier) return "All";
        if (Array.isArray(tier)) {
            if (tier.length === 0) return "All";
            return tier.map((t: string) => t.replace("TIER_", "T")).join(", ");
        }
        if (tier === "ALL") return "All";
        return tier.replace("TIER_", "T").replace("_AND_", " & ").replace("_ONLY", "");
    }

    const editingItem = sortedCriteria.find((c: any) => c.id === editingId);

    return (
        <div className="space-y-6">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Launch Criteria</h2>
                        <p className="text-sm text-gray-500">Tasks that auto-populate when a GTM launch is created</p>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-5 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-500">{sortedCriteria.length} criteria configured</p>
                            <button
                                onClick={() => setEditingId("__new__")}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                + New
                            </button>
                        </div>
                    </div>

                    {launchCriteriaLoading ? (
                        <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
                            <PurpleLoader size="sm" />
                            <span>Loading...</span>
                        </div>
                    ) : sortedCriteria.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-500 mb-2">No launch criteria yet.</p>
                            <p className="text-sm text-gray-400">Click &ldquo;+ New&rdquo; to add your first criterion.</p>
                        </div>
                    ) : (
                        <table className="w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Rank</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Label / Category</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">Gate</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Tier</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Days Prior</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {sortedCriteria.map((c: any, index: number) => (
                                    <tr
                                        key={c.id}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = "move";
                                            if (draggedId !== c.id) {
                                                e.currentTarget.classList.add("bg-blue-50");
                                            }
                                        }}
                                        onDragLeave={(e) => {
                                            e.currentTarget.classList.remove("bg-blue-50");
                                        }}
                                        onDrop={async (e) => {
                                            e.preventDefault();
                                            e.currentTarget.classList.remove("bg-blue-50");
                                            if (draggedId && draggedId !== c.id) {
                                                await handleReorder(draggedId, c.id, index);
                                            }
                                            setDraggedId(null);
                                        }}
                                        className={`hover:bg-gray-50 cursor-pointer ${draggedId === c.id ? "opacity-50" : ""}`}
                                        onClick={(e) => {
                                            if (!draggedId && !(e.target as HTMLElement).closest("td:first-child") && !(e.target as HTMLElement).closest("input") && !(e.target as HTMLElement).closest("[data-mantine-stop-propagation]")) {
                                                setEditingId(c.id);
                                            }
                                        }}
                                    >
                                        <td
                                            className="px-4 py-4 whitespace-nowrap text-gray-400 cursor-move"
                                            onClick={(e) => e.stopPropagation()}
                                            draggable
                                            onDragStart={(e) => {
                                                setDraggedId(c.id);
                                                e.dataTransfer.effectAllowed = "move";
                                            }}
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                            </svg>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {index + 1}
                                        </td>
                                        <td className="px-4 py-4 text-sm cursor-pointer">
                                            <div className="font-medium text-gray-900">{c.label}</div>
                                            <div className="text-gray-500 text-xs mt-0.5">{c.phase || "Uncategorized"}</div>
                                            {c.description && <div className="text-gray-400 text-xs mt-1">{c.description}</div>}
                                        </td>
                                        <td
                                            className="px-4 py-4 whitespace-nowrap"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Checkbox
                                                size="xs"
                                                checked={c.gate === "hard" || c.gate === true}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    submitEdit(c.id, { gate: e.currentTarget.checked ? "hard" : "soft" });
                                                }}
                                                aria-label="Gate"
                                            />
                                        </td>
                                        <td
                                            className="px-4 py-4 whitespace-nowrap text-sm text-gray-600"
                                            onClick={(e) => e.stopPropagation()}
                                            data-mantine-stop-propagation
                                        >
                                            <Select
                                                value={
                                                    Array.isArray(c.tier_applicability)
                                                        ? c.tier_applicability.length === 1
                                                            ? c.tier_applicability[0]
                                                            : "ALL"
                                                        : c.tier_applicability || "ALL"
                                                }
                                                onChange={(value) => {
                                                    if (!value) return;
                                                    submitEdit(c.id, { tier_applicability: value === "ALL" ? null : [value] });
                                                }}
                                                data={TIER_OPTIONS}
                                                size="xs"
                                                allowDeselect={false}
                                            />
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 truncate max-w-[180px]">
                                            {formatOwner(c.default_owner_email)}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 tabular-nums">
                                            {c.default_due_offset_days != null ? `${c.default_due_offset_days}d` : "—"}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-center">
                                            <svg className="w-5 h-5 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Edit / Create Drawer */}
            {(editingId === "__new__" || editingItem) && (
                <EditDrawer
                    item={editingItem || null}
                    opened={!!editingId}
                    onClose={() => setEditingId(null)}
                    onSave={async (patch) => {
                        if (editingId === "__new__") {
                            try {
                                await addLaunchCriterion(patch as any);
                                await fetchLaunchCriteria();
                            } catch (e: any) {
                                setError(e.message || "Failed to create");
                            }
                        } else if (editingId) {
                            await submitEdit(editingId, patch);
                        }
                        setEditingId(null);
                    }}
                    onDelete={
                        editingId !== "__new__" && editingId
                            ? async () => {
                                  try {
                                      await deleteLaunchCriterion(editingId);
                                      await fetchLaunchCriteria();
                                      setEditingId(null);
                                  } catch (e: any) {
                                      setError(e.message || "Failed to delete");
                                  }
                              }
                            : undefined
                    }
                />
            )}
        </div>
    );
}

function EditDrawer({
    item,
    opened,
    onClose,
    onSave,
    onDelete,
}: {
    item: any | null;
    opened: boolean;
    onClose: () => void;
    onSave: (patch: Record<string, any>) => void;
    onDelete?: () => void;
}) {
    const { users, launchCriteria } = useSettings();
    const [patch, setPatch] = useState<Record<string, any>>({});

    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });

    const existingPhases = useMemo(() => {
        const set = new Set<string>();
        for (const c of launchCriteria) {
            if ((c as any).phase) set.add((c as any).phase);
        }
        return Array.from(set).sort();
    }, [launchCriteria]);

    const phaseOptions = useMemo(() => existingPhases.map((p) => ({ value: p, label: p })), [existingPhases]);

    useEffect(() => {
        if (opened) {
            if (item) {
                const gateValue = item.gate === "hard" || item.gate === true;
                setPatch({
                    label: item.label || "",
                    description: item.description || "",
                    phase: item.phase || "",
                    gate: gateValue ? "hard" : "soft",
                    tier_applicability: Array.isArray(item.tier_applicability)
                        ? item.tier_applicability.length === 1
                            ? item.tier_applicability[0]
                            : "ALL"
                        : item.tier_applicability || "ALL",
                    sort_order: item.sort_order ?? 0,
                    default_owner_email: item.default_owner_email || "",
                    default_due_offset_days: item.default_due_offset_days ?? "",
                });
            } else {
                setPatch({
                    label: "",
                    description: "",
                    phase: "",
                    gate: "soft",
                    tier_applicability: "ALL",
                    sort_order: launchCriteria.length,
                    default_owner_email: "",
                    default_due_offset_days: "",
                });
            }
        }
    }, [opened, item, launchCriteria.length]);

    const ownerOptions = useMemo(() => {
        return [
            { value: "", label: "None", user: null, isPlaceholder: false },
            { value: POD_PM_PLACEHOLDER, label: "PM of the pod", user: null, isPlaceholder: true },
            ...users
                .filter((u: any) => u.email)
                .map((u: any) => ({
                    value: u.email,
                    label: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.name || u.email,
                    user: u,
                    isPlaceholder: false,
                })),
        ];
    }, [users]);

    const selectedOption = ownerOptions.find((o) => o.value === (patch.default_owner_email || ""));

    const handleSave = () => {
        if (!patch.label?.trim()) return;
        const payload: Record<string, any> = {
            label: patch.label.trim(),
            description: patch.description?.trim() || null,
            phase: patch.phase?.trim() || null,
            gate: patch.gate === "hard" ? "hard" : "soft",
            tier_applicability: patch.tier_applicability === "ALL" ? null : [patch.tier_applicability],
            sort_order: patch.sort_order ?? 0,
            default_owner_email: patch.default_owner_email || null,
            default_due_offset_days: patch.default_due_offset_days !== "" ? Number(patch.default_due_offset_days) : null,
        };
        onSave(payload);
    };

    const getInitials = (email: string, firstName?: string | null, lastName?: string | null) => {
        if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
        return email.substring(0, 2).toUpperCase();
    };

    const getColor = (email: string) => {
        const colors = ["blue", "cyan", "teal", "green", "lime", "yellow", "orange", "red", "pink", "grape", "violet", "indigo"];
        let hash = 0;
        for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title={item ? "Edit Launch Criterion" : "Add Launch Criterion"}
            position="right"
            size="xl"
            padding={0}
            styles={{
                content: {
                    overflowX: "hidden",
                },
                body: {
                    display: "flex",
                    flexDirection: "column",
                    height: "calc(100vh - 80px)",
                    overflow: "hidden",
                },
            }}
        >
            <div style={{ flex: 1, overflowY: "auto", padding: "var(--mantine-spacing-lg)", minHeight: 0 }}>
                <Stack gap="md">
                    <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                            <TextInput
                                label="Label"
                                value={patch.label || ""}
                                onChange={(e) => setPatch({ ...patch, label: e.target.value })}
                                required
                                placeholder="e.g., Prepare press release"
                            />
                        </div>
                        <div style={{ width: "120px", flexShrink: 0 }}>
                            <TextInput
                                label="Rank"
                                type="number"
                                value={(patch.sort_order ?? 0) + 1}
                                onChange={(e) => setPatch({ ...patch, sort_order: Math.max(0, Number(e.target.value) - 1) })}
                            />
                        </div>
                    </div>

                    <TextInput
                        label="Description"
                        value={patch.description || ""}
                        onChange={(e) => setPatch({ ...patch, description: e.target.value })}
                        placeholder="Optional details"
                    />

                    <Select
                        label="Category (Phase)"
                        value={patch.phase || null}
                        onChange={(v) => setPatch({ ...patch, phase: v || "" })}
                        data={phaseOptions}
                        searchable
                        allowDeselect
                        placeholder="Select or type a phase"
                    />
                    <TextInput
                        label="Or create a new phase"
                        placeholder="Type a new phase name and press Enter"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                const val = e.currentTarget.value.trim();
                                if (val) {
                                    setPatch({ ...patch, phase: val });
                                    e.currentTarget.value = "";
                                }
                            }
                        }}
                    />

                    <Checkbox
                        label="Gate (must be completed before launch)"
                        checked={patch.gate === "hard"}
                        onChange={(e) => setPatch({ ...patch, gate: e.currentTarget.checked ? "hard" : "soft" })}
                    />

                    <Select
                        label="Tier"
                        value={patch.tier_applicability || "ALL"}
                        onChange={(v) => setPatch({ ...patch, tier_applicability: v || "ALL" })}
                        data={[
                            { value: "ALL", label: "All tiers" },
                            { value: "TIER_1", label: "Tier 1" },
                            { value: "TIER_2", label: "Tier 2" },
                            { value: "TIER_3", label: "Tier 3" },
                            { value: "TIER_1_AND_2", label: "Tier 1 & 2" },
                        ]}
                    />

                    <Combobox
                        store={combobox}
                        withinPortal={false}
                        onOptionSubmit={(value) => {
                            setPatch({ ...patch, default_owner_email: value === "" ? "" : value });
                            combobox.closeDropdown();
                        }}
                    >
                        <Combobox.Target>
                            <InputBase
                                component="button"
                                type="button"
                                pointer
                                rightSection={<Combobox.Chevron />}
                                rightSectionPointerEvents="none"
                                onClick={() => combobox.toggleDropdown()}
                                label="Owner"
                            >
                                {selectedOption?.label || (
                                    <Text component="span" c="dimmed">
                                        Select an owner
                                    </Text>
                                )}
                            </InputBase>
                        </Combobox.Target>

                        <Combobox.Dropdown>
                            <Combobox.Options>
                                {ownerOptions.map((opt) => (
                                    <Combobox.Option value={opt.value} key={opt.value || "__none__"}>
                                        <Group gap="xs">
                                            {opt.user && (
                                                <Avatar
                                                    src={(opt.user as any).avatar_url || undefined}
                                                    radius="xl"
                                                    size="sm"
                                                    color={getColor(opt.user.email)}
                                                >
                                                    {getInitials(opt.user.email, (opt.user as any).first_name, (opt.user as any).last_name)}
                                                </Avatar>
                                            )}
                                            {opt.isPlaceholder && (
                                                <Avatar radius="xl" size="sm" color="gray">
                                                    PM
                                                </Avatar>
                                            )}
                                            <span>{opt.label}</span>
                                        </Group>
                                    </Combobox.Option>
                                ))}
                            </Combobox.Options>
                        </Combobox.Dropdown>
                    </Combobox>

                    <NumberInput
                        label="Days Prior to Launch"
                        value={patch.default_due_offset_days !== "" ? Number(patch.default_due_offset_days) : undefined}
                        onChange={(v) => setPatch({ ...patch, default_due_offset_days: v ?? "" })}
                        placeholder="e.g., 14 = due 14 days before launch"
                        description="How many days before launch date this should be completed"
                        allowDecimal={false}
                        min={0}
                    />
                </Stack>
            </div>
            <div
                style={{
                    borderTop: "1px solid var(--mantine-color-gray-3)",
                    padding: "20px var(--mantine-spacing-lg) 0",
                    backgroundColor: "var(--mantine-color-body)",
                    flexShrink: 0,
                }}
            >
                <Group justify={onDelete ? "space-between" : "flex-end"}>
                    {onDelete && (
                        <Button variant="outline" color="red" leftSection={<IconTrash size={16} />} onClick={onDelete}>
                            Delete
                        </Button>
                    )}
                    <Group>
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>{item ? "Save" : "Add"}</Button>
                    </Group>
                </Group>
            </div>
        </Drawer>
    );
}
