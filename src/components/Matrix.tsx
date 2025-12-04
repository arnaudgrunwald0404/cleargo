"use client";
import { useState } from "react";
import { Select, Avatar, Modal, Button, Group } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconPencil } from "@tabler/icons-react";
import { UserDisplay } from "./UserDisplay";
import { RichText } from "./admin/RichText";

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
    };
};

// Status options configuration
const STATUS_OPTIONS = [
    { value: 'NOT_SET', label: 'Not Set', color: { bg: '#F3F4F6', text: '#1F2937' } },
    { value: 'GO', label: 'Go', color: { bg: '#D1FAE5', text: '#065F46' } },
    { value: 'CONDITIONAL', label: 'Conditional', color: { bg: '#FEF3C7', text: '#92400E' } },
    { value: 'NO_GO', label: 'No Go', color: { bg: '#FEE2E2', text: '#991B1B' } },
];

const getStatusColor = (status: string) => {
    const statusOption = STATUS_OPTIONS.find(opt => opt.value === status);
    return statusOption?.color || STATUS_OPTIONS[0].color;
};

const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
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
    items: MatrixItem[];
    onUpdate: () => void;
};

export default function Matrix({ epicId, items, onUpdate }: Props) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
    const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({});
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
    const [editingNotes, setEditingNotes] = useState<string>("");
    const [savingNotes, setSavingNotes] = useState(false);

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
            
            const responseData = await res.json().catch(() => null);
            
            if (!res.ok) {
                console.error('API Error:', { status: res.status, statusText: res.statusText, data: responseData });
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
                throw new Error(responseData?.error || `Failed to update status: ${res.status} ${res.statusText}`);
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

    const isCollapsed = (cat: string) => collapsedCategories.has(cat);
    const hasOverall = (cat: string) => categoryOverallItems[cat] !== null;

    return (
        <div className="space-y-8">
            {categories.map(cat => {
                const overallItem = categoryOverallItems[cat];
                const regularItems = categoryRegularItems[cat];
                const allItems = overallItem 
                    ? [overallItem, ...regularItems]
                    : regularItems;
                const collapsed = isCollapsed(cat);
                const showOverall = hasOverall(cat);

                return (
                    <div key={cat} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="text-sm font-semibold text-gray-900 mb-4">{cat}</h3>
                        <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                            <table className="min-w-full divide-y divide-purple-200 table-fixed w-full">
                                <colgroup>
                                    <col style={{ width: 'auto' }} />
                                    <col style={{ width: '160px' }} />
                                    <col style={{ width: '200px' }} />
                                    <col style={{ width: '120px' }} />
                                    <col style={{ width: 'auto' }} />
                                </colgroup>
                                <thead className="bg-purple-100">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Criterion</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 normal-case" style={{ width: '160px', textTransform: 'none' }}>Status</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900" style={{ width: '200px' }}>Approver</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900" style={{ width: '120px' }}>Due On</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-purple-200">
                                    {allItems.map((item, index) => {
                                        const isOverall = showOverall && index === 0;
                                        
                                        // Hide regular items when collapsed
                                        if (!isOverall && collapsed) {
                                            return null;
                                        }
                                        
                                        return (
                                            <tr key={item.id} className={`hover:bg-purple-50 transition-colors ${isOverall ? 'cursor-pointer' : ''} ${item.notRequired ? 'opacity-60' : ''}`} onClick={isOverall ? () => toggleCategory(cat) : undefined}>
                                        <td className="px-4 py-3">
                                            <div className={`font-medium flex items-center gap-2 ${item.notRequired ? 'text-gray-500' : 'text-gray-900'}`}>
                                                {isOverall && (
                                                    <span className="text-gray-500">
                                                        {collapsed ? (
                                                            <IconChevronRight size={16} />
                                                        ) : (
                                                            <IconChevronDown size={16} />
                                                        )}
                                                    </span>
                                                )}
                                                {item.criterion.label}
                                                {item.criterion.gate && (
                                                    <span className="ml-2 bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">GATE</span>
                                                )}
                                            </div>
                                            {item.criterion.description && (
                                                <div className="text-sm text-gray-500 mt-1">{item.criterion.description}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap" style={{ width: '160px' }}>
                                            {item.notRequired ? (
                                                <div className="text-xs font-medium text-gray-500">Not required</div>
                                            ) : (
                                                <Select
                                                    value={item.status}
                                                    onChange={(value) => {
                                                        if (value && value !== item.status) {
                                                            handleStatusChange(item.id, value);
                                                        }
                                                    }}
                                                    disabled={savingItems.has(item.id)}
                                                    data={STATUS_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
                                                    styles={{
                                                        input: {
                                                            fontSize: '0.875rem',
                                                            fontWeight: 500,
                                                            padding: '0.25rem 0.5rem',
                                                            border: 'none',
                                                            ...getStatusColor(item.status)
                                                        },
                                                    }}
                                                    classNames={{
                                                        option: 'status-option',
                                                    }}
                                                    size="xs"
                                                />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700" style={{ width: '200px' }}>
                                            {item.approverEmail ? (
                                                <UserDisplay
                                                    email={item.approverEmail}
                                                    firstName={item.approverInfo?.first_name}
                                                    lastName={item.approverInfo?.last_name}
                                                    avatarUrl={item.approverInfo?.avatar_url}
                                                    size="sm"
                                                />
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
                                                <button
                                                    onClick={() => handleEditNotes(item)}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-600 transition-colors flex-shrink-0"
                                                    title="Edit notes"
                                                >
                                                    <IconPencil className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
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
        </div>
    );
}

