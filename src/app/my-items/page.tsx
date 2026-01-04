"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Tooltip } from "@mantine/core";
import { PurpleLoader } from "@/components/PurpleLoader";

type MyItem = {
    id: string;
    status: string;
    condition?: string;
    condition_due_date?: string;
    launch: {
        id: string;
        name: string;
        target_launch_date?: string;
        tier: string;
    };
    criterion: {
        label: string;
        category: string;
    };
};

// Read-only Traffic Light Status Indicator
function StatusTrafficLight({ 
    status, 
    itemId, 
    epicId, 
    onStatusUpdate,
    isSaving 
}: { 
    status: string; 
    itemId: string;
    epicId: string;
    onStatusUpdate: () => void;
    isSaving: boolean;
}) {
    const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
    
    const lights = [
        { 
            value: 'GO', 
            color: '#10b981', // green
            greyColor: '#d1d5db',
            label: 'GO',
            definition: 'Meets all requirements'
        },
        { 
            value: 'CONDITIONAL', 
            color: '#f59e0b', // yellow/amber
            greyColor: '#d1d5db',
            label: 'CONDITIONAL',
            definition: 'Meets requirements with conditions'
        },
        { 
            value: 'NO_GO', 
            color: '#ef4444', // red
            greyColor: '#d1d5db',
            label: 'NO GO',
            definition: 'Does not meet requirements'
        },
    ];

    const handleStatusChange = async (newStatus: string) => {
        if (newStatus === status) return;
        
        setOptimisticStatus(newStatus);
        
        try {
            const res = await fetch(`/api/epics/${epicId}/criteria/${itemId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to update status');
            }
            
            setOptimisticStatus(null);
            onStatusUpdate();
        } catch (error: any) {
            console.error('Failed to update status:', error);
            alert(`Failed to update status: ${error.message}`);
            setOptimisticStatus(null);
        }
    };

    const currentStatus = optimisticStatus || status;

    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {lights.map((light) => {
                const isSelected = currentStatus === light.value;
                
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
                            onClick={() => !isSaving && handleStatusChange(light.value)}
                            disabled={isSaving}
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                border: isSelected ? `3px solid ${light.color}` : '2px solid #e5e7eb',
                                backgroundColor: isSelected ? light.color : light.greyColor,
                                cursor: isSaving ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                                opacity: isSaving ? 0.5 : 1,
                                boxShadow: isSelected ? `0 0 8px ${light.color}66` : 'none',
                                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                            }}
                            onMouseEnter={(e) => {
                                if (!isSaving && !isSelected) {
                                    e.currentTarget.style.backgroundColor = `${light.color}40`;
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSaving && !isSelected) {
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

export default function MyItemsPage() {
    const [items, setItems] = useState<MyItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingItems, setSavingItems] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            setLoading(true);
            const res = await fetch("/api/my-items");
            if (!res.ok) throw new Error("Failed to fetch items");
            const data = await res.json();
            setItems(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <PurpleLoader size="md" />
            </div>
        );
    }

    return (
        <div className="pb-8 sm:px-6 lg:px-8" style={{
          maxWidth: 'var(--page-container-max-width)',
          margin: '0 auto',
          paddingLeft: 'var(--page-container-padding-x)',
          paddingRight: 'var(--page-container-padding-x)',
          paddingTop: 'var(--page-container-padding-top)',
          fontFamily: 'var(--font-body)'
        }}>
            <h1 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--font-size-page-title)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-gray-900)',
                marginBottom: 'var(--spacing-6)'
            }}>My Items</h1>

            {error && <div style={{
                backgroundColor: 'var(--color-error-light)',
                color: 'var(--color-error-dark)',
                padding: 'var(--spacing-4)',
                borderRadius: 'var(--radius-base)',
                marginBottom: 'var(--spacing-4)',
                fontFamily: 'var(--font-body)'
            }}>{error}</div>}

            {items.length === 0 ? (
                <div style={{
                    border: `2px solid var(--color-blue-200)`,
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--color-blue-50)',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        padding: 'var(--spacing-8) var(--spacing-4)',
                        textAlign: 'center',
                        color: 'var(--color-gray-500)',
                        fontFamily: 'var(--font-body)'
                    }}>You have no assigned items.</div>
                </div>
            ) : (
                <div style={{
                    border: `2px solid var(--color-blue-200)`,
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--color-blue-50)',
                    overflow: 'hidden'
                }}>
                    <table className="min-w-full table-fixed" style={{ borderCollapse: 'collapse' }}>
                        <colgroup>
                            <col className="w-auto" />
                            <col className="w-auto" />
                            <col className="w-24" />
                            <col className="w-32" />
                            <col className="w-24" />
                        </colgroup>
                        <thead style={{ backgroundColor: 'var(--color-blue-100)' }}>
                            <tr>
                                <th style={{
                                    padding: 'var(--spacing-2) var(--spacing-4)',
                                    textAlign: 'left',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    color: 'var(--color-blue-900)',
                                    fontFamily: 'var(--font-body)',
                                    borderBottom: `1px solid var(--color-blue-200)`
                                }}>Launch</th>
                                <th style={{
                                    padding: 'var(--spacing-2) var(--spacing-4)',
                                    textAlign: 'left',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    color: 'var(--color-blue-900)',
                                    fontFamily: 'var(--font-body)',
                                    borderBottom: `1px solid var(--color-blue-200)`
                                }}>Criterion</th>
                                <th style={{
                                    padding: 'var(--spacing-2) var(--spacing-4)',
                                    textAlign: 'left',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    color: 'var(--color-blue-900)',
                                    fontFamily: 'var(--font-body)',
                                    width: '96px',
                                    borderBottom: `1px solid var(--color-blue-200)`
                                }}>Status</th>
                                <th style={{
                                    padding: 'var(--spacing-2) var(--spacing-4)',
                                    textAlign: 'left',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    color: 'var(--color-blue-900)',
                                    fontFamily: 'var(--font-body)',
                                    width: '128px',
                                    borderBottom: `1px solid var(--color-blue-200)`
                                }}>Condition Due</th>
                                <th style={{
                                    padding: 'var(--spacing-2) var(--spacing-4)',
                                    textAlign: 'right',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    color: 'var(--color-blue-900)',
                                    fontFamily: 'var(--font-body)',
                                    width: '96px',
                                    borderBottom: `1px solid var(--color-blue-200)`
                                }}>Action</th>
                            </tr>
                        </thead>
                        <tbody style={{ backgroundColor: 'var(--color-white)' }}>
                            {items.map(item => (
                                <tr 
                                    key={item.id} 
                                    style={{
                                        borderBottom: `1px solid var(--color-blue-200)`,
                                        transition: 'var(--transition-fast)'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-blue-50)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-white)'}
                                >
                                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                                        <div style={{
                                            fontWeight: 'var(--font-weight-medium)',
                                            color: 'var(--color-gray-900)',
                                            fontFamily: 'var(--font-body)'
                                        }}>{item.launch.name}</div>
                                        <div style={{
                                            fontSize: 'var(--font-size-xs)',
                                            color: 'var(--color-gray-500)',
                                            fontFamily: 'var(--font-body)'
                                        }}>
                                            {item.launch.target_launch_date ? new Date(item.launch.target_launch_date).toLocaleDateString() : 'No date'}
                                        </div>
                                    </td>
                                    <td style={{
                                        padding: 'var(--spacing-3) var(--spacing-4)',
                                        fontSize: 'var(--font-size-sm)',
                                        color: 'var(--color-gray-700)',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        <div style={{
                                            fontWeight: 'var(--font-weight-medium)',
                                            color: 'var(--color-gray-900)',
                                            fontFamily: 'var(--font-body)'
                                        }}>{item.criterion.label}</div>
                                        <div style={{
                                            fontSize: 'var(--font-size-xs)',
                                            color: 'var(--color-gray-500)',
                                            fontFamily: 'var(--font-body)'
                                        }}>{item.criterion.category}</div>
                                    </td>
                                    <td style={{
                                        padding: 'var(--spacing-3) var(--spacing-4)',
                                        whiteSpace: 'nowrap',
                                        width: '96px'
                                    }}>
                                        <StatusTrafficLight 
                                            status={item.status}
                                            itemId={item.id}
                                            epicId={item.launch.id}
                                            onStatusUpdate={loadData}
                                            isSaving={savingItems.has(item.id)}
                                        />
                                    </td>
                                    <td style={{
                                        padding: 'var(--spacing-3) var(--spacing-4)',
                                        fontSize: 'var(--font-size-sm)',
                                        color: 'var(--color-gray-700)',
                                        whiteSpace: 'nowrap',
                                        width: '128px',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        {item.condition_due_date ? (
                                            <span style={{
                                                color: new Date(item.condition_due_date) < new Date() ? 'var(--color-error-base)' : 'inherit',
                                                fontWeight: new Date(item.condition_due_date) < new Date() ? 'var(--font-weight-medium)' : 'normal'
                                            }}>
                                                {new Date(item.condition_due_date).toLocaleDateString()}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td style={{
                                        padding: 'var(--spacing-3) var(--spacing-4)',
                                        textAlign: 'right',
                                        whiteSpace: 'nowrap',
                                        width: '96px'
                                    }}>
                                        <Link href={`/launches/${item.launch.id}`} style={{
                                            fontSize: 'var(--font-size-sm)',
                                            color: 'var(--color-gray-600)',
                                            textDecoration: 'none',
                                            fontFamily: 'var(--font-body)'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-gray-900)'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-gray-600)'}
                                        >
                                            View
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
