"use client";
import { useEffect, useState } from "react";
import { Launch, CreateLaunchDTO, LaunchTier } from "@/types/launches";
import Link from "next/link";

export default function LaunchesPage() {
    const [launches, setLaunches] = useState<Launch[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const [formData, setFormData] = useState<Partial<CreateLaunchDTO>>({
        name: "",
        tier: "TIER_3",
    });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            setLoading(true);
            const [launchesRes, productsRes] = await Promise.all([
                fetch("/api/launches"),
                fetch("/api/products")
            ]);

            if (!launchesRes.ok) throw new Error("Failed to fetch launches");
            // Products might fail if table is empty or API error, but let's try
            const launchesData = await launchesRes.json();
            setLaunches(launchesData);

            if (productsRes.ok) {
                const productsData = await productsRes.json();
                setProducts(productsData);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        try {
            const res = await fetch("/api/launches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to create launch");
            }

            const newLaunch = await res.json();
            setLaunches([newLaunch, ...launches]);
            setShowCreate(false);
            setFormData({ name: "", tier: "TIER_3" });
            alert("Launch created successfully!");
        } catch (e: any) {
            setError(e.message);
        }
    }

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold">Launches</h1>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                    {showCreate ? "Cancel" : "New Launch"}
                </button>
            </div>

            {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>}

            {showCreate && (
                <div className="bg-white p-6 rounded shadow mb-8 border">
                    <h2 className="text-xl font-semibold mb-4">Create New Launch</h2>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Launch Name</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Tier</label>
                                <select
                                    value={formData.tier}
                                    onChange={e => setFormData({ ...formData, tier: e.target.value as LaunchTier })}
                                    className="w-full p-2 border rounded"
                                >
                                    <option value="TIER_1">Tier 1 (Strategic)</option>
                                    <option value="TIER_2">Tier 2 (Major)</option>
                                    <option value="TIER_3">Tier 3 (Minor)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Product</label>
                                <select
                                    value={formData.product_id || ""}
                                    onChange={e => setFormData({ ...formData, product_id: e.target.value })}
                                    className="w-full p-2 border rounded"
                                >
                                    <option value="">Select Product...</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Target Date</label>
                                <input
                                    type="date"
                                    value={formData.target_launch_date || ""}
                                    onChange={e => setFormData({ ...formData, target_launch_date: e.target.value })}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Aha ID (Optional)</label>
                                <input
                                    type="text"
                                    value={formData.aha_id || ""}
                                    onChange={e => setFormData({ ...formData, aha_id: e.target.value })}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
                        >
                            Create Launch
                        </button>
                    </form>
                </div>
            )}

            <div className="bg-white rounded shadow overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="p-4 font-medium text-gray-500">Name</th>
                            <th className="p-4 font-medium text-gray-500">Tier</th>
                            <th className="p-4 font-medium text-gray-500">Product</th>
                            <th className="p-4 font-medium text-gray-500">Date</th>
                            <th className="p-4 font-medium text-gray-500">Status</th>
                            <th className="p-4 font-medium text-gray-500">Readiness</th>
                            <th className="p-4 font-medium text-gray-500">Risk</th>
                            <th className="p-4 font-medium text-gray-500">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {launches.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-gray-500">
                                    No launches found. Create one to get started.
                                </td>
                            </tr>
                        ) : (
                            launches.map(launch => (
                                <tr key={launch.id} className="hover:bg-gray-50">
                                    <td className="p-4 font-medium">
                                        <Link href={`/launches/${launch.id}`} className="text-blue-600 hover:underline">
                                            {launch.name}
                                        </Link>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${launch.tier === 'TIER_1' ? 'bg-purple-100 text-purple-800' :
                                            launch.tier === 'TIER_2' ? 'bg-blue-100 text-blue-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                            {launch.tier.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-600">
                                        {(launch as any).product?.name || '-'}
                                    </td>
                                    <td className="p-4 text-gray-600">
                                        {launch.target_launch_date ? new Date(launch.target_launch_date).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                            {launch.status}
                                        </span>
                                    </td>
                                    <td className="p-4 font-mono text-sm">
                                        {launch.readiness_score ? `${Math.round(launch.readiness_score * 100)}%` : '-'}
                                    </td>
                                    <td className="p-4">
                                        {launch.risk_level && (
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${launch.risk_level === 'HIGH' ? 'bg-red-100 text-red-800' :
                                                launch.risk_level === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
                                                    'bg-green-100 text-green-800'
                                                }`}>
                                                {launch.risk_level}
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <Link href={`/launches/${launch.id}`} className="text-gray-500 hover:text-gray-700">
                                            View
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
