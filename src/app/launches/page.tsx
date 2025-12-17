'use client';
import { useEffect, useState } from 'react';
import { Epic, CreateEpicDTO, EpicTier } from '@/types/epics';
import Link from 'next/link';

interface ReleaseGroup {
  releaseName: string;
  releaseDate: string | null;
  epics: Epic[];
}

export default function EpicsPage() {
  const [epics, setEpics] = useState<Epic[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [releaseSchedule, setReleaseSchedule] = useState<
    Array<{ release_name: string; launch_date: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [formData, setFormData] = useState<Partial<CreateEpicDTO>>({
    name: '',
    tier: 'TIER_3',
  });

  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    tier: 'ALL',
    status: 'ALL',
    risk: 'ALL',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      // Fast auth check: if not signed in, send to home/Welcome
      const me = await fetch('/api/me', { credentials: 'include' });
      if (me.status === 401) {
        window.location.href = '/';
        return;
      }

      const [epicsRes, productsRes, releasesRes] = await Promise.all([
        fetch('/api/epics', { credentials: 'include' }),
        fetch('/api/products', { credentials: 'include' }),
        fetch('/api/releases', { credentials: 'include' }),
      ]);

      if (epicsRes.status === 401) {
        window.location.href = '/';
        return;
      }
      if (!epicsRes.ok) throw new Error('Failed to fetch epics');
      // Products might fail if table is empty or API error, but let's try
      const epicsData = await epicsRes.json();
      setEpics(epicsData);

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
      const res = await fetch('/api/epics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create epic');
      }

      const newEpic = await res.json();
      setEpics([newEpic, ...epics]);
      setShowCreate(false);
      setFormData({ name: '', tier: 'TIER_3' });
      alert('Epic created successfully!');
    } catch (e: any) {
      setError(e.message);
    }
  }

  const filteredEpics = epics.filter((l) => {
    if (filters.search && !l.name.toLowerCase().includes(filters.search.toLowerCase()))
      return false;
    if (filters.tier !== 'ALL' && l.tier !== filters.tier) return false;
    if (filters.status !== 'ALL' && l.status !== filters.status) return false;
    if (filters.risk !== 'ALL' && (l.risk_level || 'LOW') !== filters.risk) return false;
    return true;
  });

  // Extract release name from epic's aha_fields
  const getReleaseName = (epic: Epic): string | null => {
    if (!epic.aha_fields || typeof epic.aha_fields !== 'object') return null;
    const fields = epic.aha_fields as any;

    // Check standard fields
    if (fields.standard_fields && typeof fields.standard_fields === 'object') {
      const standardFields = fields.standard_fields;
      const releaseName = standardFields?.aha_release_name || standardFields?.release?.name || null;
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
  releaseSchedule.forEach((release) => {
    if (release.release_name) {
      releaseDateMap.set(release.release_name, release.launch_date);
    }
  });

  // Separate launched epics for feedback section
  const launchedEpics: Epic[] = [];
  const notLaunchedEpics: Epic[] = [];

  filteredEpics.forEach((epic) => {
    if (epic.status === 'LAUNCHED') {
      launchedEpics.push(epic);
    } else {
      notLaunchedEpics.push(epic);
    }
  });

  // Group NOT launched epics by release
  const releaseGroupsMap = new Map<string, Epic[]>();
  const ungroupedEpics: Epic[] = [];

  notLaunchedEpics.forEach((epic) => {
    const releaseName = getReleaseName(epic);
    if (releaseName) {
      if (!releaseGroupsMap.has(releaseName)) {
        releaseGroupsMap.set(releaseName, []);
      }
      releaseGroupsMap.get(releaseName)!.push(epic);
    } else {
      ungroupedEpics.push(epic);
    }
  });

  // Convert to array and sort by release date
  const releaseGroups: ReleaseGroup[] = Array.from(releaseGroupsMap.entries()).map(
    ([releaseName, epics]) => ({
      releaseName,
      releaseDate: releaseDateMap.get(releaseName) || null,
      epics,
    })
  );

  // Sort release groups by date (ascending), with null dates at the end
  releaseGroups.sort((a, b) => {
    if (!a.releaseDate && !b.releaseDate) return 0;
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
  });

  // Add ungrouped epics as a separate group at the end
  if (ungroupedEpics.length > 0) {
    releaseGroups.push({
      releaseName: 'Ungrouped',
      releaseDate: null,
      epics: ungroupedEpics,
    });
  }

  if (loading) return <div className="pt-24 p-8">Loading...</div>;

  return (
    <div className="pt-24 pb-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-2xl font-bold">Epics</h1>
          <p className="text-sm text-gray-600 mt-1">
            Epics appear here if: Launch Candidate = true OR tags contain "LaunchConsole"
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showCreate ? 'Cancel' : 'New Epic'}
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 mb-6 flex gap-4 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search epics..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="p-2 border rounded w-64"
        />
        <select
          value={filters.tier}
          onChange={(e) => setFilters({ ...filters, tier: e.target.value })}
          className="p-2 border rounded"
        >
          <option value="ALL">All Tiers</option>
          <option value="TIER_1">Tier 1</option>
          <option value="TIER_2">Tier 2</option>
          <option value="TIER_3">Tier 3</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
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
          onChange={(e) => setFilters({ ...filters, risk: e.target.value })}
          className="p-2 border rounded"
        >
          <option value="ALL">All Risks</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </div>

      {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>}

      {launchedEpics.length === 0 && releaseGroups.length === 0 ? (
        <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
          <div className="px-4 py-8 text-center text-gray-500">
            No epics found matching filters.
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Feedback Section for Launched Epics */}
          {launchedEpics.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                Release is ready for feedback.
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
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">
                        Name
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Tier
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">
                        Product
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Readiness
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Risk
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-24">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-purple-200">
                    {launchedEpics.map((epic) => (
                      <tr key={epic.id} className="hover:bg-purple-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/epics/${epic.id}`}
                            className="font-medium text-gray-900 hover:text-blue-600"
                          >
                            {epic.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap w-24">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              epic.tier === 'TIER_1'
                                ? 'bg-purple-100 text-purple-800'
                                : epic.tier === 'TIER_2'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {epic.tier.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {(epic as any).product?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap w-32">
                          {epic.target_launch_date
                            ? new Date(epic.target_launch_date).toLocaleDateString()
                            : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap w-24">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                            {epic.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700 whitespace-nowrap w-24">
                          {epic.readiness_score
                            ? `${Math.round(epic.readiness_score * 100)}%`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap w-24">
                          {epic.risk_level && (
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                epic.risk_level === 'HIGH'
                                  ? 'bg-red-100 text-red-800'
                                  : epic.risk_level === 'MEDIUM'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {epic.risk_level}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap w-24">
                          <Link
                            href={`/epics/${epic.id}`}
                            className="text-sm text-gray-600 hover:text-gray-900"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Regular Release Groups */}
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
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">
                        Name
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Tier
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">
                        Product
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Readiness
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Risk
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-24">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-purple-200">
                    {group.epics.map((epic) => (
                      <tr key={epic.id} className="hover:bg-purple-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/epics/${epic.id}`}
                            className="font-medium text-gray-900 hover:text-blue-600"
                          >
                            {epic.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap w-24">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              epic.tier === 'TIER_1'
                                ? 'bg-purple-100 text-purple-800'
                                : epic.tier === 'TIER_2'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {epic.tier.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {(epic as any).product?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap w-32">
                          {epic.target_launch_date
                            ? new Date(epic.target_launch_date).toLocaleDateString()
                            : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap w-24">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            {epic.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700 whitespace-nowrap w-24">
                          {epic.readiness_score
                            ? `${Math.round(epic.readiness_score * 100)}%`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap w-24">
                          {epic.risk_level && (
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                epic.risk_level === 'HIGH'
                                  ? 'bg-red-100 text-red-800'
                                  : epic.risk_level === 'MEDIUM'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {epic.risk_level}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap w-24">
                          <Link
                            href={`/epics/${epic.id}`}
                            className="text-sm text-gray-600 hover:text-gray-900"
                          >
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
      )}

      {showCreate && (
        <div className="bg-white p-6 rounded shadow mb-8 border">
          <h2 className="text-xl font-semibold mb-4">Create New Epic</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Epic Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tier</label>
                <select
                  value={formData.tier}
                  onChange={(e) => setFormData({ ...formData, tier: e.target.value as EpicTier })}
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
                  value={formData.product_id || ''}
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select Product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Target Date</label>
                <input
                  type="date"
                  value={formData.target_launch_date || ''}
                  onChange={(e) => setFormData({ ...formData, target_launch_date: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Aha ID (Optional)</label>
                <input
                  type="text"
                  value={formData.aha_id || ''}
                  onChange={(e) => setFormData({ ...formData, aha_id: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
            </div>

            <button
              type="submit"
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
            >
              Create Epic
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
