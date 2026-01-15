"use client";
import React, { useEffect, useState } from "react";
import { IconPencil } from "@tabler/icons-react";
import { Accordion, Code, Divider, ScrollArea, Stack, Text } from "@mantine/core";
import { UserDisplay } from "./UserDisplay";

type EpicFieldsSidebarProps = {
    epic: any;
};

// Fields that can be written back to AHA
const WRITABLE_FIELDS = new Set([
    'readiness_status',
    'readiness_score',
    'risk_level',
    'last_go_no_go_decision_date',
    'console_url',
    'tier',
    'target_launch_date',
]);

// Fields to hide from the sidebar
const HIDDEN_FIELDS = new Set([
    'console_url',
    'id',
]);

// Define the order of fields to display
const FIELD_ORDER = [
    'name',
    'reference_num',
    'dev_backlog_pod',
    'assigned_to_user',
    'integrations',
    'cleargo_candidate',
    '---', // Separator
    'tier',
    'tags',
    'ux_needs',
    'business_priority',
    'csm_priority',
    'modified_rice',
    'wsjf',
    'primary_goal',
    'modernization_effort',
    '---', // Separator
    't_shirt_est',
    'release',
    'reason_for_release_change',
    'aha_release_name',
    'release_target_after_pod_planning',
    'estimated_ga_release_pm_owned',
    'scheduled_ga_release_dev_only',
    'workflow_status',
    'readiness_status',
    'readiness_score',
    'risk_level',
    '---', // Separator
    'analytics_enablement',
    'pricing_model',
    'gtm_link',
    'activation_process',
    'new_org_setup',
    'existing_org_setup',
];

const AHA_STANDARD_KEYS = [
    'id',
    'reference_num',
    'name',
    'url',
    'description',
    'integrations',
    'workflow_status',
    'assigned_to_user',
    'tags',
    'release',
    'aha_release_name',
];

const DB_SYNCED_KEYS = [
    // Aha -> DB columns (plus the write-back columns we persist)
    'aha_id',
    'aha_url',
    'name',
    'tier',
    'target_launch_date',
    'scheduled_ga_dev_date',
    'owner_email',
    'product_component',
    'pod',
    'business_priority',
    'csm_priority',
    'tags',
    'modified_rice_score',
    'wsjf_score',
    'gtm_link',
    'activation_process',
    'new_org_setup',
    'existing_org_setup',
    'pricing_model',
    'readiness_status',
    'readiness_score',
    'risk_level',
    'last_go_no_go_decision_date',
    'console_url',
];

export default function EpicFieldsSidebar({ epic }: EpicFieldsSidebarProps) {
    const [assignedUserInfo, setAssignedUserInfo] = useState<{
        first_name?: string | null;
        last_name?: string | null;
        avatar_url?: string | null;
    } | null>(null);
    
    const ahaFields = epic?.aha_fields || {};
    const standardFields = ahaFields.standard_fields || {};
    const customFields = ahaFields.custom_fields || {};
    
    // Fetch user info for assigned_to_user if email is available using API endpoint
    // This works even without authentication, allowing email-to-name translation
    useEffect(() => {
        const assignedToUser = standardFields.assigned_to_user;
        if (assignedToUser?.email) {
            fetch(`/api/users/by-email?emails=${encodeURIComponent(assignedToUser.email)}`)
                .then(res => {
                    return res.ok ? res.json() : null;
                })
                .then(userMap => {
                    if (userMap && userMap[assignedToUser.email.toLowerCase()]) {
                        setAssignedUserInfo(userMap[assignedToUser.email.toLowerCase()]);
                    }
                })
                .catch(() => {
                    // User not found or API error, that's okay
                });
        }
    }, [standardFields.assigned_to_user]);
    
    // Extract writable fields from epic object (excluding hidden fields)
    const writableFields: Record<string, any> = {};
    if (epic) {
        WRITABLE_FIELDS.forEach(fieldKey => {
            if (HIDDEN_FIELDS.has(fieldKey)) return; // Skip hidden fields
            const value = epic[fieldKey];
            if (value !== null && value !== undefined) {
                writableFields[fieldKey] = value;
            }
        });
    }
    
    // Check if a field is writable (can be written back to AHA)
    const isWritable = (fieldKey: string): boolean => {
        return WRITABLE_FIELDS.has(fieldKey.toLowerCase());
    };
    
    // Get field value from appropriate source
    const getFieldValue = (fieldKey: string): any => {
        // Check epic object first (for writable fields)
        if (epic && epic[fieldKey] !== null && epic[fieldKey] !== undefined) {
            return epic[fieldKey];
        }
        // Check standard fields
        if (standardFields[fieldKey] !== null && standardFields[fieldKey] !== undefined) {
            return standardFields[fieldKey];
        }
        // Check custom fields
        if (customFields[fieldKey] !== null && customFields[fieldKey] !== undefined) {
            return customFields[fieldKey];
        }
        return null; // Return null to show "-" for empty fields
    };
    
    // Build ordered list of fields to display (including null values)
    const orderedFields: Array<{key: string; value: any; isWritable: boolean}> = [];
    
    FIELD_ORDER.forEach(fieldKey => {
        if (fieldKey === '---') {
            orderedFields.push({ key: '---', value: null, isWritable: false });
            return;
        }
        
        const value = getFieldValue(fieldKey);
        // Always add the field, even if null/undefined (will show "-")
        orderedFields.push({
            key: fieldKey,
            value,
            isWritable: isWritable(fieldKey)
        });
    });
    
    // Special handling for reference_num + url
    const formatReferenceNum = (): React.ReactNode => {
        const refNum = standardFields.reference_num;
        const url = standardFields.url || epic?.aha_url;
        
        if (!refNum && !url) return '-';
        
        if (refNum && url) {
            return (
                <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                    {refNum}
                </a>
            );
        }
        
        if (refNum) return refNum;
        if (url) {
            return (
                <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                    {url}
                </a>
            );
        }
        
        return '-';
    };

    const truncateText = (text: string, maxChars: number): string => {
        if (text.length <= maxChars) return text;
        return `${text.slice(0, maxChars)}… (truncated)`;
    };

    const safePrettyJson = (value: any, maxChars = 4000): string => {
        try {
            const json = JSON.stringify(value, null, 2);
            if (!json) return "-";
            return truncateText(json, maxChars);
        } catch {
            try {
                return truncateText(String(value), maxChars);
            } catch {
                return "-";
            }
        }
    };

    const formatValue = (value: any, fieldKey?: string): string | React.ReactNode => {
        if (value === null || value === undefined) {
            return '-';
        }
        
        if (fieldKey === 'integrations') {
            const text =
                typeof value === 'string'
                    ? value
                    : safePrettyJson(value, 6000);

            return (
                <div className="max-h-32 overflow-auto text-left">
                    <Code block>{text || '-'}</Code>
                </div>
            );
        }

        // Handle readiness_score as percentage
        if (fieldKey === 'readiness_score' && typeof value === 'number') {
            return `${Math.round(value * 100)}%`;
        }
        
        if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
        }
        
        if (typeof value === 'object') {
            if (Array.isArray(value)) {
                if (value.length === 0) return '-';
                return value.join(', ');
            }
            // Handle nested objects (e.g., assigned_to_user, release)
            if (fieldKey === 'assigned_to_user' && value.email) {
                return (
                    <UserDisplay
                        email={value.email}
                        firstName={assignedUserInfo?.first_name}
                        lastName={assignedUserInfo?.last_name}
                        avatarUrl={assignedUserInfo?.avatar_url}
                        name={value.name}
                        size="sm"
                    />
                );
            }
            if (fieldKey === 'release' && value.name) {
                return value.name;
            }
            if (value.name) return value.name;
            if (value.email) return value.email;
            return JSON.stringify(value);
        }
        
        if (typeof value === 'string') {
            // Check if it's a URL
            if (value.startsWith('http://') || value.startsWith('https://')) {
                return (
                    <a 
                        href={value} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                        {value}
                    </a>
                );
            }
            
            // Format date strings
            if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
                try {
                    return new Date(value).toLocaleDateString();
                } catch {
                    return value;
                }
            }
        }
        
        return String(value);
    };

    const formatFieldLabel = (key: string): string => {
        // Special cases for field labels
        const labelMap: Record<string, string> = {
            'cleargo_candidate': 'ClearGO Candidate',
            'csm': 'CSM',
            'wsjf': 'WSJF',
            'gtm': 'GTM',
            'ga': 'GA',
            'pm': 'PM',
            'aha': 'Aha',
            'ux': 'UX',
        };
        
        // Check if there's a custom label
        if (labelMap[key]) {
            return labelMap[key];
        }
        
        // Special cases for acronyms that should stay uppercase
        const acronymMap: Record<string, string> = {
            'csm': 'CSM',
            'wsjf': 'WSJF',
            'gtm': 'GTM',
            'ga': 'GA',
            'pm': 'PM',
            'aha': 'Aha',
            'ux': 'UX',
        };
        
        // Convert snake_case to Title Case
        return key
            .split('_')
            .map(word => {
                const lowerWord = word.toLowerCase();
                // Check if word is an acronym that should stay uppercase
                if (acronymMap[lowerWord]) {
                    return acronymMap[lowerWord];
                }
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    };

    const renderRawValue = (value: any): React.ReactNode => {
        if (value === null || value === undefined) {
            return (
                <Text size="sm" c="dimmed">
                    -
                </Text>
            );
        }

        if (typeof value === "string") {
            if (value.startsWith("http://") || value.startsWith("https://")) {
                return (
                    <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline break-words"
                    >
                        {value}
                    </a>
                );
            }
            return <Text size="sm" className="break-words">{value}</Text>;
        }

        if (typeof value === "number" || typeof value === "boolean") {
            return <Text size="sm">{String(value)}</Text>;
        }

        const json = safePrettyJson(value, 12000);
        return (
            <ScrollArea h={180} type="auto">
                <Code block>{json}</Code>
            </ScrollArea>
        );
    };

    const renderRawFieldRow = (key: string, value: any): React.ReactNode => {
        return (
            <div key={key} className="py-1">
                <Text size="xs" fw={600} c="dimmed">
                    {formatFieldLabel(key)}
                </Text>
                <div className="mt-1">{renderRawValue(value)}</div>
            </div>
        );
    };

    const buildAhaCustomKeys = (): string[] => {
        const ahaStandardKeySet = new Set(AHA_STANDARD_KEYS);
        const dbKeySet = new Set(DB_SYNCED_KEYS);

        const orderedCandidateKeys = FIELD_ORDER.filter((k) => k !== "---");
        const customKeySet = new Set<string>();

        for (const k of orderedCandidateKeys) {
            if (ahaStandardKeySet.has(k)) continue;
            if (dbKeySet.has(k)) continue;
            customKeySet.add(k);
        }

        for (const k of Object.keys(customFields || {})) {
            if (ahaStandardKeySet.has(k)) continue;
            if (dbKeySet.has(k)) continue;
            customKeySet.add(k);
        }

        const orderedFromFieldOrder = orderedCandidateKeys.filter((k) => customKeySet.has(k));
        const extras = Array.from(customKeySet)
            .filter((k) => !orderedFromFieldOrder.includes(k))
            .sort((a, b) => a.localeCompare(b));

        return [...orderedFromFieldOrder, ...extras];
    };

    return (
        <div className="w-80 mr-8 sticky mt-36">
            <div className="bg-gray-50 rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Epic Fields</h2>
                
                <div className="space-y-3">
                    {orderedFields.map((field, index) => {
                        // Handle separator
                        if (field.key === '---') {
                            return (
                                <div key={`separator-${index}`} className="border-t border-gray-200 my-4"></div>
                            );
                        }
                        
                        // Special handling for reference_num
                        if (field.key === 'reference_num') {
                            return (
                                <div key={field.key} className="flex items-start justify-between gap-4 py-1">
                                    <div className="text-xs font-medium text-gray-500 whitespace-nowrap flex items-center gap-1">
                                        Reference Num
                                        {field.isWritable && (
                                            <IconPencil size={12} className="text-blue-500" />
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-900 break-words flex-1 text-right">
                                        {formatReferenceNum()}
                                    </div>
                                </div>
                            );
                        }
                        
                        return (
                            <div key={field.key} className="flex items-start justify-between gap-4 py-1">
                                <div className="text-xs font-medium text-gray-500 whitespace-nowrap flex items-center gap-1">
                                    {formatFieldLabel(field.key)}
                                    {field.isWritable && (
                                        <IconPencil size={12} className="text-blue-500" />
                                    )}
                                </div>
                                <div className="text-sm text-gray-900 break-words flex-1 text-right">
                                    {formatValue(field.value, field.key)}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <Accordion variant="separated" className="mt-6">
                    <Accordion.Item value="synced-fields">
                        <Accordion.Control>
                            <Text size="sm" fw={600}>
                                Synced fields (raw)
                            </Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="sm">
                                <div>
                                    <Text size="xs" fw={700} c="dimmed">
                                        DB fields
                                    </Text>
                                    <Divider my="xs" />
                                    {DB_SYNCED_KEYS.map((k) => renderRawFieldRow(k, epic?.[k]))}
                                </div>

                                <div>
                                    <Text size="xs" fw={700} c="dimmed">
                                        Aha standard snapshot
                                    </Text>
                                    <Divider my="xs" />
                                    {AHA_STANDARD_KEYS.map((k) => renderRawFieldRow(k, getFieldValue(k)))}
                                </div>

                                <div>
                                    <Text size="xs" fw={700} c="dimmed">
                                        Aha custom snapshot
                                    </Text>
                                    <Divider my="xs" />
                                    {buildAhaCustomKeys().map((k) => renderRawFieldRow(k, getFieldValue(k)))}
                                </div>
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            </div>
        </div>
    );
}

