"use client";
import { useState } from "react";

type MatrixItem = {
    id: string;
    status: string;
    current_status_notes?: string;
    criterion: {
        id: string;
        label: string;
        category: string;
        gate: boolean;
        description?: string;
        sort_order?: number;
    };
};

type Props = {
    launchId: string;
    items: MatrixItem[];
    onUpdate: () => void;
};

export default function Matrix({ launchId, items, onUpdate }: Props) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Group by category
    const grouped = items.reduce((acc, item) => {
        const cat = item.criterion.category || 'OTHER';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {} as Record<string, MatrixItem[]>);

    // Sort items within each category by sort_order, then by label
    Object.keys(grouped).forEach(cat => {
        grouped[cat].sort((a, b) => {
            const sortA = a.criterion.sort_order ?? 0;
            const sortB = b.criterion.sort_order ?? 0;
            if (sortA !== sortB) {
                return sortA - sortB;
            }
            return (a.criterion.label || '').localeCompare(b.criterion.label || '');
        });
    });

    // Sort categories (optional)
    const categories = Object.keys(grouped).sort();

    async function handleStatusChange(id: string, newStatus: string) {
        setSaving(true);
        try {
            await fetch(`/api/launches/${launchId}/criteria/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            onUpdate(); // Refresh parent
        } catch (e) {
            console.error(e);
            alert("Failed to update status");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-8">
            {categories.map(cat => (
                <div key={cat} className="bg-white rounded shadow border overflow-hidden">
                    <div className="bg-gray-50 px-6 py-3 border-b font-semibold text-gray-700">
                        {cat}
                    </div>
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                            <tr>
                                <th className="px-6 py-3 w-1/2">Criterion</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {grouped[cat].map(item => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">
                                            {item.criterion.label}
                                            {item.criterion.gate && (
                                                <span className="ml-2 bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">GATE</span>
                                            )}
                                        </div>
                                        {item.criterion.description && (
                                            <div className="text-sm text-gray-500 mt-1">{item.criterion.description}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <select
                                            value={item.status}
                                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                            disabled={saving}
                                            className={`text-sm font-medium rounded px-2 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 ${item.status === 'GO' ? 'bg-green-100 text-green-800' :
                                                    item.status === 'NO_GO' ? 'bg-red-100 text-red-800' :
                                                        item.status === 'CONDITIONAL' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-gray-100 text-gray-800'
                                                }`}
                                        >
                                            <option value="NOT_SET">NOT SET</option>
                                            <option value="GO">GO</option>
                                            <option value="CONDITIONAL">CONDITIONAL</option>
                                            <option value="NO_GO">NO GO</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {item.current_status_notes || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}
