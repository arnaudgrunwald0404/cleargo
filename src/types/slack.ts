/**
 * Slack integration type definitions for Launch Readiness Console
 */

export type SlackNotificationType =
    | 'stale_criterion'
    | 'launch_risk_alert'
    | 'go_no_go_decision'
    | 'leadership_digest'
    | 'launch_status_change'
    | 'criterion_update'
    | 'launch_created'
    | 'delegation'
    | 'criteria_nudge'
    | 'criteria_assignment';

export type SlackMessagePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SlackUser {
    id: string;
    email: string;
    slack_handle?: string;
    name: string;
}

export interface SlackChannel {
    id: string;
    name: string;
}

export interface SlackNotificationPayload {
    type: SlackNotificationType;
    priority: SlackMessagePriority;
    recipient?: SlackUser;
    channel?: string;
    launch_id?: string;
    criterion_id?: string;
    metadata?: Record<string, any>;
}

export interface SlackMessage {
    channel: string;
    text: string;
    blocks?: SlackBlock[];
    thread_ts?: string;
    attachments?: SlackAttachment[];
}

export interface SlackBlock {
    type: string;
    [key: string]: any;
}

export interface SlackAttachment {
    color?: string;
    blocks?: SlackBlock[];
    fallback?: string;
}

export interface SlackCommandPayload {
    token: string;
    team_id: string;
    team_domain: string;
    channel_id: string;
    channel_name: string;
    user_id: string;
    user_name: string;
    command: string;
    text: string;
    api_app_id: string;
    response_url: string;
    trigger_id: string;
}

export interface SlackInteractionPayload {
    type: 'block_actions' | 'view_submission' | 'view_closed';
    user: {
        id: string;
        username: string;
        name: string;
        team_id: string;
    };
    api_app_id: string;
    token: string;
    container: any;
    trigger_id: string;
    team: {
        id: string;
        domain: string;
    };
    enterprise: any;
    is_enterprise_install: boolean;
    channel?: {
        id: string;
        name: string;
    };
    message?: any;
    state?: any;
    response_url?: string;
    actions?: SlackAction[];
    view?: any;
}

export interface SlackAction {
    type: string;
    action_id: string;
    block_id: string;
    value?: string;
    selected_option?: {
        text: { type: string; text: string };
        value: string;
    };
    action_ts: string;
}

export interface SlackEventPayload {
    token: string;
    team_id: string;
    api_app_id: string;
    event: SlackEvent;
    type: 'event_callback' | 'url_verification';
    event_id?: string;
    event_time?: number;
    challenge?: string;
}

export interface SlackEvent {
    type: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    event_ts?: string;
    channel_type?: string;
    [key: string]: any;
}

export interface SlackApiResponse {
    ok: boolean;
    error?: string;
    warning?: string;
    response_metadata?: {
        next_cursor?: string;
        warnings?: string[];
    };
}

export interface SlackPostMessageResponse extends SlackApiResponse {
    channel?: string;
    ts?: string;
    message?: {
        text: string;
        username?: string;
        bot_id?: string;
        type: string;
        ts: string;
    };
}

export interface SlackUserInfoResponse extends SlackApiResponse {
    user?: {
        id: string;
        team_id: string;
        name: string;
        deleted: boolean;
        profile: {
            email?: string;
            real_name?: string;
            display_name?: string;
            image_24?: string;
            image_32?: string;
            image_48?: string;
            image_72?: string;
            image_192?: string;
            image_512?: string;
        };
    };
}

export interface SlackConversationsOpenResponse extends SlackApiResponse {
    channel?: {
        id: string;
    };
}

export interface SlackChannelCreateResponse extends SlackApiResponse {
    channel?: {
        id: string;
        name: string;
        is_channel: boolean;
        is_group: boolean;
        is_im: boolean;
        created: number;
        creator: string;
        is_archived: boolean;
        is_general: boolean;
        unlinked: number;
        name_normalized: string;
        is_shared: boolean;
        is_org_shared: boolean;
        is_member: boolean;
        is_private: boolean;
        is_mpim: boolean;
        members: string[];
        topic: {
            value: string;
            creator: string;
            last_set: number;
        };
        purpose: {
            value: string;
            creator: string;
            last_set: number;
        };
        previous_names: string[];
        num_members: number;
    };
}
