/**
 * Slack API client for Launch Readiness Console
 */

import type {
    SlackMessage,
    SlackPostMessageResponse,
    SlackUserInfoResponse,
    SlackApiResponse,
    SlackConversationsOpenResponse,
    SlackChannelCreateResponse,
} from '@/types/slack';

const SLACK_API_BASE = 'https://slack.com/api';

function getForbiddenChannels(): Set<string> {
    const raw = process.env.SLACK_FORBIDDEN_CHANNELS || '';
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const set = new Set<string>(ids);
    for (const s of ids) {
        if (s.startsWith('#')) set.add(s.slice(1));
    }
    return set;
}

function isChannelForbiddenWithSet(channel: string, forbidden: Set<string>): boolean {
    if (forbidden.has(channel)) return true;
    if (channel.startsWith('#') && forbidden.has(channel.slice(1))) return true;
    return false;
}

/** Returns true if the channel (ID or #name) is in SLACK_FORBIDDEN_CHANNELS. */
export function isChannelForbidden(channel: string): boolean {
    return isChannelForbiddenWithSet(channel, getForbiddenChannels());
}

export class SlackClient {
    private botToken: string;

    constructor(botToken?: string) {
        this.botToken = botToken || process.env.SLACK_BOT_TOKEN || '';
        if (!this.botToken) {
            throw new Error('SLACK_BOT_TOKEN is required');
        }
    }

    /**
     * Post a message to a Slack channel or user
     * Includes retry logic for rate limiting (429 errors)
     */
    async postMessage(message: SlackMessage, retries = 3): Promise<SlackPostMessageResponse> {
        const forbidden = getForbiddenChannels();
        if (isChannelForbiddenWithSet(message.channel, forbidden)) {
            console.warn(`Slack: skipping postMessage to forbidden channel ${message.channel}`);
            return { ok: true };
        }

        for (let attempt = 0; attempt <= retries; attempt++) {
            const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.botToken}`,
                },
                body: JSON.stringify(message),
            });

            const data = await response.json();

            if (data.ok) {
                return data as SlackPostMessageResponse;
            }

            // Handle rate limiting (429) with retry
            if (data.error === 'rate_limited' && attempt < retries) {
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter 
                    ? parseInt(retryAfter, 10) * 1000 
                    : Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
                
                console.warn(`Slack rate limited, waiting ${waitTime}ms before retry (attempt ${attempt + 1}/${retries + 1})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            // For other errors or final attempt, throw
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        throw new Error('Slack API: Max retries exceeded');
    }

    /**
     * Delete a message (only messages posted by this bot)
     */
    async deleteMessage(channel: string, ts: string): Promise<SlackApiResponse> {
        const response = await fetch(`${SLACK_API_BASE}/chat.delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.botToken}`,
            },
            body: JSON.stringify({ channel, ts }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data;
    }

    /**
     * Update an existing message
     */
    async updateMessage(
        channel: string,
        ts: string,
        message: Partial<SlackMessage>
    ): Promise<SlackApiResponse> {
        const response = await fetch(`${SLACK_API_BASE}/chat.update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.botToken}`,
            },
            body: JSON.stringify({
                channel,
                ts,
                ...message,
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data;
    }

    /**
     * Get user information by user ID
     */
    async getUserInfo(userId: string): Promise<SlackUserInfoResponse> {
        const response = await fetch(
            `${SLACK_API_BASE}/users.info?user=${userId}`,
            {
                headers: {
                    Authorization: `Bearer ${this.botToken}`,
                },
            }
        );

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data as SlackUserInfoResponse;
    }

    /**
     * Get user by email address.
     * Uses lowercase for lookup so Slack finds the user regardless of DB email casing.
     */
    async getUserByEmail(email: string): Promise<SlackUserInfoResponse> {
        const normalizedEmail = email?.trim().toLowerCase() || '';
        const response = await fetch(
            `${SLACK_API_BASE}/users.lookupByEmail?email=${encodeURIComponent(normalizedEmail)}`,
            {
                headers: {
                    Authorization: `Bearer ${this.botToken}`,
                },
            }
        );

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data as SlackUserInfoResponse;
    }

    /**
     * Open a direct message conversation with a user
     * Returns the channel ID for the DM conversation
     */
    async openConversation(userId: string): Promise<string> {
        return this.openMultiUserConversation([userId]);
    }

    /**
     * Open a DM or multi-party DM with one or more users (1-8).
     * Returns the channel ID for the conversation.
     */
    async openMultiUserConversation(userIds: string[]): Promise<string> {
        if (userIds.length === 0) {
            throw new Error('At least one user ID is required for conversations.open');
        }
        const response = await fetch(`${SLACK_API_BASE}/conversations.open`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.botToken}`,
            },
            body: JSON.stringify({
                users: userIds.join(','),
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error opening conversation:', data.error);
            throw new Error(`Failed to open conversation: ${data.error}`);
        }

        const openResponse = data as SlackConversationsOpenResponse;
        if (!openResponse.channel?.id) {
            throw new Error('No channel ID returned from conversations.open');
        }

        return openResponse.channel.id;
    }

    /**
     * Add a reaction to a message
     */
    async addReaction(
        channel: string,
        timestamp: string,
        name: string
    ): Promise<SlackApiResponse> {
        const response = await fetch(`${SLACK_API_BASE}/reactions.add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.botToken}`,
            },
            body: JSON.stringify({
                channel,
                timestamp,
                name,
            }),
        });

        const data = await response.json();

        if (!data.ok && data.error !== 'already_reacted') {
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data;
    }

    /**
     * Upload a file to Slack
     */
    async uploadFile(
        channels: string[],
        file: Buffer | string,
        filename: string,
        title?: string,
        initialComment?: string
    ): Promise<SlackApiResponse> {
        const forbidden = getForbiddenChannels();
        const allowed = channels.filter((c) => !isChannelForbiddenWithSet(c, forbidden));
        if (allowed.length === 0) {
            console.warn(`Slack: skipping uploadFile to forbidden channel(s) ${channels.join(', ')}`);
            return { ok: true };
        }
        const formData = new FormData();
        formData.append('channels', allowed.join(','));
        formData.append('file', file as any, filename);
        if (title) formData.append('title', title);
        if (initialComment) formData.append('initial_comment', initialComment);

        const response = await fetch(`${SLACK_API_BASE}/files.upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.botToken}`,
            },
            body: formData,
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data;
    }

    /**
     * Open a modal view
     */
    async openView(triggerId: string, view: any): Promise<SlackApiResponse> {
        const response = await fetch(`${SLACK_API_BASE}/views.open`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.botToken}`,
            },
            body: JSON.stringify({
                trigger_id: triggerId,
                view,
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data;
    }

    /**
     * Update a modal view
     */
    async updateView(viewId: string, view: any, hash?: string): Promise<SlackApiResponse> {
        const response = await fetch(`${SLACK_API_BASE}/views.update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.botToken}`,
            },
            body: JSON.stringify({
                view_id: viewId,
                view,
                hash,
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data;
    }

    /**
     * Publish a view to App Home
     */
    async publishHomeView(userId: string, view: any): Promise<SlackApiResponse> {
        const response = await fetch(`${SLACK_API_BASE}/views.publish`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.botToken}`,
            },
            body: JSON.stringify({
                user_id: userId,
                view,
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data;
    }

    /**
     * Create a new Slack channel
     * @param name Channel name (without #, will be normalized by Slack)
     * @param isPrivate Whether the channel should be private (default: false)
     * @returns Channel creation response with channel details
     */
    async createChannel(name: string, isPrivate: boolean = false): Promise<SlackChannelCreateResponse> {
        const response = await fetch(`${SLACK_API_BASE}/conversations.create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.botToken}`,
            },
            body: JSON.stringify({
                name: name.replace(/^#/, ''), // Remove # if present
                is_private: isPrivate,
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error creating channel:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data as SlackChannelCreateResponse;
    }

    /**
     * Invite users to a Slack channel
     * @param channelId Channel ID to invite users to
     * @param userIds Array of Slack user IDs to invite
     * @returns API response
     */
    async inviteUsersToChannel(channelId: string, userIds: string[]): Promise<SlackApiResponse> {
        const response = await fetch(`${SLACK_API_BASE}/conversations.invite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.botToken}`,
            },
            body: JSON.stringify({
                channel: channelId,
                users: userIds.join(','),
            }),
        });

        const data = await response.json();

        // Handle case where user is already in channel (not a fatal error)
        if (!data.ok) {
            if (data.error === 'already_in_channel' || data.error === 'cant_invite_self') {
                console.log(`User(s) already in channel or is creator: ${data.error}`);
                return data; // Return the response anyway, it's not a critical error
            }
            console.error('Slack API error inviting users:', data.error);
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data;
    }
}

// Singleton instance
let slackClient: SlackClient | null = null;

export function getSlackClient(): SlackClient {
    if (!slackClient) {
        slackClient = new SlackClient();
    }
    return slackClient;
}
