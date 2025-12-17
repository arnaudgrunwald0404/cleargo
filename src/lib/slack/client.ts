/**
 * Slack API client for Launch Readiness Console
 */

import type {
  SlackMessage,
  SlackPostMessageResponse,
  SlackUserInfoResponse,
  SlackApiResponse,
} from '@/types/slack';

const SLACK_API_BASE = 'https://slack.com/api';

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
   */
  async postMessage(message: SlackMessage): Promise<SlackPostMessageResponse> {
    const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify(message),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('Slack API error:', data.error);
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data as SlackPostMessageResponse;
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
    const response = await fetch(`${SLACK_API_BASE}/users.info?user=${userId}`, {
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('Slack API error:', data.error);
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data as SlackUserInfoResponse;
  }

  /**
   * Get user by email address
   */
  async getUserByEmail(email: string): Promise<SlackUserInfoResponse> {
    const response = await fetch(
      `${SLACK_API_BASE}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
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
   * Add a reaction to a message
   */
  async addReaction(channel: string, timestamp: string, name: string): Promise<SlackApiResponse> {
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
    const formData = new FormData();
    formData.append('channels', channels.join(','));
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
}

// Singleton instance
let slackClient: SlackClient | null = null;

export function getSlackClient(): SlackClient {
  if (!slackClient) {
    slackClient = new SlackClient();
  }
  return slackClient;
}
