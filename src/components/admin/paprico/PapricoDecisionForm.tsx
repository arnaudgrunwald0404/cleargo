"use client";

import { useState } from "react";
import { Button, Group, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { validateDecisionInput } from "@/lib/paprico/agenda";
import type { PapricoDecision, PapricoDecisionType } from "@/lib/paprico/types";

const DECISION_TYPE_OPTIONS: Array<{ value: PapricoDecisionType; label: string }> = [
    { value: "approved", label: "Approved" },
    { value: "approved_with_amendment", label: "Approved with amendment" },
    { value: "rejected", label: "Rejected" },
    { value: "deferred", label: "Deferred" },
    { value: "assigned", label: "Assigned" },
    { value: "no_decision_needed", label: "No decision needed" },
];

const OWNER_REQUIRED: PapricoDecisionType[] = ["approved", "approved_with_amendment", "assigned"];

type Props = {
    itemId: string;
    meetingId: string;
    /** When set, the new decision supersedes this one (renders a hint). */
    supersedesId?: string | null;
    onSaved: (decision: PapricoDecision) => void;
    onCancel?: () => void;
};

export default function PapricoDecisionForm({ itemId, meetingId, supersedesId, onSaved, onCancel }: Props) {
    const [decisionType, setDecisionType] = useState<PapricoDecisionType | null>(null);
    const [decisionText, setDecisionText] = useState("");
    const [rationale, setRationale] = useState("");
    const [ownerEmail, setOwnerEmail] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ownerRequired = decisionType != null && OWNER_REQUIRED.includes(decisionType);

    const handleSubmit = async () => {
        const input = {
            decision_type: decisionType,
            decision_text: decisionText,
            owner_email: ownerEmail || null,
            due_date: dueDate || null,
        };
        const validationError = validateDecisionInput(input);
        if (validationError) {
            setError(validationError);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/paprico/decisions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    item_id: itemId,
                    meeting_id: meetingId,
                    decision_type: decisionType,
                    decision_text: decisionText,
                    rationale: rationale || null,
                    owner_email: ownerEmail || null,
                    due_date: dueDate || null,
                    supersedes_id: supersedesId ?? null,
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error || "Failed to save decision");
                return;
            }
            setDecisionType(null);
            setDecisionText("");
            setRationale("");
            setOwnerEmail("");
            setDueDate("");
            onSaved(body.decision as PapricoDecision);
        } catch {
            setError("Failed to save decision");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Stack gap="sm">
            {supersedesId && (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    This decision will supersede an earlier one — both stay in the history.
                </div>
            )}
            <Select
                label="Decision type"
                placeholder="Pick a decision type"
                data={DECISION_TYPE_OPTIONS}
                value={decisionType}
                onChange={(v) => setDecisionType(v as PapricoDecisionType | null)}
                required
                searchable={false}
            />
            <Textarea
                label="Decision"
                description="What was actually decided, in one or two sentences"
                value={decisionText}
                onChange={(e) => setDecisionText(e.currentTarget.value)}
                minRows={2}
                autosize
                required
            />
            <Textarea
                label="Rationale"
                description="Why — the thing nobody ever writes down"
                value={rationale}
                onChange={(e) => setRationale(e.currentTarget.value)}
                minRows={1}
                autosize
            />
            <Group grow>
                <TextInput
                    label={ownerRequired ? "Owner (required)" : "Owner"}
                    placeholder="who executes — work email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.currentTarget.value)}
                    required={ownerRequired}
                />
                <TextInput
                    label={ownerEmail ? "Due date (required)" : "Due date"}
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.currentTarget.value)}
                    required={!!ownerEmail}
                />
            </Group>
            {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2" role="alert">
                    {error}
                </div>
            )}
            <Group justify="flex-end">
                {onCancel && (
                    <Button variant="subtle" onClick={onCancel} disabled={saving}>
                        Cancel
                    </Button>
                )}
                <Button onClick={handleSubmit} loading={saving}>
                    Record decision
                </Button>
            </Group>
        </Stack>
    );
}
