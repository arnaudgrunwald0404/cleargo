"use client";

import React, { useState } from "react";
import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { asLinkList, type ChecklistRow, type LaunchCriterionDetailSection } from "./LaunchChecklistTable";
import { isGating } from "@/lib/launch-readiness";

/**
 * One place to work a checklist row, replacing the three separate modals the
 * launch page used to open from three different cells (note, assignee, link).
 *
 * Mirrors how an epic criterion is worked: the row chevron opens this, and the
 * inline cells open the same panel focused on their own field -- the same shape
 * as CommentsModal's `initialTab` on the epic side. Deliberately NOT a copy of
 * CommentsModal: that one is threaded comments plus attachments against
 * /api/epics/..., neither of which a launch criterion has anywhere to store yet.
 *
 * All three fields go up in ONE PATCH, since /api/launch-criteria-status accepts
 * them together. Three modals meant three round trips and three ways to lose an
 * edit halfway.
 */

export interface LaunchCriterionPatch {
    owner_email?: string | null;
    notes?: string | null;
    links?: Array<{ url: string; label?: string }>;
}

interface Props {
    /** The row being worked; null closes the modal. */
    row: ChecklistRow | null;
    /** Which field to focus on open. */
    section?: LaunchCriterionDetailSection;
    userOptions: Array<{ value: string; label: string }>;
    canEdit: boolean;
    saving: boolean;
    onClose: () => void;
    /**
     * Only the fields the user actually changed. The caller validates, reports
     * failures and closes on success -- so an invalid URL leaves this open with
     * the draft intact.
     */
    onSave: (patch: LaunchCriterionPatch) => void;
}

const STATUS_LABEL: Record<string, string> = {
    NOT_STARTED: "Not started",
    IN_PROGRESS: "In progress",
    DONE: "Done",
    NOT_APPLICABLE: "Not applicable",
};

/**
 * Keyed on the row id so opening a different row remounts the body and its
 * drafts seed from that row's values. Resetting state from an effect instead
 * would fire on every background refetch and wipe an in-progress edit.
 */
export function LaunchCriterionDetailModal(props: Props) {
    if (!props.row) return null;
    return <DetailBody key={props.row.id} {...props} row={props.row} />;
}

function DetailBody({
    row,
    section = "note",
    userOptions,
    canEdit,
    saving,
    onClose,
    onSave,
}: Props & { row: ChecklistRow }) {
    const existingLink = asLinkList(row.links)[0];
    const [owner, setOwner] = useState<string | null>(row.owner_email ?? null);
    const [notes, setNotes] = useState(row.notes ?? "");
    const [url, setUrl] = useState(existingLink?.url ?? "");
    const [label, setLabel] = useState(existingLink?.label ?? "");

    const items = [...(row.items || [])].sort((a, b) => a.sort_order - b.sort_order);
    const derived = row.status_source === "items";

    const ownerChanged = (owner ?? null) !== (row.owner_email ?? null);
    const notesChanged = notes.trim() !== (row.notes ?? "").trim();
    const linkChanged =
        url.trim() !== (existingLink?.url ?? "") || label.trim() !== (existingLink?.label ?? "");
    const dirty = ownerChanged || notesChanged || linkChanged;

    const submit = () => {
        const patch: LaunchCriterionPatch = {};
        if (ownerChanged) patch.owner_email = owner;
        if (notesChanged) patch.notes = notes.trim() || null;
        if (linkChanged) {
            patch.links = url.trim()
                ? [{ url: url.trim(), ...(label.trim() ? { label: label.trim() } : {}) }]
                : [];
        }
        onSave(patch);
    };

    const doneItems = items.filter((i) => i.status === "DONE").length;
    const applicableItems = items.filter((i) => i.status !== "NOT_APPLICABLE").length;

    return (
        <Modal
            opened
            onClose={onClose}
            title={row.criterion?.label ?? "Checklist task"}
            size="lg"
            centered
        >
            <Stack gap="md">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wider text-gray-500">
                            {STATUS_LABEL[row.status] ?? row.status}
                        </span>
                        {isGating(row.criterion?.gate) && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                Gate
                            </span>
                        )}
                    </div>
                    {row.criterion?.description && (
                        <p className="text-sm text-gray-500 mt-1">{row.criterion.description}</p>
                    )}
                    {derived && (
                        <p className="text-xs text-gray-400 mt-1">
                            Status comes from the checklist items below, so it is not set here.
                        </p>
                    )}
                </div>

                <Select
                    label="Accountable"
                    placeholder="Search people..."
                    description="Leave empty to unassign."
                    data={userOptions}
                    value={owner}
                    onChange={setOwner}
                    searchable
                    clearable
                    disabled={!canEdit || saving}
                    nothingFoundMessage="No matching user"
                    comboboxProps={{ withinPortal: true }}
                    data-autofocus={section === "assignee" || undefined}
                />

                <Textarea
                    label="Note"
                    placeholder="Context, blockers, who you are waiting on..."
                    description="Visible to anyone who can see this launch. Clear it to remove."
                    value={notes}
                    onChange={(e) => setNotes(e.currentTarget.value)}
                    autosize
                    minRows={3}
                    maxRows={10}
                    disabled={!canEdit || saving}
                    data-autofocus={section === "note" || undefined}
                />

                <TextInput
                    label="Where to find it"
                    placeholder="docs.google.com/document/d/..."
                    description="Where this artifact lives. Leave blank to remove the link."
                    value={url}
                    onChange={(e) => setUrl(e.currentTarget.value)}
                    disabled={!canEdit || saving}
                    data-autofocus={section === "links" || undefined}
                />
                <TextInput
                    label="Link label (optional)"
                    placeholder="e.g. AGENT_Story-Brief_v0.1"
                    value={label}
                    onChange={(e) => setLabel(e.currentTarget.value)}
                    disabled={!canEdit || saving}
                />

                {items.length > 0 && (
                    <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">
                            Checklist items ({doneItems}/{applicableItems} done)
                        </div>
                        <ul className="space-y-1">
                            {items.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex items-baseline justify-between gap-3 text-sm"
                                >
                                    <span
                                        className={
                                            item.status === "DONE" || item.status === "NOT_APPLICABLE"
                                                ? "text-gray-400 line-through"
                                                : "text-gray-700"
                                        }
                                    >
                                        {item.label}
                                    </span>
                                    <span className="text-xs text-gray-400 flex-shrink-0">
                                        {item.owner_email || item.owner_role || "unassigned"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {/* Ticking stays in the table: the items are rows there, and
                            two places to tick the same box is how they drift. */}
                        <p className="text-xs text-gray-400 mt-2">
                            Tick these on the checklist itself.
                        </p>
                    </div>
                )}

                {canEdit && (
                    <Group justify="flex-end" gap="sm">
                        <Button variant="subtle" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={submit} loading={saving} disabled={!dirty}>
                            Save
                        </Button>
                    </Group>
                )}
            </Stack>
        </Modal>
    );
}
