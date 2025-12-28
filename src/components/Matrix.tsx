"use client";
import { useState, useEffect } from "react";
import { Select, Avatar, Modal, Button, Group, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconChevronRight, IconPencil, IconPaperclip, IconMessageCircle, IconArrowsRightLeft } from "@tabler/icons-react";
import { UserDisplay } from "./UserDisplay";
import { UserDisplayWithDelegation } from "./UserDisplayWithDelegation";
import { RichText } from "./admin/RichText";
import { FileAttachmentModal } from "./FileAttachmentModal";
import { CommentsModal } from "./CommentsModal";
import { DelegationModal, DelegationType } from "./DelegationModal";
import { createClient } from "@/lib/supabase/client";

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
    criterion: {
        id: string;
        label: string;
        category: string;
        gate: boolean;
        description?: string;
        sort_order?: number;
        decision_owner_email?: string | null;
        status_definition_go?: string;
        status_definition_conditional?: string;
        status_definition_no_go?: string;
    };
};

// Traffic Light Status Component
interface TrafficLightProps {
    currentStatus: string;
    onStatusChange: (status: string) => void;
    disabled: boolean;
    definitions: {
        go?: string;
        conditional?: string;
        no_go?: string;
    };
}

function TrafficLight({ currentStatus, onStatusChange, disabled, definitions }: TrafficLightProps) {
    const lights = [
        { 
            value: 'GO', 
            color: '#10b981', // green
            greyColor: '#d1d5db',
            label: 'GO',
            definition: definitions.go || 'Meets all requirements'
        },
        { 
            value: 'CONDITIONAL', 
            color: '#f59e0b', // yellow/amber
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

    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {lights.map((light) => {
                const isSelected = currentStatus === light.value;
                const isNotSet = currentStatus === 'NOT_SET';
                
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
                            onClick={() => !disabled && onStatusChange(light.value)}
                            disabled={disabled}
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                border: isSelected ? `3px solid ${light.color}` : '2px solid #e5e7eb',
                                backgroundColor: isSelected ? light.color : light.greyColor,
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                                opacity: disabled ? 0.5 : 1,
                                boxShadow: isSelected ? `0 0 8px ${light.color}66` : 'none',
                                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
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
                        />
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
};

export default function Matrix({ epicId, epicName, epicStatus, items, onUpdate }: Props) {
    // #region agent log
    useEffect(() => {
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Matrix.tsx:157',message:'Matrix component rendered',data:{epicId,itemsCount:items.length,firstItem:items[0]?{id:items[0].id,criterion_id:items[0].criterion_id,status:items[0].status}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C,D',runId:'status-update'})}).catch(()=>{});
    }, []);
    // #endregion
    
    const [editingId, setEditingId] = useState<string | null>(null);
    const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
    const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({});
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
    const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
    const [editingNotes, setEditingNotes] = useState<string>("");
    const [savingNotes, setSavingNotes] = useState(false);
    const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
    const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
    const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
    const [selectedItemForAttachment, setSelectedItemForAttachment] = useState<MatrixItem | null>(null);
    const [commentsModalOpen, setCommentsModalOpen] = useState(false);
    const [selectedItemForComments, setSelectedItemForComments] = useState<MatrixItem | null>(null);
    const [pendingStatusChange, setPendingStatusChange] = useState<{ itemId: string; status: string } | null>(null);
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
                    
                    // Check if user is Super Admin
                    const { data: appUser } = await supabase
                        .from('app_user')
                        .select('roles')
                        .eq('email', user.email)
                        .single();
                    
                    if (appUser?.roles && Array.isArray(appUser.roles)) {
                        setIsSuperAdmin(appUser.roles.includes('SUPERADMIN'));
                    }
                }
            } catch (error) {
                console.error('Failed to get current user:', error);
            }
        };
        fetchCurrentUser();
    }, []);

    // Merge optimistic updates with actual items
    const itemsWithOptimistic = items.map(item => ({
        ...item,
        status: optimisticStatuses[item.id] ?? item.status
    }));

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
        const oldStatus = currentItem?.status;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Matrix.tsx:268',message:'handleStatusChange called',data:{id,newStatus,epicId,currentItem:{id:currentItem?.id,criterion_id:currentItem?.criterion_id,status:currentItem?.status}},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B',runId:'status-update'})}).catch(()=>{});
        // #endregion
        
        // If CONDITIONAL or NO_GO, require a comment before saving
        if (newStatus === 'CONDITIONAL' || newStatus === 'NO_GO') {
            // Store pending status change
            setPendingStatusChange({ itemId: id, status: newStatus });
            // Open comments modal for this item
            const item = items.find(item => item.id === id);
            if (item) {
                setSelectedItemForComments(item);
                setCommentsModalOpen(true);
            }
            return; // Don't save status yet, wait for comment
        }
        
        // For GO status, proceed with normal save
        // Optimistically update the UI immediately
        setOptimisticStatuses(prev => ({ ...prev, [id]: newStatus }));
        setSavingItems(prev => new Set(prev).add(id));
        
        try {
            console.log('Updating status:', { epicId, id, newStatus });
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
                console.error('Non-JSON response:', text);
                responseData = { error: text || 'Unknown error' };
            }
            
            if (!res.ok) {
                console.error('API Error:', { 
                    status: res.status, 
                    statusText: res.statusText, 
                    data: responseData,
                    url: `/api/epics/${epicId}/criteria/${id}`,
                    requestBody: { status: newStatus }
                });
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
                const errorMsg = responseData?.error || responseData?.message || `Failed to update status: ${res.status} ${res.statusText}`;
                throw new Error(errorMsg);
            }
            
            console.log('Status updated successfully:', responseData);
            // Clear optimistic update since server confirmed it
            setOptimisticStatuses(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            onUpdate(); // Refresh parent to get latest data
        } catch (e: any) {
            console.error('Failed to update status:', e);
            alert(`Failed to update status: ${e.message || e}`);
        } finally {
            setSavingItems(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
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

    const handleEditNotes = (item: MatrixItem) => {
        setEditingNotesId(item.id);
        setEditingNotes(item.current_status_notes || "");
    };

    const handleSaveNotes = async () => {
        if (!editingNotesId) return;
        
        setSavingNotes(true);
        try {
            const res = await fetch(`/api/epics/${epicId}/criteria/${editingNotesId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: editingNotes })
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Failed to update notes' }));
                throw new Error(errorData.error || `Failed to update notes: ${res.status}`);
            }
            
            setEditingNotesId(null);
            setEditingNotes("");
            onUpdate(); // Refresh parent to get latest data
        } catch (e: any) {
            console.error('Failed to update notes:', e);
            alert(`Failed to update notes: ${e.message || e}`);
        } finally {
            setSavingNotes(false);
        }
    };

    const handleCancelEditNotes = () => {
        setEditingNotesId(null);
        setEditingNotes("");
    };

    const handleOpenAttachments = (item: MatrixItem) => {
        setSelectedItemForAttachment(item);
        setAttachmentModalOpen(true);
    };

    const handleCloseAttachments = () => {
        setAttachmentModalOpen(false);
        setSelectedItemForAttachment(null);
    };

    const handleOpenComments = (item: MatrixItem) => {
        setSelectedItemForComments(item);
        setCommentsModalOpen(true);
    };

    const handleCloseComments = () => {
        setCommentsModalOpen(false);
        setSelectedItemForComments(null);
        setPendingStatusChange(null);
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
            setPendingStatusChange(null);
        }
        handleCloseComments();
    };

    const handleCancelRating = () => {
        // Revert the status change and show toast
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
            setPendingStatusChange(null);
            
            // Show toast explaining rating wasn't saved
            notifications.show({
                title: 'Rating cancelled',
                message: 'The rating change has been cancelled and was not saved. A comment is required for CONDITIONAL or NO_GO ratings.',
                color: 'orange',
                autoClose: 5000,
            });
        }
        handleCloseComments();
    };

    const handleCommentAdded = async () => {
        // After comment is added, save the pending status change
        if (pendingStatusChange && selectedItemForComments?.id === pendingStatusChange.itemId) {
            const id = pendingStatusChange.itemId;
            const newStatus = pendingStatusChange.status;
            const currentItem = items.find(item => item.id === id);
            const oldStatus = currentItem?.status;
            
            // Optimistically update the UI
            setOptimisticStatuses(prev => ({ ...prev, [id]: newStatus }));
            setSavingItems(prev => new Set(prev).add(id));
            
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
                    setOptimisticStatuses(prev => {
                        const next = { ...prev };
                        if (oldStatus) {
                            next[id] = oldStatus;
                        } else {
                            delete next[id];
                        }
                        return next;
                    });
                    const errorMsg = responseData?.error || responseData?.message || `Failed to update status: ${res.status}`;
                    throw new Error(errorMsg);
                }
                
                setOptimisticStatuses(prev => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
                setPendingStatusChange(null);
                onUpdate();
            } catch (e: any) {
                console.error('Failed to update status:', e);
                alert(`Failed to update status: ${e.message || e}`);
            } finally {
                setSavingItems(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            }
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
        
        try {
            const res = await fetch(`/api/epics/${epicId}/delegate`, {
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

            handleCloseDelegation();
            
            // Show success toast with Slack message info
            notifications.show({
                title: 'Delegation successful',
                message: `Task has been delegated to ${newApproverEmail}. A Slack notification has been sent to notify them.`,
                color: 'green',
                autoClose: 5000,
            });
            
            // Force refresh to update approver info
            onUpdate();
        } catch (error) {
            console.error('Delegation error:', error);
            notifications.show({
                title: 'Delegation failed',
                message: error instanceof Error ? error.message : 'Failed to delegate task',
                color: 'red',
                autoClose: 5000,
            });
            throw error;
        }
    };

    const isCollapsed = (cat: string) => collapsedCategories.has(cat);
    const hasOverall = (cat: string) => categoryOverallItems[cat] !== null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                            className="flex items-center gap-2 px-6 py-3 cursor-pointer select-none hover:bg-gray-50 transition-colors"
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
                            <div className="px-6 pb-6">
                            <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                            <table className="min-w-full divide-y divide-purple-200 table-fixed w-full">
                                <colgroup>
                                    <col style={{ width: 'auto' }} />
                                    <col style={{ width: '120px' }} />
                                    <col style={{ width: '150px' }} />
                                    <col style={{ width: '120px' }} />
                                    <col style={{ width: 'auto' }} />
                                </colgroup>
                                <thead className="bg-purple-100">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Criterion</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 normal-case" style={{ width: '120px', textTransform: 'none' }}>Status</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900" style={{ width: '150px' }}>Approver</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900" style={{ width: '120px' }}>Due On</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-purple-200">
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
                                            <tr key={item.id} className={`hover:bg-purple-50 transition-colors ${isOverall && !isSignoff ? 'cursor-pointer' : ''} ${item.notRequired ? 'opacity-60' : ''}`} onClick={isOverall && !isSignoff ? () => toggleCategory(cat) : undefined}>
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
                                                <span className="flex items-center gap-1.5">
                                                    {item.criterion.label}
                                                    {item.criterion.gate && (
                                                        <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">GATE</span>
                                                    )}
                                                </span>
                                            </div>
                                            {item.criterion.description && (
                                                <div className="text-sm text-gray-500 mt-1">{item.criterion.description}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap" style={{ width: '120px' }}>
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
                                                />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700" style={{ width: '150px' }}>
                                            {item.approverEmail ? (
                                                <div 
                                                    className="flex items-center gap-2 min-w-0"
                                                >
                                                    <Avatar
                                                        src={item.approverInfo?.avatar_url || undefined}
                                                        alt={item.approverEmail}
                                                        radius="xl"
                                                        size={24}
                                                        color={getAvatarColor(item.approverEmail)}
                                                        className="flex-shrink-0"
                                                    >
                                                        {getInitials(item.approverEmail, item.approverInfo?.first_name, item.approverInfo?.last_name)}
                                                    </Avatar>
                                                    <span className="text-sm truncate min-w-0 flex-1">
                                                        {getDisplayName(item.approverInfo?.first_name, item.approverInfo?.last_name, item.approverEmail)}
                                                    </span>
                                                    {(isSuperAdmin || currentUserEmail === item.approverEmail) && (
                                                        <Tooltip label="Delegate this task" position="top" withArrow>
                                                            <button
                                                                className="delegation-btn ml-auto opacity-100 transition-opacity flex-shrink-0 hover:opacity-80"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleOpenDelegation(item);
                                                                }}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                                            >
                                                                <IconArrowsRightLeft size={16} className="text-gray-600" />
                                                            </button>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap" style={{ width: '120px' }}>
                                            {item.last_updated_at ? (
                                                new Date(item.last_updated_at).toLocaleDateString()
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            <div className="flex items-start gap-2">
                                                <div className="flex-1">
                                                    {item.current_status_notes ? (
                                                        <div 
                                                            className="[&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-1 [&_p]:mb-2 [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800"
                                                            dangerouslySetInnerHTML={{ __html: item.current_status_notes }}
                                                            style={{
                                                                whiteSpace: "pre-wrap",
                                                                wordBreak: "break-word",
                                                            }}
                                                        />
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </div>
                                                <div className="flex gap-1">
                                                    {/* Show comment bubble only if notes exist (we'll assume attachments enable it too) */}
                                                    {item.current_status_notes && (
                                                        <button
                                                            onClick={() => handleOpenComments(item)}
                                                            className="p-1 rounded hover:bg-gray-100 text-gray-600 transition-colors flex-shrink-0"
                                                            title="View comments"
                                                        >
                                                            <IconMessageCircle className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleOpenAttachments(item)}
                                                        className="p-1 rounded hover:bg-gray-100 text-gray-600 transition-colors flex-shrink-0"
                                                        title="Attach files"
                                                    >
                                                        <IconPaperclip className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleEditNotes(item)}
                                                        className="p-1 rounded hover:bg-gray-100 text-gray-600 transition-colors flex-shrink-0"
                                                        title="Edit notes"
                                                    >
                                                        <IconPencil className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            </div>
                            {hiddenCount > 0 && (
                                <div className="mt-3 text-sm text-gray-600">
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
                                <div className="mt-3 text-sm text-gray-600">
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
            
            {/* Notes Editing Modal */}
            <Modal
                opened={editingNotesId !== null}
                onClose={handleCancelEditNotes}
                title="Edit Notes"
                size="xl"
            >
                <div className="space-y-4">
                    <RichText
                        value={editingNotes}
                        onChange={setEditingNotes}
                        placeholder="Enter notes with formatting, links, and bullet points..."
                        rows={10}
                    />
                    <Group justify="flex-end" mt="xl">
                        <Button variant="outline" onClick={handleCancelEditNotes}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveNotes} loading={savingNotes}>
                            Save
                        </Button>
                    </Group>
                </div>
            </Modal>

            {/* File Attachment Modal */}
            {selectedItemForAttachment && (
                <FileAttachmentModal
                    opened={attachmentModalOpen}
                    onClose={handleCloseAttachments}
                    epicId={epicId}
                    taskId={selectedItemForAttachment.id}
                    taskLabel={selectedItemForAttachment.criterion.label}
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
        </div>
    );
}

