/**
 * Slack notification theme configuration
 * Allows customization of colors, emojis, and branding for Slack notifications
 */

import { getSettings } from '@/lib/settings-db';

export interface SlackThemeConfig {
    // Colors (hex codes)
    colors: {
        primary: string;        // Primary button color
        danger: string;          // Danger/error color
        warning: string;          // Warning color
        success: string;         // Success color
        info: string;            // Info color
    };
    
    // Emojis
    emojis: {
        stale: string;          // Stale criterion reminder
        risk: {
            high: string;
            medium: string;
            low: string;
        };
        decision: {
            go: string;
            conditional: string;
            noGo: string;
        };
        assignment: string;      // Criteria assignment
        nudge: {
            weekBefore: string;
            dueToday: string;
            overdue: string;
        };
        comment: string;        // Comment/attachment
        digest: string;          // Leadership digest
    };
    
    // Branding
    branding: {
        appName: string;        // App name to display
        logoUrl?: string;        // Optional logo URL
        footerText?: string;     // Optional footer text
    };
}

/**
 * Default theme configuration
 */
export const defaultSlackTheme: SlackThemeConfig = {
    colors: {
        primary: '#2196F3',      // Material Blue
        danger: '#F44336',       // Material Red
        warning: '#FF9800',      // Material Orange
        success: '#4CAF50',      // Material Green
        info: '#2196F3',         // Material Blue
    },
    emojis: {
        stale: '⏰',
        risk: {
            high: '🔴',
            medium: '🟡',
            low: '🟢',
        },
        decision: {
            go: '✅',
            conditional: '⚠️',
            noGo: '❌',
        },
        assignment: '📋',
        nudge: {
            weekBefore: '⏰',
            dueToday: '📅',
            overdue: '⚠️',
        },
        comment: '💬',
        digest: '📊',
    },
    branding: {
        appName: 'ClearGO',
        logoUrl: undefined,
        footerText: undefined,
    },
};

/**
 * Get Slack theme configuration from settings or return defaults
 */
export async function getSlackTheme(): Promise<SlackThemeConfig> {
    try {
        const settings = await getSettings();
        
        // If slack_theme is not set, return defaults
        if (!settings.slack_theme) {
            return defaultSlackTheme;
        }
        
        // Merge with defaults to ensure all fields are present
        return {
            colors: {
                ...defaultSlackTheme.colors,
                ...settings.slack_theme.colors,
            },
            emojis: {
                ...defaultSlackTheme.emojis,
                ...settings.slack_theme.emojis,
                risk: {
                    ...defaultSlackTheme.emojis.risk,
                    ...settings.slack_theme.emojis?.risk,
                },
                decision: {
                    ...defaultSlackTheme.emojis.decision,
                    ...settings.slack_theme.emojis?.decision,
                },
                nudge: {
                    ...defaultSlackTheme.emojis.nudge,
                    ...settings.slack_theme.emojis?.nudge,
                },
            },
            branding: {
                ...defaultSlackTheme.branding,
                ...settings.slack_theme.branding,
            },
        };
    } catch (error) {
        console.error('Error loading Slack theme, using defaults:', error);
        return defaultSlackTheme;
    }
}

/**
 * Convert hex color to Slack attachment color format
 * Slack accepts hex colors without the # prefix
 */
export function hexToSlackColor(hex: string): string {
    return hex.replace('#', '');
}
