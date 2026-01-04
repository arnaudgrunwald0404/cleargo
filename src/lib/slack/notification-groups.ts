/**
 * Utilities for grouping criteria for Slack notifications
 */

export interface CriterionStatus {
    id: string;
    epic_id: string;
    criterion_id: string;
    decision_owner_id: string | null;
    condition_due_date: string | null;
    status: string;
    criterion?: {
        label: string;
        category: string;
    };
    epic?: {
        name: string;
    };
    decision_owner?: {
        id: string;
        email: string;
        first_name?: string | null;
        last_name?: string | null;
        slack_handle?: string | null;
    };
}

export interface GroupedCriteria {
    epic_id: string;
    epic_name: string;
    assignee_id: string;
    assignee_email: string;
    assignee_name: string;
    assignee_slack_handle: string | null;
    criteria: Array<{
        id: string;
        criterion_id: string;
        label: string;
        category: string;
        due_date: string | null;
        status: string;
    }>;
}

/**
 * Group criteria by epic and assignee (for assignment notifications)
 * Key format: `${epic_id}:${decision_owner_id}`
 */
export function groupCriteriaByEpicAndAssignee(
    criteria: CriterionStatus[]
): Map<string, GroupedCriteria> {
    const grouped = new Map<string, GroupedCriteria>();

    for (const criterion of criteria) {
        // Skip if no assignee
        if (!criterion.decision_owner_id || !criterion.decision_owner) {
            continue;
        }

        const key = `${criterion.epic_id}:${criterion.decision_owner_id}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                epic_id: criterion.epic_id,
                epic_name: criterion.epic?.name || 'Unknown Epic',
                assignee_id: criterion.decision_owner_id,
                assignee_email: criterion.decision_owner.email,
                assignee_name:
                    `${criterion.decision_owner.first_name || ''} ${criterion.decision_owner.last_name || ''}`.trim() ||
                    criterion.decision_owner.email,
                assignee_slack_handle: criterion.decision_owner.slack_handle || null,
                criteria: [],
            });
        }

        const group = grouped.get(key)!;
        group.criteria.push({
            id: criterion.id,
            criterion_id: criterion.criterion_id,
            label: criterion.criterion?.label || 'Unknown Criterion',
            category: criterion.criterion?.category || 'Unknown',
            due_date: criterion.condition_due_date,
            status: criterion.status,
        });
    }

    return grouped;
}

/**
 * Group criteria by epic, due date, and assignee (for nudge notifications)
 * Key format: `${epic_id}:${due_date}:${decision_owner_id}`
 */
export function groupCriteriaByEpicDueDateAndAssignee(
    criteria: CriterionStatus[]
): Map<string, GroupedCriteria> {
    const grouped = new Map<string, GroupedCriteria>();

    for (const criterion of criteria) {
        // Skip if no assignee or no due date
        if (!criterion.decision_owner_id || !criterion.decision_owner || !criterion.condition_due_date) {
            continue;
        }

        // Normalize due date to YYYY-MM-DD format for grouping
        const dueDate = criterion.condition_due_date.split('T')[0];
        const key = `${criterion.epic_id}:${dueDate}:${criterion.decision_owner_id}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                epic_id: criterion.epic_id,
                epic_name: criterion.epic?.name || 'Unknown Epic',
                assignee_id: criterion.decision_owner_id,
                assignee_email: criterion.decision_owner.email,
                assignee_name:
                    `${criterion.decision_owner.first_name || ''} ${criterion.decision_owner.last_name || ''}`.trim() ||
                    criterion.decision_owner.email,
                assignee_slack_handle: criterion.decision_owner.slack_handle || null,
                criteria: [],
            });
        }

        const group = grouped.get(key)!;
        group.criteria.push({
            id: criterion.id,
            criterion_id: criterion.criterion_id,
            label: criterion.criterion?.label || 'Unknown Criterion',
            category: criterion.criterion?.category || 'Unknown',
            due_date: criterion.condition_due_date,
            status: criterion.status,
        });
    }

    return grouped;
}

