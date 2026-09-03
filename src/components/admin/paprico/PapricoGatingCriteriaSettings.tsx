"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, Loader, NumberInput, Select, Stack, Switch, Text } from "@mantine/core";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canRolesPerform } from "@/lib/permissions";

type GatingRow = {
    criterion_id: string;
    enabled: boolean;
    lookahead_days: number | null;
    criterion: { id: string; label: string; category: string | null; is_active: boolean } | null;
};

type AvailableCriterion = { id: string; label: string; category: string | null };

export default function PapricoGatingCriteriaSettings() {
    const { data: currentUser } = useCurrentUser();
    const canWrite = canRolesPerform(currentUser?.roles ?? null, "paprico.manage");

    const [rows, setRows] = useState<GatingRow[]>([]);
    const [available, setAvailable] = useState<AvailableCriterion[]>([]);
    const [defaultLookahead, setDefaultLookahead] = useState<number>(60);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [addCriterionId, setAddCriterionId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/paprico/gating-criteria");
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Failed to load");
            setRows(body.gating_criteria ?? []);
            setAvailable(body.available_criteria ?? []);
            setDefaultLookahead(body.default_lookahead_days ?? 60);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load gating criteria");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const addOptions = useMemo(() => {
        const existing = new Set(rows.map((r) => r.criterion_id));
        return available
            .filter((c) => !existing.has(c.id))
            .map((c) => ({ value: c.id, label: c.category ? `${c.label} (${c.category})` : c.label }));
    }, [available, rows]);

    const handleAdd = () => {
        if (!addCriterionId) return;
        const criterion = available.find((c) => c.id === addCriterionId);
        setRows((prev) => [
            ...prev,
            {
                criterion_id: addCriterionId,
                enabled: true,
                lookahead_days: null,
                criterion: criterion ? { ...criterion, is_active: true } : null,
            },
        ]);
        setAddCriterionId(null);
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const res = await fetch("/api/paprico/gating-criteria", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entries: rows.map((r) => ({
                        criterion_id: r.criterion_id,
                        enabled: r.enabled,
                        lookahead_days: r.lookahead_days,
                    })),
                    default_lookahead_days: defaultLookahead,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Failed to save");
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader size="sm" />
            </div>
        );
    }

    return (
        <Stack gap="md">
            <div>
                <Text fw={600} size="sm">Gating criteria</Text>
                <Text size="xs" c="dimmed">
                    Which release criteria pull an item onto the PaPriCo agenda. Matched by criterion id —
                    renaming or renumbering a criterion never breaks the report.
                </Text>
            </div>

            {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2" role="alert">
                    {error}
                </div>
            )}

            <NumberInput
                label="Default lookahead (days)"
                description="How far ahead of the meeting date a criterion's stage date pulls an item onto the agenda"
                min={1}
                max={365}
                w={280}
                value={defaultLookahead}
                onChange={(v) => typeof v === "number" && setDefaultLookahead(v)}
                disabled={!canWrite}
            />

            <Stack gap="xs">
                {rows.length === 0 && (
                    <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-3">
                        No gating criteria configured — the agenda will only contain standing items.
                    </div>
                )}
                {rows.map((row, index) => (
                    <div key={row.criterion_id} className="border border-gray-200 rounded-lg px-4 py-3 bg-white">
                        <Group wrap="wrap" gap="sm">
                            <div className="flex-1 min-w-[220px]">
                                <Text size="sm" fw={500}>
                                    {row.criterion?.label ?? "(criterion deleted)"}
                                </Text>
                                <Group gap={6} mt={2}>
                                    {row.criterion?.category && (
                                        <Badge variant="outline" color="grape" size="xs">{row.criterion.category}</Badge>
                                    )}
                                    {row.criterion && !row.criterion.is_active && (
                                        <Badge variant="light" color="orange" size="xs">inactive</Badge>
                                    )}
                                    {!row.criterion && <Badge variant="light" color="orange" size="xs">orphaned</Badge>}
                                </Group>
                            </div>
                            <Switch
                                label="Enabled"
                                checked={row.enabled}
                                disabled={!canWrite}
                                onChange={(e) => {
                                    const enabled = e.currentTarget.checked;
                                    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, enabled } : r)));
                                }}
                            />
                            <NumberInput
                                size="xs"
                                w={150}
                                min={1}
                                max={365}
                                placeholder={`default (${defaultLookahead})`}
                                aria-label={`Lookahead days for ${row.criterion?.label ?? row.criterion_id}`}
                                value={row.lookahead_days ?? ""}
                                disabled={!canWrite}
                                onChange={(v) => {
                                    const days = typeof v === "number" ? v : null;
                                    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, lookahead_days: days } : r)));
                                }}
                                suffix=" d"
                            />
                            {canWrite && (
                                <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    color="red"
                                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                                >
                                    Remove
                                </Button>
                            )}
                        </Group>
                    </div>
                ))}
            </Stack>

            {canWrite && (
                <>
                    <Group align="flex-end" gap="sm">
                        <Select
                            label="Add a release criterion"
                            placeholder="Search criteria…"
                            data={addOptions}
                            value={addCriterionId}
                            onChange={setAddCriterionId}
                            searchable
                            clearable
                            w={380}
                        />
                        <Button variant="light" onClick={handleAdd} disabled={!addCriterionId}>
                            Add
                        </Button>
                    </Group>
                    <Group>
                        <Button onClick={handleSave} loading={saving}>Save</Button>
                        {saved && <Text size="sm" c="green">Saved.</Text>}
                    </Group>
                </>
            )}
        </Stack>
    );
}
