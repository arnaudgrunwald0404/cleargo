"use client";
import { useEffect, useState } from "react";
import { Launch, CreateLaunchDTO, LaunchTier } from "@/types/launches";
import Link from "next/link";

interface ReleaseGroup {
    releaseName: string;
    releaseDate: string | null;
    launches: Launch[];
}

export default function LaunchesPage() {
    const [launches, setLaunches] = useState<Launch[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [releaseSchedule, setReleaseSchedule] = useState<Array<{ release_name: string; launch_date: string | null }>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const [formData, setFormData] = useState<Partial<CreateLaunchDTO>>({
        name: "",
        tier: "TIER_3",
    });

    // Filter state
    const [filters, setFilters] = useState({
        search: "",
        tier: "ALL",
        status: "ALL",
        risk: "ALL"
    });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            setLoading(true);
            const [launchesRes, productsRes, releasesRes] = await Promise.all([
                fetch("/api/launches"),
                fetch("/api/products"),
                fetch("/api/releases")
            ]);

            if (!launchesRes.ok) throw new Error("Failed to fetch launches");
            // Products might fail if table is empty or API error, but let's try
            const launchesData = await launchesRes.json();
            setLaunches(launchesData);

            if (productsRes.ok) {
                const productsData = await productsRes.json();
                setProducts(productsData);
            }

            if (releasesRes.ok) {
                const releasesData = await releasesRes.json();
                setReleaseSchedule(releasesData || []);
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

    const filteredLaunches = launches.filter(l => {
        if (filters.search && !l.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.tier !== "ALL" && l.tier !== filters.tier) return false;
        if (filters.status !== "ALL" && l.status !== filters.status) return false;
        if (filters.risk !== "ALL" && (l.risk_level || 'LOW') !== filters.risk) return false;
        return true;
    });

    // Extract release name from launch's aha_fields
    const getReleaseName = (launch: Launch): string | null => {
        if (!launch.aha_fields || typeof launch.aha_fields !== 'object') return null;
        const fields = launch.aha_fields as any;

        // Check standard fields
        if (fields.standard_fields && typeof fields.standard_fields === 'object') {
            const standardFields = fields.standard_fields;
            const releaseName = standardFields?.aha_release_name ||
                standardFields?.release?.name || null;
            if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
                return releaseName.trim();
            }
        }

        // Check custom fields
        if (fields.custom_fields && typeof fields.custom_fields === 'object') {
            const customFields = fields.custom_fields;
            const releaseName = customFields?.release_target_after_pod_planning;
            if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
                return releaseName.trim();
            }
        }

        return null;
    };

    // Create a map of release names to dates from release schedule
    const releaseDateMap = new Map<string, string | null>();
    releaseSchedule.forEach(release => {
        if (release.release_name) {
            releaseDateMap.set(release.release_name, release.launch_date);
        }
    });

    // Group launches by release
    const releaseGroupsMap = new Map<string, Launch[]>();
    const ungroupedLaunches: Launch[] = [];

    filteredLaunches.forEach(launch => {
        const releaseName = getReleaseName(launch);
        if (releaseName) {
            if (!releaseGroupsMap.has(releaseName)) {
                releaseGroupsMap.set(releaseName, []);
            }
            releaseGroupsMap.get(releaseName)!.push(launch);
        } else {
            ungroupedLaunches.push(launch);
        }
    });

    // Convert to array and sort by release date
    const releaseGroups: ReleaseGroup[] = Array.from(releaseGroupsMap.entries()).map(([releaseName, launches]) => ({
        releaseName,
        releaseDate: releaseDateMap.get(releaseName) || null,
        launches
    }));

    // Sort release groups by date (ascending), with null dates at the end
    releaseGroups.sort((a, b) => {
        if (!a.releaseDate && !b.releaseDate) return 0;
        if (!a.releaseDate) return 1;
        if (!b.releaseDate) return -1;
        return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
    });

    // Add ungrouped launches as a separate group at the end
    if (ungroupedLaunches.length > 0) {
        releaseGroups.push({
            releaseName: "Ungrouped",
            releaseDate: null,
            launches: ungroupedLaunches
        });
    }

    if (loading) return <div className="pt-24 p-8">Loading...</div>;

    return (
        <div className="pt-24 pb-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold">Launches</h1>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                    {showCreate ? "Cancel" : "New Launch"}
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded shadow border mb-6 flex gap-4 flex-wrap items-center">
                <input
                    type="text"
                    placeholder="Search launches..."
                    value={filters.search}
                    onChange={e => setFilters({ ...filters, search: e.target.value })}
                    className="p-2 border rounded w-64"
                />
                <select
                    value={filters.tier}
                    onChange={e => setFilters({ ...filters, tier: e.target.value })}
                    className="p-2 border rounded"
                >
                    <option value="ALL">All Tiers</option>
                    <option value="TIER_1">Tier 1</option>
                    <option value="TIER_2">Tier 2</option>
                    <option value="TIER_3">Tier 3</option>
                </select>
                <select
                    value={filters.status}
                    onChange={e => setFilters({ ...filters, status: e.target.value })}
                    className="p-2 border rounded"
                >
                    <option value="ALL">All Statuses</option>
                    <option value="PLANNED">Planned</option>
                    <option value="PRE_LAUNCH">Pre-Launch</option>
                    <option value="LAUNCHING">Launching</option>
                    <option value="LAUNCHED">Launched</option>
                </select>
                <select
                    value={filters.risk}
                    onChange={e => setFilters({ ...filters, risk: e.target.value })}
                    className="p-2 border rounded"
                >
                    <option value="ALL">All Risks</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                </select>
            </div>

            {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>}

            {
                releaseGroups.length === 0 ? (
                    <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                        <div className="px-4 py-8 text-center text-gray-500">
                            No launches found matching filters.
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {releaseGroups.map((group, groupIndex) => (
                            <div key={groupIndex} className="space-y-2">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    {group.releaseName}
                                    {group.releaseDate && (
                                        <span className="ml-2 text-base font-normal text-gray-600">
                                            - {new Date(group.releaseDate).toLocaleDateString()}
                                        </span>
                                    )}
                                </h2>
                                <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                                    <table className="min-w-full divide-y divide-purple-200 table-fixed">
                                        <colgroup>
                                            <col className="w-auto" />
                                            <col className="w-24" />
                                            <col className="w-auto" />
                                            <col className="w-32" />
                                            <col className="w-24" />
                                            <col className="w-24" />
                                            <col className="w-24" />
                                            <col className="w-24" />
                                        </colgroup>
                                        <thead className="bg-purple-100">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Name</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">Tier</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Product</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">Date</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">Status</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">Readiness</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">Risk</th>
                                                <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-24">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-purple-200">
                                            {group.launches.map(launch => (
                                                <tr key={launch.id} className="hover:bg-purple-50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <Link href={`/launches/${launch.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                                                            {launch.name}
                                                        </Link>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap w-24">
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${launch.tier === 'TIER_1' ? 'bg-purple-100 text-purple-800' :
                                                            launch.tier === 'TIER_2' ? 'bg-blue-100 text-blue-800' :
                                                                'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {launch.tier.replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-700">
                                                        {(launch as any).product?.name || '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap w-32">
                                                        {launch.target_launch_date ? new Date(launch.target_launch_date).toLocaleDateString() : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap w-24">
                                                        <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                                            {launch.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-sm text-gray-700 whitespace-nowrap w-24">
                                                        {launch.readiness_score ? `${Math.round(launch.readiness_score * 100)}%` : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap w-24">
                                                        {launch.risk_level && (
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${launch.risk_level === 'HIGH' ? 'bg-red-100 text-red-800' :
                                                                launch.risk_level === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
                                                                    'bg-green-100 text-green-800'
                                                                }`}>
                                                                {launch.risk_level}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right whitespace-nowrap w-24">
                                                        <Link href={`/launches/${launch.id}`} className="text-sm text-gray-600 hover:text-gray-900">
                                                            View
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }

            {
                showCreate && (
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
                )
            }

        </div >
    );
}
