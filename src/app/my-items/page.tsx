"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function MyItemsPage() {
    const [items, setItems] = useState<MyItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="px-8 pt-24 pb-8 max-w-6xl mx-auto">
            <div className="mb-6">
                <Link href="/" className="text-blue-600 hover:underline">← Back to Home</Link>
            </div>

            <h1 className="text-2xl font-bold mb-6">My Items</h1>

            {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>}

            {items.length === 0 ? (
                <div className="bg-gray-50 p-8 text-center text-gray-500 rounded border">
                    You have no assigned items.
                </div>
            ) : (
                <div className="bg-white rounded shadow overflow-hidden border">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="p-4 font-medium text-gray-500">Launch</th>
                                <th className="p-4 font-medium text-gray-500">Criterion</th>
                                <th className="p-4 font-medium text-gray-500">Status</th>
                                <th className="p-4 font-medium text-gray-500">Condition Due</th>
                                <th className="p-4 font-medium text-gray-500">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map(item => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="p-4">
                                        <div className="font-medium">{item.launch.name}</div>
                                        <div className="text-xs text-gray-500">
                                            {item.launch.target_launch_date ? new Date(item.launch.target_launch_date).toLocaleDateString() : 'No date'}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-medium">{item.criterion.label}</div>
                                        <div className="text-xs text-gray-500">{item.criterion.category}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${item.status === 'GO' ? 'bg-green-100 text-green-800' :
                                            item.status === 'NO_GO' ? 'bg-red-100 text-red-800' :
                                                item.status === 'CONDITIONAL' ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-gray-100 text-gray-800'
                                            }`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {item.condition_due_date ? (
                                            <span className={new Date(item.condition_due_date) < new Date() ? 'text-red-600 font-medium' : ''}>
                                                {new Date(item.condition_due_date).toLocaleDateString()}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td className="p-4">
                                        <Link href={`/launches/${item.launch.id}`} className="text-blue-600 hover:underline">
                                            View Launch
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
