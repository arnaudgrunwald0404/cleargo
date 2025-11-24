// Aha API types and interfaces

export interface AhaCustomField {
    key: string;
    value: any;
    type?: string;
}

export interface AhaUser {
    id: string;
    name: string;
    email: string;
}

export interface AhaEpic {
    id: string;
    reference_num: string;
    name: string;
    url: string;
    workflow_status?: {
        name: string;
    };
    assigned_to_user?: AhaUser;
    tags?: string[];
    custom_fields?: Record<string, AhaCustomField>;
}

export interface AhaWebhookPayload {
    event: string;
    epic?: AhaEpic;
    audit?: {
        user: AhaUser;
        created_at: string;
    };
}

export interface AhaWriteBackPayload {
    epic: {
        custom_fields: Record<string, any>;
    };
}

export interface CustomFieldConfig {
    label: string;
    key: string;
}

export interface AhaConfig {
    workspace_ids: string[];
    fields: Record<string, CustomFieldConfig>;
}

export interface LaunchReadinessData {
    readiness_status: string | null;
    readiness_score: number | null;
    risk_level: string | null;
    last_go_no_go_decision_date: string | null;
    console_url: string | null;
}
