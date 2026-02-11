"use client";
import { useState, useEffect } from "react";
import { Select, Avatar, Modal, Button, Group, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconChevronRight, IconPencil, IconPaperclip, IconMessageCircle, IconArrowsRightLeft, IconLink, IconDatabase, IconFileText } from "@tabler/icons-react";
import { UserDisplay } from "./UserDisplay";
import { UserDisplayWithDelegation } from "./UserDisplayWithDelegation";
import { FileAttachmentModal } from "./FileAttachmentModal";
import { CommentsModal } from "./CommentsModal";
import { DelegationModal, DelegationType } from "./DelegationModal";
import { createClient } from "@/lib/supabase/client";
import { canRolesPerform } from "@/lib/permissions";
import { getCachedUsers } from "@/lib/cache/usersCache";
import { fetchWithRateLimit } from "@/lib/fetch-with-rate-limit";

type MatrixItem = {
    id: string;
    status: string;
    current_status_notes?: string;
    condition_due_date?: string | null;
    last_updated_at?: string | null;
    approverEmail?: string | null;
    approverInfo?: {
        first_name?: string;
        last_name?: string;
        avatar_url?: string;
    } | null;
    notRequired?: boolean;
    commentCount?: number;
    lastComment?: {
        comment_text: string;
        created_at: string;
        updated_at?: string | null;
        created_by?: {
            email: string;
            first_name?: string;
            last_name?: string;
        };
    };
    attachmentCount?: number;
    data_source_values?: Record<string, string> | null;
    criterion: {
        id: string;
        label: string;
        category: string;
        gate: boolean;
        description?: string;
        sort_order?: number;
        decision_owner_email?: string | null;
        rating_timing?: number | null;
        status_definition_go?: string;
        status_definition_conditional?: string;
        status_definition_no_go?: string;
        data_sources?: Array<{ type: string; value: string; label?: string }> | null;
    };
};

// Traffic light (Go/No-Go score: GO / CONDITIONAL / NO_GO / NOT_APPLICABLE)
interface TrafficLightProps {
    currentStatus: string;
    onStatusChange: (status: string) => void;
    disabled: boolean;
    definitions: {
        go?: string;
        conditional?: string;
        no_go?: string;
    };
    isMobile?: boolean;
    showNotApplicable?: boolean;
}

function TrafficLight({ currentStatus, onStatusChange, disabled, definitions, isMobile = false, showNotApplicable = false }: TrafficLightProps) {
    const baseLights = [
        { 
            value: 'GO', 
            color: '#10b981', // green
            greyColor: '#d1d5db',
            label: 'GO',
            definition: definitions.go || 'Meets all requirements'
        },
        { 
            value: 'CONDITIONAL', 
            color: 'var(--color-conditional-alloy, #FFA680)', // Alloy - middle traffic light
            greyColor: '#d1d5db',
            label: 'CONDITIONAL',
            definition: definitions.conditional || 'Meets requirements with conditions'
        },
        { 
            value: 'NO_GO', 
            color: '#ef4444', // red
            greyColor: '#d1d5db',
            label: 'NO GO',
            definition: definitions.no_go || 'Does not meet requirements'
        },
    ];
    const naLight = {
        value: 'NOT_APPLICABLE',
        color: 'var(--nav-bg, #37352A)', // same dark as nav bar when selected
        greyColor: 'transparent',
        label: 'n/a',
        definition: 'Not applicable; neutral to readiness score'
    };
    const lights = showNotApplicable ? [...baseLights, naLight] : baseLights;

    const buttonSize = isMobile ? 32 : 24;
    const gap = isMobile ? '12px' : '8px';
    const isNaLight = (light: typeof baseLights[0] | typeof naLight) => light.value === 'NOT_APPLICABLE';

    return (
        <div style={{ display: 'flex', gap, alignItems: 'center' }}>
            {lights.map((light) => {
                const isSelected = currentStatus === light.value;
                const isNotSet = currentStatus === 'NOT_SET';
                const showLabelInCircle = isNaLight(light);
                
                return (
                    <Tooltip
                        key={light.value}
                        label={
                            <div style={{ maxWidth: 400, whiteSpace: 'normal' }}>
                                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem' }}>{light.label}</div>
                                <div style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{light.definition}</div>
                            </div>
                        }
                        position="top"
                        withArrow
                        multiline
                        styles={{
                            tooltip: {
                                maxWidth: 400,
                                padding: '12px 16px',
                            }
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!disabled) onStatusChange(light.value);
                            }}
                            disabled={disabled}
                            style={{
                                width: buttonSize,
                                height: buttonSize,
                                minWidth: buttonSize,
                                minHeight: buttonSize,
                                borderRadius: '50%',
                                border: isSelected ? `3px solid ${light.color}` : '2px solid #e5e7eb',
                                backgroundColor: isSelected ? light.color : light.greyColor,
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                                opacity: disabled ? 0.5 : 1,
                                boxShadow: isSelected ? `0 0 8px ${light.color}66` : 'none',
                                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => {
                                if (!disabled && !isSelected) {
                                    e.currentTarget.style.backgroundColor = `${light.color}40`;
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!disabled && !isSelected) {
                                    e.currentTarget.style.backgroundColor = light.greyColor;
                                    e.currentTarget.style.transform = 'scale(1)';
                                }
                            }}
                        >
                            {showLabelInCircle && (
                                <span
                                    style={{
                                        fontSize: isMobile ? 10 : 8,
                                        fontWeight: 600,
                                        color: isSelected ? '#fff' : '#6b7280',
                                        lineHeight: 1,
                                        textTransform: 'lowercase',
                                    }}
                                >
                                    n/a
                                </span>
                            )}
                        </button>
                    </Tooltip>
                );
            })}
        </div>
    );
}

const getInitials = (email: string, firstName?: string | null, lastName?: string | null): string => {
    if (firstName && lastName) {
        return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    if (firstName) {
        return firstName.substring(0, 2).toUpperCase();
    }
    if (lastName) {
        return lastName.substring(0, 2).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
};

const getDisplayName = (firstName?: string | null, lastName?: string | null, email?: string | null): string => {
    if (firstName && lastName) {
        return `${firstName} ${lastName.charAt(0)}.`;
    }
    if (firstName) {
        return firstName;
    }
    if (lastName) {
        return lastName;
    }
    if (email) {
        return email.split('@')[0];
    }
    return 'Unknown';
};

const getAvatarColor = (email: string) => {
    const colors = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'indigo'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
        hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

type Props = {
    epicId: string;
    epicName: string;
    epicStatus?: string; // To determine if launched
    items: MatrixItem[];
    onUpdate: () => void;
    epic?: { aha_fields?: Record<string, any> | null; jira_epic_key?: string | null } | null;
    showNotApplicable?: boolean;
};

export default function Matrix({ epicId, epicName, epicStatus, items, onUpdate, epic, showNotApplicable = false }: Props) {
    // Helper function to check if a data source has data for this epic
    const hasDataSourceData = (item: MatrixItem, source: { type: string; value: string }, index: number): boolean => {
        if (source.type === 'success_metrics_defined') {
            return hasSuccessMetrics;
        } else if (source.type === 'aha_field' && source.value) {
            const ahaFieldsStruct = epic?.aha_fields as any;
            const standardFields = ahaFieldsStruct?.standard_fields || {};
            const customFields = ahaFieldsStruct?.custom_fields || {};
            
            // Check standard fields first
            if (standardFields[source.value] !== null && standardFields[source.value] !== undefined) {
                const fieldValue = standardFields[source.value];
                // Check if value is non-empty
                if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '' && 
                    !(Array.isArray(fieldValue) && fieldValue.length === 0)) {
                    return true;
                }
            }
            // Then check custom fields
            if (customFields[source.value] !== null && customFields[source.value] !== undefined) {
                const fieldValue = customFields[source.value];
                // Check if value is non-empty
                if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '' &&
                    !(Array.isArray(fieldValue) && fieldValue.length === 0)) {
                    return true;
                }
            }
            return false;
        } else if (source.type === 'aha_description_part' && source.value) {
            const ahaFieldsStruct = epic?.aha_fields as any;
            const standardFields = ahaFieldsStruct?.standard_fields || {};
            const description = standardFields.description;
            
            if (description) {
                let htmlContent: string | null = null;
                // Handle both object format (with body property) and string format
                if (typeof description === 'string') {
                    htmlContent = description;
                } else if (typeof description === 'object' && description !== null && 'body' in description) {
                    htmlContent = typeof description.body === 'string' ? description.body : null;
                }
                
                if (htmlContent) {
                    // Parse HTML table to check if keyword exists in a table row
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(htmlContent, 'text/html');
                        const rows = doc.querySelectorAll('tr');
                        const keyword = source.value.toLowerCase();
                        
                        for (const row of rows) {
                            const cells = row.querySelectorAll('td, th');
                            if (cells.length >= 2) {
                                const firstCell = cells[0];
                                if (firstCell.hasAttribute('colspan')) {
                                    continue;
                                }
                                const firstCellText = firstCell.textContent?.trim().toLowerCase() || '';
                                if (firstCellText && firstCellText.includes(keyword)) {
                                    // Check if second cell has content
                                    const secondCell = cells[1];
                                    const secondCellText = secondCell.textContent?.trim() || '';
                                    const secondCellHTML = secondCell.innerHTML?.trim() || '';
                                    if (secondCellText && secondCellHTML) {
                                        return true;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Fallback to simple text search if parsing fails
                        const keyword = source.value.toLowerCase();
                        const descriptionText = htmlContent.toLowerCase();
                        if (descriptionText.includes(keyword)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        } else if (source.type === 'url') {
            // Check if URL exists in data_source_values
            const urlValue = item.data_source_values?.[index.toString()];
            return !!(urlValue && typeof urlValue === 'string' && urlValue.trim() !== '');
        } else if (source.type === 'jira_jql') {
            // For Jira sources, ONLY show favicon if URL is saved in database
            // Check if a Jira URL was saved in data_source_values
            const savedValue = item.data_source_values?.[index.toString()];
            if (savedValue) {
                if (typeof savedValue === 'string') {
                    // Check if it's a Jira URL
                    const urlStr = savedValue.trim();
                    if (urlStr !== '') {
                        try {
                            const url = new URL(urlStr);
                            const isJiraUrl = url.hostname.includes('atlassian.net') || url.hostname.includes('jira');
                            if (isJiraUrl) {
                                console.log(`✅ Jira source has saved URL: ${urlStr} for item ${item.id}, source ${index}`);
                                return true; // Show favicon when URL is saved
                            }
                        } catch {
                            // If it's not a valid URL but is a non-empty string, still consider it saved
                            console.log(`✅ Jira source has saved value (non-URL string): ${urlStr} for item ${item.id}, source ${index}`);
                            return true;
                        }
                    }
                }
                // Could be an object with url property
                if (typeof savedValue === 'object' && savedValue !== null && 'url' in savedValue) {
                    const urlStr = (savedValue as any).url;
                    if (typeof urlStr === 'string' && urlStr.trim() !== '') {
                        try {
                            const url = new URL(urlStr);
                            const isJiraUrl = url.hostname.includes('atlassian.net') || url.hostname.includes('jira');
                            if (isJiraUrl) {
                                console.log(`✅ Jira source has saved URL object: ${urlStr} for item ${item.id}, source ${index}`);
                                return true; // Show favicon when URL is saved
                            }
                        } catch {
                            // If it's not a valid URL but is a non-empty string, still consider it saved
                            console.log(`✅ Jira source has saved value object (non-URL string): ${urlStr} for item ${item.id}, source ${index}`);
                            return true;
                        }
                    }
                }
            }
            // Don't show favicon if only epic key exists but URL is not saved
            return false;
        }
        return false;
    };
    
    // Helper function to build Jira URL from epic key and JQL template
    const buildJiraUrl = (source: { type: string; value: string }, epicKey: string | null | undefined, domain: string | null): string | null => {
        if (source.type !== 'jira_jql' || !epicKey || !domain) return null;
        
        const defaultJql = 'parent = {{JIRA_EPIC}} and statusCategory != Done';
        const template = (source.value || '').trim() || defaultJql;
        const jql = template.replace(/\{\{JIRA_EPIC\}\}/g, epicKey);
        
        const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return `https://${cleanDomain}/issues?jql=${encodeURIComponent(jql)}`;
    };

    // Helper function to get data source icons
    const getDataSourceIcon = (sourceType: string) => {
        switch (sourceType) {
            case 'aha_field':
                return IconDatabase;
            case 'aha_description_part':
                return IconFileText;
            case 'url':
                return IconLink;
            case 'success_metrics_defined':
                return null; // Will use emoji instead
            default:
                return IconDatabase;
        }
    };

    // Helper function to get field label for aha_field types
    const getFieldLabel = (fieldAlias: string): string => {
        const standardFieldLabels: Record<string, string> = {
            'id': 'ID',
            'reference_num': 'Reference Number',
            'name': 'Name',
            'url': 'URL',
            'description': 'Description',
            'workflow_status': 'Workflow Status',
            'assigned_to_user': 'Assigned To User',
            'tags': 'Tags',
            'release': 'Release',
        };
        
        if (standardFieldLabels[fieldAlias]) {
            return standardFieldLabels[fieldAlias];
        }
        
        // For custom fields, format the alias to a readable label
        const acronymMap: Record<string, string> = {
            'csm': 'CSM',
            'wsjf': 'WSJF',
            'gtm': 'GTM',
            'ga': 'GA',
            'pm': 'PM',
            'aha': 'Aha',
            'arr': 'ARR',
            'ux': 'UX',
        };
        
        return fieldAlias
            .split('_')
            .map(word => {
                const lowerWord = word.toLowerCase();
                if (acronymMap[lowerWord]) {
                    return acronymMap[lowerWord];
                }
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    };

    // Helper function to get tooltip label for data source
    const getDataSourceTooltip = (source: { type: string; value: string; label?: string }, ticketCount?: number): string => {
        if (source.type === 'aha_field') {
            const fieldLabel = getFieldLabel(source.value);
            return `Synced from Aha: ${fieldLabel}`;
        } else if (source.type === 'aha_description_part') {
            return `Synced from Aha description: ${source.value}`;
        } else if (source.type === 'url') {
            const displayLabel = source.label || 'URL';
            return `Synced from ${displayLabel}`;
        } else if (source.type === 'jira_jql') {
            const countText = ticketCount !== undefined && ticketCount !== null 
                ? `${ticketCount} issue${ticketCount !== 1 ? 's' : ''} open`
                : 'Jira tickets';
            return `Synced from ${countText}`;
        } else if (source.type === 'success_metrics_defined') {
            return 'Synced from success metrics';
        }
        return '';
    };
    
    const [editingId, setEditingId] = useState<string | null>(null);
    const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
    const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({});
    const [optimisticComments, setOptimisticComments] = useState<Record<string, { comment_text: string; created_at: string; created_by?: { email: string; first_name?: string; last_name?: string } }>>({});
    const [optimisticApprovers, setOptimisticApprovers] = useState<Record<string, { email: string; first_name?: string; last_name?: string; avatar_url?: string }>>({});
    const [hoveredAvatarId, setHoveredAvatarId] = useState<string | null>(null);
    const [jiraTicketCounts, setJiraTicketCounts] = useState<Record<string, number>>({}); // key: `${itemId}-${sourceIndex}`
    const [jiraDomain, setJiraDomain] = useState<string | null>(null);
    const [hasSuccessMetrics, setHasSuccessMetrics] = useState<boolean>(false);
    const [loadingSuccessMetrics, setLoadingSuccessMetrics] = useState<boolean>(true);
    
    // Fetch success metrics count when epic changes
    useEffect(() => {
        const fetchSuccessMetrics = async () => {
            setLoadingSuccessMetrics(true);
            try {
                const response = await fetch(`/api/epics/${epicId}/success/metrics`, {
                    credentials: 'include',
                });
                if (response.ok) {
                    const metrics = await response.json();
                    const hasMetrics = Array.isArray(metrics) && metrics.length > 0;
                    setHasSuccessMetrics(hasMetrics);
                    if (!hasMetrics) {
                        console.log(`No success metrics found for epic ${epicId}`);
                    } else {
                        console.log(`Found ${metrics.length} success metrics for epic ${epicId}`);
                    }
                } else {
                    console.error(`Failed to fetch success metrics: ${response.status} ${response.statusText}`);
                    setHasSuccessMetrics(false);
                }
            } catch (error) {
                console.error('Error fetching success metrics:', error);
                setHasSuccessMetrics(false);
            } finally {
                setLoadingSuccessMetrics(false);
            }
        };

        fetchSuccessMetrics();
    }, [epicId]);

    // Fetch Jira domain and ticket counts when epic changes
    useEffect(() => {
        if (!epic?.jira_epic_key) return;

        const fetchJiraData = async () => {
            // Fetch Jira domain from settings
            try {
                const settingsResponse = await fetchWithRateLimit('/api/settings', {
                    credentials: 'include',
                });
                if (settingsResponse.ok) {
                    const settings = await settingsResponse.json();
                    if (settings.jira_domain) {
                        setJiraDomain(settings.jira_domain);
                    }
                }
            } catch (error) {
                console.error('Error fetching Jira domain:', error);
            }

            // Fetch ticket counts for all Jira sources
            const counts: Record<string, number> = {};
            for (const item of items) {
                if (!item.criterion.data_sources) continue;
                item.criterion.data_sources.forEach((source, sourceIndex) => {
                    if (source.type === 'jira_jql' && epic.jira_epic_key) {
                        const defaultJql = 'parent = {{JIRA_EPIC}} and statusCategory != Done';
                        const template = (source.value || '').trim() || defaultJql;
                        const jql = template.replace(/\{\{JIRA_EPIC\}\}/g, epic.jira_epic_key);
                        
                        // Fetch ticket count
                        fetch(`/api/jira/search-issues?jql=${encodeURIComponent(jql)}`, {
                            credentials: 'include',
                        })
                            .then(res => res.json())
                            .then(data => {
                                if (data.count !== undefined) {
                                    counts[`${item.id}-${sourceIndex}`] = data.count;
                                    setJiraTicketCounts(prev => ({ ...prev, [`${item.id}-${sourceIndex}`]: data.count }));
                                }
                            })
                            .catch(error => {
                                console.error(`Error fetching Jira tickets for ${item.id}-${sourceIndex}:`, error);
                            });
                    }
                });
            }
        };

        fetchJiraData();
    }, [epic?.jira_epic_key, items.map(i => i.id).join(',')]); // Re-fetch when epic key or items change

    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
        () => {
            // All categories expanded by default
            return new Set();
        }
    );
    
    // Track which items are shown within each category
    const [shownItems, setShownItems] = useState<Set<string>>(() => {
        const shown = new Set<string>();
        // Initialize based on the rules
        const categoryGroups = items.reduce((acc, item) => {
            const cat = item.criterion.category || 'OTHER';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(item);
            return acc;
        }, {} as Record<string, MatrixItem[]>);
        
        Object.keys(categoryGroups).forEach(cat => {
            const categoryItems = categoryGroups[cat];
            const hasSignoff = categoryItems.some(item => 
                item.criterion.label?.toLowerCase().includes('signoff')
            );
            
            if (hasSignoff) {
                // Show signoff items, hide others
                categoryItems.forEach(item => {
                    if (item.criterion.label?.toLowerCase().includes('signoff')) {
                        shown.add(item.id);
                    }
                });
            } else {
                // Show required items, hide non-required
                categoryItems.forEach(item => {
                    if (!item.notRequired) {
                        shown.add(item.id);
                    }
                });
            }
        });
        
        return shown;
    });
    // Removed notes editing - using comments instead
    const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
    const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);
    const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
    const [selectedItemForAttachment, setSelectedItemForAttachment] = useState<MatrixItem | null>(null);
    const [commentsModalOpen, setCommentsModalOpen] = useState(false);
    const [selectedItemForComments, setSelectedItemForComments] = useState<MatrixItem | null>(null);
    const [commentsModalInitialTab, setCommentsModalInitialTab] = useState<'content' | 'comments'>('content');
    const [pendingStatusChange, setPendingStatusChange] = useState<{ itemId: string; status: string; previousStatus: string } | null>(null);
    const [delegationModalOpen, setDelegationModalOpen] = useState(false);
    const [selectedItemForDelegation, setSelectedItemForDelegation] = useState<MatrixItem | null>(null);

    // Get current user email and check if Super Admin
    useEffect(() => {
        const fetchCurrentUser = async () => {
            try {
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user?.email) {
                    setCurrentUserEmail(user.email);
                    
                    // Direct database query (avoiding /api/me to prevent rate limiting)
                    const { data: appUser, error: appUserError } = await supabase
                        .from('app_user')
                        .select('roles, role')
                        .eq('email', user.email)
                        .single();
                    
                    
                    // Handle case where appUser might be an array (shouldn't happen with .single(), but handle it)
                    const userData = Array.isArray(appUser) ? appUser[0] : appUser;
                    
                    // Handle both 'roles' array and legacy 'role' string field
                    let roles: string[] = [];
                    if (userData?.roles) {
                        if (Array.isArray(userData.roles) && userData.roles.length > 0) {
                            roles = userData.roles;
                        } else if (typeof userData.roles === 'string') {
                            roles = [userData.roles];
                        }
                    } else if (userData?.role && typeof userData.role === 'string') {
                        roles = [userData.role];
                    }
                    
                    
                    if (roles.length > 0) {
                        setCurrentUserRoles(roles);
                    } else {
                        // Set empty array explicitly so component knows roles were checked
                        setCurrentUserRoles([]);
                    }
                }
            } catch (error) {
                console.error('Failed to get current user:', error);
            }
        };
        fetchCurrentUser();
    }, []);

    // Auto-clear optimistic approvers when real data matches
    useEffect(() => {
        if (Object.keys(optimisticApprovers).length === 0) return;
        
        // Check each optimistic approver against real data
        const toClear: string[] = [];
        Object.entries(optimisticApprovers).forEach(([itemId, optimisticApprover]) => {
            const realItem = items.find(item => item.id === itemId);
            if (realItem && realItem.approverEmail?.toLowerCase() === optimisticApprover.email.toLowerCase()) {
                // Real data matches optimistic - safe to clear
                toClear.push(itemId);
            }
        });
        
        if (toClear.length > 0) {
            setOptimisticApprovers(prev => {
                const next = { ...prev };
                toClear.forEach(itemId => delete next[itemId]);
                return next;
            });
        }
    }, [items, optimisticApprovers]);

    // Auto-clear optimistic statuses when real data matches
    useEffect(() => {
        if (Object.keys(optimisticStatuses).length === 0) return;
        
        // Check each optimistic status against real data
        const toClear: string[] = [];
        Object.entries(optimisticStatuses).forEach(([itemId, optimisticStatus]) => {
            const realItem = items.find(item => item.id === itemId);
            if (realItem && realItem.status === optimisticStatus) {
                // Real data matches optimistic - safe to clear
                toClear.push(itemId);
            }
        });
        
        if (toClear.length > 0) {
            setOptimisticStatuses(prev => {
                const next = { ...prev };
                toClear.forEach(itemId => delete next[itemId]);
                return next;
            });
        }
    }, [items, optimisticStatuses]);

    // Auto-clear optimistic comments when real data matches
    useEffect(() => {
        if (Object.keys(optimisticComments).length === 0) return;
        
        // Check each optimistic comment against real data
        const toClear: string[] = [];
        Object.entries(optimisticComments).forEach(([itemId, optimisticComment]) => {
            const realItem = items.find(item => item.id === itemId);
            if (realItem && realItem.lastComment) {
                // Check if real comment matches optimistic (by content and approximate time)
                const realCommentText = realItem.lastComment.comment_text.replace(/<[^>]*>/g, '').trim().toLowerCase();
                const optimisticCommentText = optimisticComment.comment_text.replace(/<[^>]*>/g, '').trim().toLowerCase();
                const realTime = new Date(realItem.lastComment.created_at).getTime();
                const optimisticTime = new Date(optimisticComment.created_at).getTime();
                const timeDiff = Math.abs(realTime - optimisticTime);
                
                if (realCommentText === optimisticCommentText && timeDiff < 60000) {
                    // Real data matches optimistic - safe to clear
                    toClear.push(itemId);
                }
            }
        });
        
        if (toClear.length > 0) {
            setOptimisticComments(prev => {
                const next = { ...prev };
                toClear.forEach(itemId => delete next[itemId]);
                return next;
            });
        }
    }, [items, optimisticComments]);

    // Merge optimistic updates with actual items
    const itemsWithOptimistic = items.map(item => {
        const optimisticComment = optimisticComments[item.id];
        const optimisticApprover = optimisticApprovers[item.id];
        const optimisticStatus = optimisticStatuses[item.id];
        
        // Only use optimistic status if real data doesn't match yet
        let finalStatus = item.status;
        if (optimisticStatus) {
            if (item.status === optimisticStatus) {
                // Real data matches - use real data (optimistic will be cleared by useEffect)
                finalStatus = item.status;
            } else {
                // Real data doesn't match yet - use optimistic
                finalStatus = optimisticStatus;
            }
        }
        
        // Only use optimistic approver if real data doesn't match yet
        let finalApproverEmail = item.approverEmail;
        let finalApproverInfo = item.approverInfo;
        if (optimisticApprover) {
            if (item.approverEmail?.toLowerCase() === optimisticApprover.email.toLowerCase()) {
                // Real data matches - use real data
                finalApproverEmail = item.approverEmail;
                finalApproverInfo = item.approverInfo;
            } else {
                // Real data doesn't match yet - use optimistic
                finalApproverEmail = optimisticApprover.email;
                finalApproverInfo = {
                    first_name: optimisticApprover.first_name,
                    last_name: optimisticApprover.last_name,
                    avatar_url: optimisticApprover.avatar_url,
                };
            }
        }
        
        // Only use optimistic comment if real data doesn't match yet
        let finalLastComment = item.lastComment;
        if (optimisticComment) {
            if (item.lastComment) {
                // Check if real comment matches optimistic
                const realCommentText = item.lastComment.comment_text.replace(/<[^>]*>/g, '').trim().toLowerCase();
                const optimisticCommentText = optimisticComment.comment_text.replace(/<[^>]*>/g, '').trim().toLowerCase();
                const realTime = new Date(item.lastComment.created_at).getTime();
                const optimisticTime = new Date(optimisticComment.created_at).getTime();
                const timeDiff = Math.abs(realTime - optimisticTime);
                
                if (realCommentText === optimisticCommentText && timeDiff < 60000) {
                    // Real data matches - use real data
                    finalLastComment = item.lastComment;
                } else {
                    // Real data doesn't match yet - use optimistic
                    finalLastComment = {
                        comment_text: optimisticComment.comment_text,
                        created_at: optimisticComment.created_at,
                        created_by: optimisticComment.created_by,
                    };
                }
            } else {
                // No real comment yet - use optimistic
                finalLastComment = {
                    comment_text: optimisticComment.comment_text,
                    created_at: optimisticComment.created_at,
                    created_by: optimisticComment.created_by,
                };
            }
        }
        
        return {
            ...item,
            status: finalStatus,
            approverEmail: finalApproverEmail,
            approverInfo: finalApproverInfo,
            lastComment: finalLastComment
        };
    });

    // First, sort all items by sort_order (as defined in settings)
    const sortedItems = [...itemsWithOptimistic].sort((a, b) => {
        const sortA = a.criterion.sort_order ?? 0;
        const sortB = b.criterion.sort_order ?? 0;
        if (sortA !== sortB) {
            return sortA - sortB;
        }
        return (a.criterion.label || '').localeCompare(b.criterion.label || '');
    });

    // Group by category while preserving the sort_order
    const grouped = sortedItems.reduce((acc, item) => {
        const cat = item.criterion.category || 'OTHER';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {} as Record<string, MatrixItem[]>);

    // Identify "overall" items and separate them
    const categoryOverallItems: Record<string, MatrixItem | null> = {};
    const categoryRegularItems: Record<string, MatrixItem[]> = {};
    
    Object.keys(grouped).forEach(cat => {
        const items = grouped[cat];
        const overallItem = items.find(item => 
            item.criterion.label?.toLowerCase().startsWith('overall')
        );
        const regularItems = items.filter(item => 
            !item.criterion.label?.toLowerCase().startsWith('overall')
        );
        
        categoryOverallItems[cat] = overallItem || null;
        categoryRegularItems[cat] = regularItems;
    });

    // Get categories in the order they first appear (based on sort_order)
    const categoryOrder = new Map<string, number>();
    sortedItems.forEach((item, index) => {
        const cat = item.criterion.category || 'OTHER';
        if (!categoryOrder.has(cat)) {
            categoryOrder.set(cat, index);
        }
    });
    
    // Sort categories by their first appearance order
    const categories = Object.keys(grouped).sort((a, b) => {
        const orderA = categoryOrder.get(a) ?? Infinity;
        const orderB = categoryOrder.get(b) ?? Infinity;
        return orderA - orderB;
    });

    async function handleStatusChange(id: string, newStatus: string) {
        if (!newStatus) return; // Don't proceed if no status selected
        
        // Find the current status for this item
        const currentItem = items.find(item => item.id === id);
        const oldStatus = currentItem?.status || 'NOT_SET'; // Default to NOT_SET if no status
        
        // Skip if status hasn't actually changed
        if (oldStatus === newStatus) return;
        
        // Optimistically update the status immediately
        setOptimisticStatuses(prev => ({ ...prev, [id]: newStatus }));
        
        // Comments are required for ANY status change
        // Store pending status change with previous status
        setPendingStatusChange({ itemId: id, status: newStatus, previousStatus: oldStatus });
        // Open comments modal for this item
        const item = items.find(item => item.id === id);
        if (item) {
            setSelectedItemForComments(item);
            setCommentsModalInitialTab('comments');
            setCommentsModalOpen(true);
        }
        return; // Don't save status yet, wait for comment
    }

    const toggleCategory = (cat: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) {
                next.delete(cat);
            } else {
                next.add(cat);
            }
            return next;
        });
    };
    
    const toggleShowCollapsedItems = (itemsToToggle: MatrixItem[], currentlyShown: boolean) => {
        setShownItems(prev => {
            const next = new Set(prev);
            itemsToToggle.forEach(item => {
                if (currentlyShown) {
                    next.delete(item.id);
                } else {
                    next.add(item.id);
                }
            });
            return next;
        });
    };

    // Notes editing removed - use comments modal instead
    const handleEditNotes = (item: MatrixItem) => {
        // Open comments modal with content tab (default) for viewing/editing notes
        setSelectedItemForComments(item);
        setCommentsModalInitialTab('content');
        setCommentsModalOpen(true);
    };

    const handleOpenAttachments = (item: MatrixItem) => {
        // Open comments modal with comments tab instead of separate attachment modal
        setSelectedItemForComments(item);
        setCommentsModalInitialTab('comments');
        setCommentsModalOpen(true);
    };

    const handleCloseAttachments = () => {
        setAttachmentModalOpen(false);
        setSelectedItemForAttachment(null);
    };

    const handleOpenComments = (item: MatrixItem) => {
        setSelectedItemForComments(item);
        setCommentsModalInitialTab('content');
        setCommentsModalOpen(true);
    };

    const handleOpenCommentsForComments = (item: MatrixItem) => {
        setSelectedItemForComments(item);
        setCommentsModalInitialTab('comments');
        setCommentsModalOpen(true);
    };

    const handleCloseComments = () => {
        setCommentsModalOpen(false);
        setSelectedItemForComments(null);
        setPendingStatusChange(null);
        onUpdate();
    };

    const handleCloseCommentsWithoutComment = () => {
        // Revert the status change if modal closes without comment
        if (pendingStatusChange) {
            const { itemId } = pendingStatusChange;
            // Revert optimistic status update
            setOptimisticStatuses(prev => {
                const next = { ...prev };
                const currentItem = items.find(item => item.id === itemId);
                if (currentItem?.status) {
                    next[itemId] = currentItem.status;
                } else {
                    delete next[itemId];
                }
                return next;
            });
            // Clear any optimistic comments for this item
            setOptimisticComments(prev => {
                const next = { ...prev };
                delete next[itemId];
                return next;
            });
            setPendingStatusChange(null);
        }
        handleCloseComments();
    };

    const handleCancelRating = () => {
        // Revert the status change and show toast
        if (pendingStatusChange) {
            const { itemId, previousStatus } = pendingStatusChange;
            // Revert optimistic status update using the stored previousStatus
            setOptimisticStatuses(prev => {
                const next = { ...prev };
                if (previousStatus) {
                    next[itemId] = previousStatus;
                } else {
                    delete next[itemId];
                }
                return next;
            });
            // Clear any optimistic comments for this item
            setOptimisticComments(prev => {
                const next = { ...prev };
                delete next[itemId];
                return next;
            });
            setPendingStatusChange(null);
            
            // Show toast explaining rating wasn't saved
            notifications.show({
                title: 'Rating cancelled',
                message: 'The rating change has been cancelled and was not saved. A comment is required for this Go/No-Go score change.',
                color: 'orange',
                autoClose: 5000,
            });
        }
        handleCloseComments();
    };

    const handleCommentAdded = async (comment?: { id: string; comment_text: string; created_at: string; created_by?: { email: string; first_name?: string; last_name?: string } }) => {
        // Check if this is an optimistic comment (temp ID)
        const isOptimistic = comment?.id?.startsWith('temp-');
        
        // If comment data is provided, update optimistic comments immediately
        if (comment && selectedItemForComments) {
            const itemId = selectedItemForComments.id;
            setOptimisticComments(prev => ({
                ...prev,
                [itemId]: {
                    comment_text: comment.comment_text,
                    created_at: comment.created_at,
                    created_by: comment.created_by,
                }
            }));
        }
        
        // Only refresh immediately if not optimistic (real comment from server)
        // For optimistic comments, we'll refresh after the save completes
        if (!isOptimistic) {
            onUpdate();
        }
        
        // After comment is added, save the pending status change
        if (pendingStatusChange && selectedItemForComments?.id === pendingStatusChange.itemId) {
            const id = pendingStatusChange.itemId;
            const newStatus = pendingStatusChange.status;
            const oldStatus = pendingStatusChange.previousStatus;
            
            // Status is already optimistically updated, just mark as saving
            setSavingItems(prev => new Set(prev).add(id));
            
            // Save in the background (don't await, let it happen async)
            (async () => {
                try {
                    const res = await fetch(`/api/epics/${epicId}/criteria/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    
                    let responseData = null;
                    const contentType = res.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        responseData = await res.json();
                    } else {
                        const text = await res.text();
                        responseData = { error: text || 'Unknown error' };
                    }
                    
                    if (!res.ok) {
                        // Revert optimistic status and comment on error
                        setOptimisticStatuses(prev => {
                            const next = { ...prev };
                            if (oldStatus) {
                                next[id] = oldStatus;
                            } else {
                                delete next[id];
                            }
                            return next;
                        });
                        setOptimisticComments(prev => {
                            const next = { ...prev };
                            delete next[id];
                            return next;
                        });
                        const errorMsg = responseData?.error || responseData?.message || `Failed to update Go/No-Go score: ${res.status}`;
                        notifications.show({
                            title: 'Failed to save Go/No-Go score',
                            message: errorMsg,
                            color: 'red',
                            autoClose: 5000,
                        });
                    } else {
                        // Don't clear optimistic updates manually - useEffect will clear when real data matches
                        setPendingStatusChange(null);
                        // onUpdate will fetch real data, and useEffect will clear optimistic when it matches
                        onUpdate();
                    }
                } catch (e: any) {
                    console.error('Failed to update status:', e);
                    // Revert optimistic updates on error
                    setOptimisticStatuses(prev => {
                        const next = { ...prev };
                        if (oldStatus) {
                            next[id] = oldStatus;
                        } else {
                            delete next[id];
                        }
                        return next;
                    });
                    setOptimisticComments(prev => {
                        const next = { ...prev };
                        delete next[id];
                        return next;
                    });
                    notifications.show({
                        title: 'Failed to save Go/No-Go score',
                        message: e.message || 'An error occurred while saving the Go/No-Go score',
                        color: 'red',
                        autoClose: 5000,
                    });
                } finally {
                    setSavingItems(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                }
            })();
        } else if (!isOptimistic) {
            // If no pending status change but comment is real (not optimistic), refresh
            onUpdate();
        }
    };

    const handleSkipComment = async () => {
        // Save the pending status change without requiring a comment
        if (pendingStatusChange && selectedItemForComments?.id === pendingStatusChange.itemId) {
            const id = pendingStatusChange.itemId;
            const newStatus = pendingStatusChange.status;
            const oldStatus = pendingStatusChange.previousStatus;
            
            // Optimistically update the UI immediately
            setOptimisticStatuses(prev => ({ ...prev, [id]: newStatus }));
            setSavingItems(prev => new Set(prev).add(id));
            setPendingStatusChange(null);
            
            // Close the drawer immediately (don't wait for API call)
            handleCloseComments();
            
            // Save in the background
            (async () => {
                try {
                    const res = await fetch(`/api/epics/${epicId}/criteria/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    
                    let responseData = null;
                    const contentType = res.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        responseData = await res.json();
                    } else {
                        const text = await res.text();
                        responseData = { error: text || 'Unknown error' };
                    }
                    
                    if (!res.ok) {
                        // Revert optimistic update on error
                        setOptimisticStatuses(prev => {
                            const next = { ...prev };
                            if (oldStatus) {
                                next[id] = oldStatus;
                            } else {
                                delete next[id];
                            }
                            return next;
                        });
                        const errorMsg = responseData?.error || responseData?.message || `Failed to update Go/No-Go score: ${res.status}`;
                        notifications.show({
                            title: 'Failed to save Go/No-Go score',
                            message: errorMsg,
                            color: 'red',
                            autoClose: 5000,
                        });
                    } else {
                        // Don't clear optimistic update manually - useEffect will clear when real data matches
                        // onUpdate will fetch real data, and useEffect will clear optimistic when it matches
                        onUpdate();
                    }
                } catch (e: any) {
                    console.error('Failed to update status:', e);
                    // Revert optimistic update on error
                    setOptimisticStatuses(prev => {
                        const next = { ...prev };
                        if (oldStatus) {
                            next[id] = oldStatus;
                        } else {
                            delete next[id];
                        }
                        return next;
                    });
                    notifications.show({
                        title: 'Failed to save Go/No-Go score',
                        message: e.message || 'An error occurred while saving the Go/No-Go score',
                        color: 'red',
                        autoClose: 5000,
                    });
                } finally {
                    setSavingItems(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                }
            })();
        }
    };

    const handleOpenDelegation = (item: MatrixItem) => {
        setSelectedItemForDelegation(item);
        setDelegationModalOpen(true);
    };

    const handleCloseDelegation = () => {
        setDelegationModalOpen(false);
        setSelectedItemForDelegation(null);
    };

    const handleDelegate = async (delegationType: DelegationType, newApproverEmail: string) => {
        if (!selectedItemForDelegation) return;
        
        // Get user info from cache for optimistic update (synchronous)
        const cachedUsers = getCachedUsers();
        let newApprover = cachedUsers?.find(u => u.email.toLowerCase() === newApproverEmail.toLowerCase());
        
        // If not in cache, try to fetch quickly (but don't wait - show email immediately)
        if (!newApprover) {
            // Fetch user info in background, but update optimistically with email first
            fetch(`/api/users/by-email?emails=${encodeURIComponent(newApproverEmail)}`)
                .then(res => res.json())
                .then(userMap => {
                    const userInfo = userMap[newApproverEmail.toLowerCase()];
                    if (userInfo) {
                        // Update optimistic approver with fetched info
                        setOptimisticApprovers(prev => ({
                            ...prev,
                            [selectedItemForDelegation.id]: {
                                email: newApproverEmail,
                                first_name: userInfo.first_name,
                                last_name: userInfo.last_name,
                                avatar_url: userInfo.avatar_url,
                            }
                        }));
                    }
                })
                .catch(err => console.warn('Failed to fetch user info:', err));
        }
        
        // Determine which items to update optimistically based on delegation type
        const itemsToUpdate: string[] = [];
        if (delegationType === 'SINGLE_TASK') {
            itemsToUpdate.push(selectedItemForDelegation.id);
        } else {
            // For other types, we'll update all matching items optimistically
            // The backend will handle the actual delegation logic
            itemsToUpdate.push(selectedItemForDelegation.id);
        }
        
        // Optimistically update approver info immediately (synchronous state update)
        // Show email immediately, name/avatar will come from cache or background fetch
        itemsToUpdate.forEach(itemId => {
            setOptimisticApprovers(prev => ({
                ...prev,
                [itemId]: {
                    email: newApproverEmail,
                    first_name: newApprover?.first_name,
                    last_name: newApprover?.last_name,
                    avatar_url: newApprover?.avatar_url,
                }
            }));
        });
        
        // Close modal immediately
        handleCloseDelegation();
        
        // Save in background
        (async () => {
            try {
                const res = await fetchWithRateLimit(`/api/epics/${epicId}/delegate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        delegationType,
                        newApproverEmail,
                        taskId: selectedItemForDelegation.id,
                        category: selectedItemForDelegation.criterion.category,
                        isGate: selectedItemForDelegation.criterion.gate,
                        taskLabel: selectedItemForDelegation.criterion.label,
                    }),
                });

                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.error || 'Failed to delegate');
                }

                // Show success toast with Slack message info
                notifications.show({
                    title: 'Delegation successful',
                    message: `Task has been delegated to ${newApproverEmail}. A Slack notification has been sent to notify them.`,
                    color: 'green',
                    autoClose: 5000,
                });
                
                // Force refresh to update approver info
                // Don't clear optimistic approver manually - the useEffect will clear it when real data matches
                onUpdate();
            } catch (error) {
                console.error('Delegation error:', error);
                
                // Revert optimistic updates on error
                itemsToUpdate.forEach(itemId => {
                    setOptimisticApprovers(prev => {
                        const next = { ...prev };
                        delete next[itemId];
                        return next;
                    });
                });
                
                notifications.show({
                    title: 'Delegation failed',
                    message: error instanceof Error ? error.message : 'Failed to delegate task',
                    color: 'red',
                    autoClose: 5000,
                });
            }
        })();
    };

    const isCollapsed = (cat: string) => collapsedCategories.has(cat);
    const hasOverall = (cat: string) => categoryOverallItems[cat] !== null;

    return (
        <>
            {categories.map((cat, index) => {
                const overallItem = categoryOverallItems[cat];
                const regularItems = categoryRegularItems[cat];
                const allItems = overallItem 
                    ? [overallItem, ...regularItems]
                    : regularItems;
                const collapsed = isCollapsed(cat);
                const showOverall = hasOverall(cat);
                const isLastCategory = index === categories.length - 1;
                
                // Check if category has signoff items
                const hasSignoff = allItems.some(item => 
                    item.criterion.label?.toLowerCase().includes('signoff')
                );
                
                // Split items based on rules
                let primaryItems: MatrixItem[] = [];
                let secondaryItems: MatrixItem[] = [];
                
                if (hasSignoff) {
                    // Show signoff items, hide others
                    primaryItems = allItems.filter(item => 
                        item.criterion.label?.toLowerCase().includes('signoff')
                    );
                    secondaryItems = allItems.filter(item => 
                        !item.criterion.label?.toLowerCase().includes('signoff')
                    );
                } else {
                    // Show required items, hide non-required
                    primaryItems = allItems.filter(item => !item.notRequired);
                    secondaryItems = allItems.filter(item => item.notRequired);
                }
                
                // Filter items based on visibility
                const visibleItems = allItems.filter(item => shownItems.has(item.id));
                const hiddenItems = secondaryItems.filter(item => !shownItems.has(item.id));
                const hiddenCount = hiddenItems.length;

                return (
                    <div key={cat}>
                        <div 
                            className="flex items-center gap-2 px-3 md:px-6 py-3 cursor-pointer select-none hover:bg-gray-50 transition-colors"
                            onClick={() => toggleCategory(cat)}
                        >
                            <span className="text-gray-500">
                                {collapsed ? (
                                    <IconChevronRight size={20} />
                                ) : (
                                    <IconChevronDown size={20} />
                                )}
                            </span>
                            <h3 className="text-sm font-semibold text-gray-900">{cat}</h3>
                        </div>
                        {!collapsed && (
                            <div className="px-3 md:px-6 pb-6">
                            {/* Desktop Table View - hidden on mobile - matches /Epics and Home table styling */}
                            <div className="hidden md:block rounded-lg" style={{ border: '1px solid #E5E7EB', backgroundColor: '#FFFFFF', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)' }}>
                            <div className="overflow-x-auto overflow-y-visible">
                            <table className="min-w-full table-fixed w-full" style={{ borderCollapse: 'collapse', minWidth: '700px' }}>
                                <colgroup>
                                    <col style={{ width: 'auto' }} />
                                    <col style={{ width: showNotApplicable ? '148px' : '120px' }} />
                                    <col style={{ width: '150px' }} />
                                    <col style={{ width: '120px' }} />
                                    <col style={{ width: '100px' }} />
                                    <col style={{ width: 'auto' }} />
                                    <col style={{ width: '40px' }} />
                                </colgroup>
                                <thead style={{ backgroundColor: '#FFFFFF', borderBottom: '2px solid #E5E7EB' }}>
                                    <tr>
                                        <th className="px-4 py-3 text-left font-medium" style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Criterion</th>
                                        <th className="px-4 py-3 text-left font-medium normal-case" style={{ width: showNotApplicable ? '148px' : '120px', fontSize: '12px', fontWeight: 600, textTransform: 'none', letterSpacing: '0.05em', color: '#6B7280' }}>Go/No-Go Score</th>
                                        <th className="px-4 py-3 text-left font-medium" style={{ width: '150px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Accountable</th>
                                        <th className="px-4 py-3 text-left font-medium" style={{ width: '120px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Due On</th>
                                        <th className="px-4 py-3 text-left font-medium" style={{ width: '100px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Sources</th>
                                        <th className="px-4 py-3 text-left font-medium" style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Comments</th>
                                        <th className="px-4 py-3 text-left font-medium" style={{ width: '40px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white" style={{ borderTop: '1px solid #E5E7EB' }}>
                                    {allItems.map((item, index) => {
                                        const isOverall = showOverall && index === 0;
                                        const isSignoff = item.criterion.label?.toLowerCase().includes('signoff');
                                        
                                        // Hide regular items when category is collapsed
                                        if (!isOverall && collapsed) {
                                            return null;
                                        }
                                        
                                        // Hide items that are not in shownItems set
                                        if (!shownItems.has(item.id)) {
                                            return null;
                                        }
                                        
                                        return (
                                            <tr key={item.id} className={`!bg-white hover:bg-gray-50 transition-colors ${item.notRequired ? 'opacity-60' : ''} ${isOverall && !isSignoff ? 'cursor-pointer' : ''}`} style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }} onClick={isOverall && !isSignoff ? () => toggleCategory(cat) : undefined}>
                                        <td className="px-4 py-3">
                                            <div className={`font-medium flex items-center gap-2 text-sm ${item.notRequired ? 'text-gray-500' : 'text-gray-900'}`}>
                                                {isOverall && !isSignoff && (
                                                    <span className="text-gray-500">
                                                        {collapsed ? (
                                                            <IconChevronRight size={16} />
                                                        ) : (
                                                            <IconChevronDown size={16} />
                                                        )}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => handleOpenComments(item)}
                                                    className="flex items-center gap-1.5 hover:text-blue-600 transition-colors cursor-pointer text-left"
                                                >
                                                    {item.criterion.label}
                                                    {item.criterion.gate && (
                                                        <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">GATE</span>
                                                    )}
                                                </button>
                                            </div>
                                            {item.criterion.description && (
                                                <div className="text-sm text-gray-500 mt-1">{item.criterion.description}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap" style={{ width: showNotApplicable ? '148px' : '120px', paddingRight: showNotApplicable ? 16 : undefined }}>
                                            {item.notRequired ? (
                                                <div className="text-xs font-medium text-gray-500">Not required</div>
                                            ) : (
                                                <TrafficLight
                                                    currentStatus={item.status}
                                                    onStatusChange={(newStatus) => handleStatusChange(item.id, newStatus)}
                                                    disabled={savingItems.has(item.id)}
                                                    definitions={{
                                                        go: item.criterion.status_definition_go,
                                                        conditional: item.criterion.status_definition_conditional,
                                                        no_go: item.criterion.status_definition_no_go,
                                                    }}
                                                    showNotApplicable={showNotApplicable && !item.criterion.gate}
                                                />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700" style={{ width: '150px' }}>
                                            {item.approverEmail && item.approverEmail !== "[name of pod's product manager]" && item.approverEmail.includes("@") ? (
                                                <div 
                                                    className="flex items-center gap-2 min-w-0"
                                                >
                                                    <div 
                                                        style={{ position: 'relative', display: 'inline-flex' }}
                                                        onMouseEnter={() => setHoveredAvatarId(item.id)}
                                                        onMouseLeave={() => setHoveredAvatarId(null)}
                                                    >
                                                        <Avatar
                                                            src={item.approverInfo?.avatar_url || undefined}
                                                            alt={item.approverEmail}
                                                            radius="xl"
                                                            size={24}
                                                            color={getAvatarColor(item.approverEmail)}
                                                            className="flex-shrink-0"
                                                            style={{
                                                                opacity: hoveredAvatarId === item.id ? 0 : 1,
                                                                transition: 'opacity 0.2s',
                                                            }}
                                                        >
                                                            {getInitials(item.approverEmail, item.approverInfo?.first_name, item.approverInfo?.last_name)}
                                                        </Avatar>
                                                        {(() => {
                                                            const hasPermission = canRolesPerform(currentUserRoles, 'criteria.delegate');
                                                            const isApprover = currentUserEmail === item.approverEmail;
                                                            const shouldShow = hasPermission || isApprover;
                                                            return shouldShow && (
                                                                <Tooltip label="Delegate this task" position="top" withArrow>
                                                                    <button
                                                                        className="flex-shrink-0"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleOpenDelegation(item);
                                                                        }}
                                                                        style={{ 
                                                                            position: 'absolute',
                                                                            top: 0,
                                                                            left: 0,
                                                                            width: '24px',
                                                                            height: '24px',
                                                                            borderRadius: '50%',
                                                                            background: '#f3f4f6',
                                                                            border: 'none',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            opacity: hoveredAvatarId === item.id ? 1 : 0,
                                                                            transition: 'opacity 0.2s',
                                                                            pointerEvents: hoveredAvatarId === item.id ? 'auto' : 'none',
                                                                        }}
                                                                    >
                                                                        <IconArrowsRightLeft size={14} className="text-gray-600" />
                                                                    </button>
                                                                </Tooltip>
                                                            );
                                                        })()}
                                                    </div>
                                                    <span className="text-sm truncate min-w-0 flex-1">
                                                        {getDisplayName(item.approverInfo?.first_name, item.approverInfo?.last_name, item.approverEmail)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-500">-</span>
                                                    {(() => {
                                                        const hasPermission = canRolesPerform(currentUserRoles, 'criteria.delegate');
                                                        return hasPermission && (
                                                            <Tooltip label="Delegate this task" position="top" withArrow>
                                                                <button
                                                                    className="delegation-btn opacity-100 transition-opacity flex-shrink-0 hover:opacity-80"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleOpenDelegation(item);
                                                                    }}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                                                >
                                                                    <IconArrowsRightLeft size={16} className="text-gray-600" />
                                                                </button>
                                                            </Tooltip>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ width: '120px' }}>
                                            {(() => {
                                                const dueDateStr = item.condition_due_date;
                                                // Check for null, undefined, or empty string
                                                if (!dueDateStr || (typeof dueDateStr === 'string' && dueDateStr.trim() === '')) {
                                                    return '-';
                                                }
                                                
                                                try {
                                                    const dueDate = new Date(dueDateStr);
                                                    // Check if date is valid
                                                    if (isNaN(dueDate.getTime())) {
                                                        return '-';
                                                    }
                                                    
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    dueDate.setHours(0, 0, 0, 0);
                                                    const isOverdue = dueDate < today;
                                                    
                                                    return (
                                                        <div className={`${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                                                            <span>{dueDate.toLocaleDateString()}</span>
                                                        </div>
                                                    );
                                                } catch (e) {
                                                    return '-';
                                                }
                                            })()}
                                        </td>
                                        <td 
                                            className="px-4 py-3 text-sm cursor-pointer" 
                                            style={{ width: '100px' }}
                                            onClick={() => {
                                                handleOpenComments(item);
                                            }}
                                        >
                                            {(() => {
                                                const dataSources = item.criterion.data_sources;
                                                if (!dataSources || dataSources.length === 0) {
                                                    return <span className="text-gray-400">-</span>;
                                                }
                                                
                                                // Show all data sources, with empty circles for absent ones
                                                return (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {dataSources.map((source, idx) => {
                                                            const hasData = hasDataSourceData(item, source, idx);
                                                            const IconComponent = getDataSourceIcon(source.type);
                                                            const ticketCount = jiraTicketCounts[`${item.id}-${idx}`];
                                                            const tooltipLabel = getDataSourceTooltip(source, ticketCount);
                                                            
                                                            // For Jira sources, show favicon if hasData is true (meaning we have epic key or saved URL)
                                                            const isJiraSource = source.type === 'jira_jql';
                                                            // Use Google's favicon service as fallback if jiraDomain not loaded yet
                                                            const jiraFaviconUrl = jiraDomain 
                                                                ? `https://${jiraDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/favicon.ico`
                                                                : 'https://www.google.com/s2/favicons?domain=atlassian.com&sz=16';
                                                            
                                                            return (
                                                                <Tooltip key={idx} label={tooltipLabel} position="top" withArrow>
                                                                    {hasData ? (
                                                                        <div className="text-gray-600 hover:text-gray-900 transition-colors" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                            {source.type === 'success_metrics_defined' ? (
                                                                                <span style={{ fontSize: '16px' }}>📊</span>
                                                                            ) : source.type === 'aha_field' || source.type === 'aha_description_part' ? (
                                                                                <img 
                                                                                    src="https://www.google.com/s2/favicons?domain=aha.io&sz=12" 
                                                                                    alt="Aha" 
                                                                                    className="w-3 h-3"
                                                                                    style={{ display: 'block' }}
                                                                                />
                                                                            ) : isJiraSource ? (
                                                                                <img 
                                                                                    src={jiraFaviconUrl}
                                                                                    alt="Jira" 
                                                                                    className="w-3 h-3"
                                                                                    style={{ display: 'block', width: '12px', height: '12px', objectFit: 'contain' }}
                                                                                    onError={(e) => {
                                                                                        console.log(`Favicon failed to load, using fallback. Original URL: ${jiraFaviconUrl}`);
                                                                                        (e.target as HTMLImageElement).src = 'https://www.google.com/s2/favicons?domain=atlassian.com&sz=16';
                                                                                    }}
                                                                                    onLoad={() => {
                                                                                        console.log(`✅ Jira favicon loaded successfully for item ${item.id}, source ${idx}`);
                                                                                    }}
                                                                                />
                                                                            ) : IconComponent ? (
                                                                                <IconComponent size={16} />
                                                                            ) : null}
                                                                        </div>
                                                                    ) : (
                                                                        <div 
                                                                            className="w-4 h-4 rounded-full border-2 border-gray-300"
                                                                            style={{ minWidth: '16px', minHeight: '16px' }}
                                                                        />
                                                                    )}
                                                                </Tooltip>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td 
                                            className="px-4 py-3 text-sm text-gray-700 cursor-pointer"
                                            onClick={(e) => {
                                                                // Only handle click if it's not on a button
                                                                const target = e.target as HTMLElement;
                                                                if (target.closest('button')) {
                                                                    return; // Let button handle its own click
                                                                }
                                                                handleOpenCommentsForComments(item);
                                                            }}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    {/* Show last comment preview */}
                                                    {item.lastComment ? (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleOpenCommentsForComments(item);
                                                            }}
                                                            className="text-left w-full hover:text-blue-600 transition-colors group"
                                                            title="View/add comments"
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                <div 
                                                                    className="text-xs text-gray-700 line-clamp-2 flex-1 [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-1 [&_p]:mb-1 [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800"
                                                                    style={{
                                                                        wordBreak: "break-word",
                                                                        opacity: optimisticComments[item.id] ? 0.7 : 1,
                                                                    }}
                                                                    dangerouslySetInnerHTML={{ __html: item.lastComment.comment_text }}
                                                                />
                                                                {optimisticComments[item.id] && (
                                                                    <span className="text-xs text-blue-500 font-medium flex-shrink-0">Saving...</span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-400 mt-1">
                                                                {(() => {
                                                                    const ts = item.lastComment.updated_at ?? item.lastComment.created_at;
                                                                    const date = new Date(ts);
                                                                    const now = new Date();
                                                                    const diffMs = now.getTime() - date.getTime();
                                                                    const diffMins = Math.floor(diffMs / 60000);
                                                                    const diffHours = Math.floor(diffMs / 3600000);
                                                                    const diffDays = Math.floor(diffMs / 86400000);
                                                                    if (diffMins < 1) return 'Just now';
                                                                    if (diffMins < 60) return `${diffMins}m ago`;
                                                                    if (diffHours < 24) return `${diffHours}h ago`;
                                                                    if (diffDays < 7) return `${diffDays}d ago`;
                                                                    return date.toLocaleDateString();
                                                                })()}
                                                            </div>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleOpenCommentsForComments(item);
                                                            }}
                                                            className="text-left w-full hover:text-blue-600 transition-colors"
                                                            title="View/add comments"
                                                        >
                                                            <span className="text-gray-400 italic text-xs">Click to add comment</span>
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex gap-1 flex-shrink-0">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenCommentsForComments(item);
                                                        }}
                                                        className="p-1 rounded hover:bg-gray-100 text-gray-600 transition-colors flex-shrink-0 relative"
                                                        title="View/add comments"
                                                    >
                                                        <IconMessageCircle className="w-4 h-4" />
                                                        {(item.commentCount || 0) > 0 && (
                                                            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                                                {(item.commentCount || 0) > 99 ? '99+' : item.commentCount}
                                                            </span>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenAttachments(item);
                                                        }}
                                                        className="p-1 rounded hover:bg-gray-100 text-gray-600 transition-colors flex-shrink-0 relative"
                                                        title="Attach files"
                                                    >
                                                        <IconPaperclip className="w-4 h-4" />
                                                        {(item.attachmentCount || 0) > 0 && (
                                                            <span className="absolute -top-1 -right-1 bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                                                                {(item.attachmentCount || 0) > 99 ? '99+' : item.attachmentCount}
                                                            </span>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleOpenComments(item)}
                                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                                title="Open details"
                                            >
                                                <IconChevronRight size={20} />
                                            </button>
                                        </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            </div>
                            </div>
                            
                            {/* Mobile Card View - visible on mobile */}
                            <div className="block md:hidden space-y-3">
                                {allItems.map((item, index) => {
                                    const isOverall = showOverall && index === 0;
                                    const isSignoff = item.criterion.label?.toLowerCase().includes('signoff');
                                    
                                    // Hide regular items when category is collapsed
                                    if (!isOverall && collapsed) {
                                        return null;
                                    }
                                    
                                    // Hide items that are not in shownItems set
                                    if (!shownItems.has(item.id)) {
                                        return null;
                                    }
                                    
                                    // Render due date
                                    const renderDueDate = () => {
                                        const dueDateStr = item.condition_due_date;
                                        if (!dueDateStr || (typeof dueDateStr === 'string' && dueDateStr.trim() === '')) {
                                            return '-';
                                        }
                                        
                                        try {
                                            const dueDate = new Date(dueDateStr);
                                            if (isNaN(dueDate.getTime())) {
                                                return '-';
                                            }
                                            
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);
                                            dueDate.setHours(0, 0, 0, 0);
                                            const isOverdue = dueDate < today;
                                            
                                            return (
                                                <div className={`${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                                                    <span>{dueDate.toLocaleDateString()}</span>
                                                </div>
                                            );
                                        } catch (e) {
                                            return '-';
                                        }
                                    };
                                    
                                    // Render comment preview
                                    const renderCommentPreview = () => {
                                        if (item.lastComment) {
                                            const ts = item.lastComment.updated_at ?? item.lastComment.created_at;
                                            const date = new Date(ts);
                                            const now = new Date();
                                            const diffMs = now.getTime() - date.getTime();
                                            const diffMins = Math.floor(diffMs / 60000);
                                            const diffHours = Math.floor(diffMs / 3600000);
                                            const diffDays = Math.floor(diffMs / 86400000);

                                            let timeAgo = 'Just now';
                                            if (diffMins >= 1 && diffMins < 60) timeAgo = `${diffMins}m ago`;
                                            else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
                                            else if (diffDays < 7) timeAgo = `${diffDays}d ago`;
                                            else timeAgo = date.toLocaleDateString();

                                            const isOptimistic = optimisticComments[item.id];

                                            return (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenCommentsForComments(item);
                                                    }}
                                                    className="text-left w-full hover:text-blue-600 transition-colors"
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <div 
                                                            className="text-xs text-gray-700 line-clamp-2 break-words flex-1 [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-1 [&_p]:mb-1 [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800"
                                                            style={{ opacity: isOptimistic ? 0.7 : 1 }}
                                                            dangerouslySetInnerHTML={{ __html: item.lastComment.comment_text }}
                                                        />
                                                        {isOptimistic && (
                                                            <span className="text-xs text-blue-500 font-medium flex-shrink-0">Saving...</span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-400 mt-1">{timeAgo}</div>
                                                </button>
                                            );
                                        } else {
                                            return (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenCommentsForComments(item);
                                                    }}
                                                    className="text-left w-full hover:text-blue-600 transition-colors"
                                                >
                                                    <span className="text-gray-400 italic text-xs">Click to add comment</span>
                                                </button>
                                            );
                                        }
                                    };
                                    
                                    return (
                                        <div 
                                            key={item.id} 
                                            className={`matrix-mobile-card bg-white border rounded-lg p-4 ${item.notRequired ? 'opacity-60' : ''} relative`}
                                            style={{ border: '1px solid #E5E7EB' }}
                                        >
                                            {/* Header: Criterion name */}
                                            <div className="mb-3">
                                                <div className={`font-medium flex items-center gap-2 text-sm mb-1 ${item.notRequired ? 'text-gray-500' : 'text-gray-900'}`}>
                                                    {isOverall && !isSignoff && (
                                                        <span className="text-gray-500">
                                                            {collapsed ? (
                                                                <IconChevronRight size={16} />
                                                            ) : (
                                                                <IconChevronDown size={16} />
                                                            )}
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => handleOpenComments(item)}
                                                        className="flex items-center gap-1.5 hover:text-blue-600 transition-colors cursor-pointer text-left"
                                                    >
                                                        {item.criterion.label}
                                                        {item.criterion.gate && (
                                                            <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">GATE</span>
                                                        )}
                                                    </button>
                                                </div>
                                                {item.criterion.description && (
                                                    <div className="text-xs text-gray-500 mt-1">{item.criterion.description}</div>
                                                )}
                                            </div>
                                            
                                            {/* Go/No-Go score section */}
                                            <div className={showNotApplicable && !item.criterion.gate ? 'mb-4' : 'mb-3'}>
                                                <div className="text-xs font-medium text-gray-700 mb-2">Go/No-Go Score</div>
                                                {item.notRequired ? (
                                                    <div className="text-xs font-medium text-gray-500">Not required</div>
                                                ) : (
                                                    <TrafficLight
                                                        currentStatus={item.status}
                                                        onStatusChange={(newStatus) => handleStatusChange(item.id, newStatus)}
                                                        disabled={savingItems.has(item.id)}
                                                        definitions={{
                                                            go: item.criterion.status_definition_go,
                                                            conditional: item.criterion.status_definition_conditional,
                                                            no_go: item.criterion.status_definition_no_go,
                                                        }}
                                                        isMobile={true}
                                                        showNotApplicable={showNotApplicable && !item.criterion.gate}
                                                    />
                                                )}
                                            </div>
                                            
                                            {/* Accountable Section */}
                                            <div className="mb-3">
                                                <div className="text-xs font-medium text-gray-700 mb-2">Accountable</div>
                                                {item.approverEmail && item.approverEmail !== "[name of pod's product manager]" && item.approverEmail.includes("@") ? (
                                                    <div className="flex items-center gap-2">
                                                        <div 
                                                            style={{ position: 'relative', display: 'inline-flex' }}
                                                            onMouseEnter={() => setHoveredAvatarId(item.id)}
                                                            onMouseLeave={() => setHoveredAvatarId(null)}
                                                        >
                                                            <Avatar
                                                                src={item.approverInfo?.avatar_url || undefined}
                                                                alt={item.approverEmail}
                                                                radius="xl"
                                                                size={32}
                                                                color={getAvatarColor(item.approverEmail)}
                                                                className="flex-shrink-0"
                                                                style={{
                                                                    opacity: hoveredAvatarId === item.id ? 0 : 1,
                                                                    transition: 'opacity 0.2s',
                                                                }}
                                                            >
                                                                {getInitials(item.approverEmail, item.approverInfo?.first_name, item.approverInfo?.last_name)}
                                                            </Avatar>
                                                            {(() => {
                                                                const hasPermission = canRolesPerform(currentUserRoles, 'criteria.delegate');
                                                                const isApprover = currentUserEmail === item.approverEmail;
                                                                const shouldShow = hasPermission || isApprover;
                                                                return shouldShow && (
                                                                    <Tooltip label="Delegate this task" position="top" withArrow>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleOpenDelegation(item);
                                                                            }}
                                                                            style={{ 
                                                                                position: 'absolute',
                                                                                top: 0,
                                                                                left: 0,
                                                                                width: '32px',
                                                                                height: '32px',
                                                                                borderRadius: '50%',
                                                                                background: '#f3f4f6',
                                                                                border: 'none',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                opacity: hoveredAvatarId === item.id ? 1 : 0,
                                                                                transition: 'opacity 0.2s',
                                                                                pointerEvents: hoveredAvatarId === item.id ? 'auto' : 'none',
                                                                            }}
                                                                            title="Delegate this task"
                                                                        >
                                                                            <IconArrowsRightLeft size={19} className="text-gray-600" />
                                                                        </button>
                                                                    </Tooltip>
                                                                );
                                                            })()}
                                                        </div>
                                                        <span className="text-sm flex-1 min-w-0 truncate">
                                                            {getDisplayName(item.approverInfo?.first_name, item.approverInfo?.last_name, item.approverEmail)}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-gray-500">-</span>
                                                        {(() => {
                                                            const hasPermission = canRolesPerform(currentUserRoles, 'criteria.delegate');
                                                            return hasPermission && (
                                                                <button
                                                                    className="p-2.5 rounded hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleOpenDelegation(item);
                                                                    }}
                                                                    title="Delegate this task"
                                                                >
                                                                    <IconArrowsRightLeft size={20} className="text-gray-600" />
                                                                </button>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Due Date Section */}
                                            <div className="mb-3">
                                                <div className="text-xs font-medium text-gray-700 mb-2">Due On</div>
                                                <div className="text-sm">{renderDueDate()}</div>
                                            </div>
                                            
                                            {/* Comments Section */}
                                            <div
                                                onClick={(e) => {
                                                    // Only handle click if it's not on a button
                                                    const target = e.target as HTMLElement;
                                                    if (target.closest('button')) {
                                                        return; // Let button handle its own click
                                                    }
                                                    handleOpenCommentsForComments(item);
                                                }}
                                                className="matrix-card-comments cursor-pointer"
                                            >
                                                <div className="text-xs font-medium text-gray-700 mb-2">Comments</div>
                                                <div className="flex items-start gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        {renderCommentPreview()}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Chevron indicator - min 44px tap target for mobile */}
                                            <div className="absolute top-4 right-4">
                                                <button
                                                    onClick={() => handleOpenComments(item)}
                                                    className="text-gray-400 hover:text-gray-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -m-2 p-2"
                                                    title="Open details"
                                                    aria-label="Open details"
                                                >
                                                    <IconChevronRight size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {hiddenCount > 0 && (
                                <div className="mt-3 text-sm text-gray-600 px-3 md:px-0">
                                    + {hiddenCount} {hasSignoff ? 'secondary' : 'non-required'} {hiddenCount === 1 ? 'item' : 'items'} (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleShowCollapsedItems(hiddenItems, false);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-800 underline"
                                    >
                                        show
                                    </button>
                                    )
                                </div>
                            )}
                            {hiddenCount === 0 && secondaryItems.length > 0 && (
                                <div className="mt-3 text-sm text-gray-600 px-3 md:px-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleShowCollapsedItems(secondaryItems, true);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-800 underline"
                                    >
                                        hide {hasSignoff ? 'secondary' : 'non-required'} items
                                    </button>
                                </div>
                            )}
                        </div>
                        )}
                    </div>
                );
            })}

            {/* File Attachment Modal */}
            {selectedItemForAttachment && (
                <FileAttachmentModal
                    opened={attachmentModalOpen}
                    onClose={handleCloseAttachments}
                    epicId={epicId}
                    taskId={selectedItemForAttachment.id}
                    taskLabel={selectedItemForAttachment.criterion.label}
                    onAttachmentAdded={onUpdate}
                />
            )}

            {/* Comments Modal */}
            {selectedItemForComments && (
                <CommentsModal
                    opened={commentsModalOpen}
                    onClose={handleCloseComments}
                    epicId={epicId}
                    taskId={selectedItemForComments.id}
                    taskLabel={selectedItemForComments.criterion.label}
                    currentUserEmail={currentUserEmail}
                    requireComment={pendingStatusChange?.itemId === selectedItemForComments.id}
                    onCommentAdded={handleCommentAdded}
                    onCloseWithoutComment={handleCloseCommentsWithoutComment}
                    onCancel={handleCancelRating}
                    onSkipComment={handleSkipComment}
                    criterion={selectedItemForComments.criterion}
                    epic={epic}
                    initialTab={commentsModalInitialTab}
                    statusAtComment={pendingStatusChange?.itemId === selectedItemForComments.id ? pendingStatusChange.status : null}
                    previousStatus={pendingStatusChange?.itemId === selectedItemForComments.id ? (pendingStatusChange.previousStatus || null) : null}
                />
            )}

            {/* Delegation Modal */}
            {selectedItemForDelegation && (
                <DelegationModal
                    opened={delegationModalOpen}
                    onClose={handleCloseDelegation}
                    epicId={epicId}
                    epicName={epicName}
                    taskId={selectedItemForDelegation.id}
                    taskLabel={selectedItemForDelegation.criterion.label}
                    category={selectedItemForDelegation.criterion.category}
                    isGate={selectedItemForDelegation.criterion.gate}
                    currentApproverEmail={selectedItemForDelegation.approverEmail || ''}
                    onDelegate={handleDelegate}
                />
            )}
        </>
    );
}

