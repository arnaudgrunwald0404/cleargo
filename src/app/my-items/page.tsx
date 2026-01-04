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
            <div className="pt-24 p-8 flex items-center justify-center">
                <PurpleLoader size="md" />
            </div>
        );
    }

    return (
        <div className="pt-24 pb-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-bold mb-6">My Items</h1>

            {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>}

            {items.length === 0 ? (
                <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                    <div className="px-4 py-8 text-center text-gray-500">You have no assigned items.</div>
                </div>
            ) : (
                <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                    <table className="min-w-full divide-y divide-purple-200 table-fixed">
                        <colgroup>
                            <col className="w-auto" />
                            <col className="w-auto" />
                            <col className="w-24" />
                            <col className="w-32" />
                            <col className="w-24" />
                        </colgroup>
                        <thead className="bg-purple-100">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Launch</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Criterion</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">Status</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">Condition Due</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-24">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-purple-200">
                            {items.map(item => (
                                <tr key={item.id} className="hover:bg-purple-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-gray-900">{item.launch.name}</div>
                                        <div className="text-xs text-gray-500">
                                            {item.launch.target_launch_date ? new Date(item.launch.target_launch_date).toLocaleDateString() : 'No date'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">
                                        <div className="font-medium text-gray-900">{item.criterion.label}</div>
                                        <div className="text-xs text-gray-500">{item.criterion.category}</div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap w-24">
                                        <StatusTrafficLight 
                                            status={item.status}
                                            itemId={item.id}
                                            epicId={item.launch.id}
                                            onStatusUpdate={loadData}
                                            isSaving={savingItems.has(item.id)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap w-32">
                                        {item.condition_due_date ? (
                                            <span className={new Date(item.condition_due_date) < new Date() ? 'text-red-600 font-medium' : ''}>
                                                {new Date(item.condition_due_date).toLocaleDateString()}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap w-24">
                                        <Link href={`/launches/${item.launch.id}`} className="text-sm text-gray-600 hover:text-gray-900">
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
