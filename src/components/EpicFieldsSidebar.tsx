"use client";
import React, { useEffect, useState } from "react";
import { IconPencil } from "@tabler/icons-react";
import { Code, Text } from "@mantine/core";
import { UserDisplay } from "./UserDisplay";

type EpicFieldsSidebarProps = {
    epic: any;
    ahaFieldsToLoad?: string[];
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
    'gtm_module',
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
    'revenue_risk_analysis',
    'feature_walkthrough_demo',
    'setup_or_migration_process',
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

export default function EpicFieldsSidebar({ epic, ahaFieldsToLoad }: EpicFieldsSidebarProps) {
    const [assignedUserInfo, setAssignedUserInfo] = useState<{
        first_name?: string | null;
        last_name?: string | null;
        avatar_url?: string | null;
    } | null>(null);
    const [fieldLabels, setFieldLabels] = useState<Record<string, string> | null>(null);

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

    // Fetch field labels from AHA settings when using settings-driven field list
    useEffect(() => {
        if (!ahaFieldsToLoad || ahaFieldsToLoad.length === 0) {
            setFieldLabels(null);
            return;
        }
        fetch('/api/settings/aha-fields', { credentials: 'include' })
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (data?.fields && Array.isArray(data.fields)) {
                    const map: Record<string, string> = {};
                    for (const f of data.fields) {
                        if (f.alias && f.label) map[f.alias] = f.label;
                    }
                    setFieldLabels(map);
                } else {
                    setFieldLabels(null);
                }
            })
            .catch(() => setFieldLabels(null));
    }, [ahaFieldsToLoad?.length]);
    
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
    
    // Build ordered list of fields to display (settings order when provided, else fallback)
    const orderedFields: Array<{key: string; value: any; isWritable: boolean}> = [];
    const fieldOrderToUse = ahaFieldsToLoad && ahaFieldsToLoad.length > 0
        ? ahaFieldsToLoad.filter(k => k !== '---')
        : FIELD_ORDER;

    fieldOrderToUse.forEach(fieldKey => {
        if (fieldKey === '---') {
            orderedFields.push({ key: '---', value: null, isWritable: false });
            return;
        }

        const value = getFieldValue(fieldKey);
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

        // Handle note fields (like revenue_risk_analysis, setup_or_migration_process) that may contain long text
        if ((fieldKey === 'revenue_risk_analysis' || fieldKey === 'setup_or_migration_process') && typeof value === 'string' && value.length > 200) {
            return (
                <div className="max-h-48 overflow-auto text-left">
                    <Text size="sm" className="whitespace-pre-wrap break-words">{value}</Text>
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
            'gtm_module': 'GTM Module',
            'cleargo_candidate': 'ClearGO Candidate',
            'revenue_risk_analysis': 'Revenue & Risk Analysis',
            'feature_walkthrough_demo': 'Feature Walkthrough/Demo',
            'setup_or_migration_process': 'Setup or Migration Process',
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

    const displayLabel = (key: string): string =>
        (fieldLabels && fieldLabels[key]) ?? formatFieldLabel(key);

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
                                        {displayLabel(field.key)}
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
                                    {displayLabel(field.key)}
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
            </div>
        </div>
    );
}

