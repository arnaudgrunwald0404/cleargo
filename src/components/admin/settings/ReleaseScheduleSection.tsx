"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { PurpleLoader } from '../../PurpleLoader';

type LaunchRelease = { releaseName: string; launchDate: string | null };

type Props = {
  releases: any[];
  loading: boolean;
  releaseNameInput: string;
  setReleaseNameInput: (input: string) => void;
  releaseDateInput: string;
  setReleaseDateInput: (input: string) => void;
  onAdd: () => void;
  onDelete: (id: number) => void;
  editingReleaseId: number | string | null;
  setEditingReleaseId: (id: number | string | null) => void;
  onUpdate: (id: number, releaseName: string, launchDate: string) => void;
  launchReleases: Array<LaunchRelease>;
  launchReleasesLoading: boolean;
  onRefresh: () => void;
  onRefreshReleases: () => Promise<void>;
};

export default function ReleaseScheduleSection(props: Props) {
  const {
    releases,
    loading,
    releaseNameInput,
    setReleaseNameInput,
    releaseDateInput,
    setReleaseDateInput,
    onAdd,
    onDelete,
    editingReleaseId,
    setEditingReleaseId,
    onUpdate,
    launchReleases,
    launchReleasesLoading,
    onRefresh,
    onRefreshReleases,
  } = props;

  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const [syncing, setSyncing] = useState(false);
  const [syncingReleaseId, setSyncingReleaseId] = useState<number | null>(null);
  const [epicCounts, setEpicCounts] = useState<Map<string, { cleargoCount: number | null; ahaCount: number | null }>>(new Map());
  const fetchingCountsRef = useRef<Set<string>>(new Set());

  // Filter releases to show only those with launch dates before today (excluding archived)
  const pastReleases = useMemo(() => {
    // Get today's date in YYYY-MM-DD format for comparison
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    return releases.filter((release) => {
      if (!release.launch_date || release.archived) return false;
      
      // launch_date comes from Supabase as YYYY-MM-DD string
      const launchDateString = typeof release.launch_date === 'string' 
        ? release.launch_date.split('T')[0] // Handle ISO strings if any
        : new Date(release.launch_date).toISOString().split('T')[0];
      
      // Compare date strings directly (YYYY-MM-DD format)
      // This works because YYYY-MM-DD format is lexicographically sortable
      return launchDateString < todayString;
    });
  }, [releases]);

  // Separate archived releases
  const archivedReleases = useMemo(() => {
    return releases.filter((release) => release.archived === true);
  }, [releases]);

  // Fetch epic counts for releases (both past and archived)
  useEffect(() => {
    const fetchEpicCounts = async () => {
      const releasesToFetch = [...pastReleases, ...archivedReleases]
        .filter(release => 
          release.release_name && 
          !epicCounts.has(release.release_name) &&
          !fetchingCountsRef.current.has(release.release_name)
        )
        .map(release => release.release_name);

      if (releasesToFetch.length === 0) return;

      // Mark as fetching
      releasesToFetch.forEach(name => fetchingCountsRef.current.add(name));

      // Fetch counts for all releases in parallel
      const countPromises = releasesToFetch.map(async (releaseName) => {
        try {
          const res = await fetch(`/api/releases/epic-count/${encodeURIComponent(releaseName)}`, {
            credentials: 'include'
          });
          if (res.ok) {
            const data = await res.json();
            return { 
              releaseName, 
              cleargoCount: data.cleargoCount ?? null,
              ahaCount: data.ahaCount ?? null
            };
          }
          return { releaseName, cleargoCount: null, ahaCount: null };
        } catch (error) {
          return { releaseName, cleargoCount: null, ahaCount: null };
        }
      });

      const results = await Promise.all(countPromises);
      const newCounts = new Map(epicCounts);
      results.forEach(({ releaseName, cleargoCount, ahaCount }) => {
        newCounts.set(releaseName, { cleargoCount, ahaCount });
      });
      setEpicCounts(newCounts);

      // Clear fetching state
      releasesToFetch.forEach(name => fetchingCountsRef.current.delete(name));
    };

    fetchEpicCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastReleases.length]);

  const handleSyncReleases = async () => {
    if (!confirm("This will sync releases from Aha that contain epics. Continue?")) {
      return;
    }
    
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/aha/sync-releases", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to sync releases");
      }
      
      const result = await res.json();
      const withoutDatesMsg = result.releases_without_dates && result.releases_without_dates.length > 0
        ? `\nReleases without dates: ${result.releases_without_dates.length} (${result.releases_without_dates.map((r: any) => r.name).join(', ')})`
        : '';
      alert(`Success: ${result.message}\n\nTotal releases: ${result.total_releases}\nReleases with epics: ${result.releases_with_epics}\nSynced: ${result.synced}${withoutDatesMsg}${result.errors > 0 ? `\nErrors: ${result.errors}` : ""}`);
      
      // Refresh the release list
      await onRefreshReleases();
      await onRefresh();
      // Clear epic counts to trigger refetch
      setEpicCounts(new Map());
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };


  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Release Schedule</h2>
          <p className="text-sm text-gray-500">Map release names to launch dates</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-md font-semibold text-gray-900">Releases with Launch Dates Before Today ({pastReleases.length})</h3>
          <div className="flex gap-2">
            <button
              onClick={handleSyncReleases}
              disabled={syncing}
              className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 hover:text-indigo-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? "Syncing..." : "Sync from Aha"}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
            <PurpleLoader size="sm" />
            <span>Loading releases...</span>
          </div>
        ) : (
          <div className="border-2 border-indigo-200 rounded-lg bg-indigo-50 overflow-hidden">
            <table className="min-w-full divide-y divide-indigo-200 table-fixed">
              <colgroup>
                <col className="w-2/5" />
                <col className="w-1/5" />
                <col className="w-1/5" />
                <col className="w-40" />
              </colgroup>
              <thead className="bg-indigo-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Release Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Launch Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Epics Loaded vs. Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-indigo-900">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-indigo-200">
                {pastReleases.map((release) => (
                  <tr key={release.id} className="hover:bg-indigo-50 transition-colors">
                    {editingReleaseId === release.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input type="text" defaultValue={release.release_name} id={`release-name-${release.id}`} className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="text" defaultValue={formatDateForDisplay(release.launch_date)} id={`release-date-${release.id}`} placeholder="MM/DD/YYYY" className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-400 text-sm">-</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              const nameInput = document.getElementById(`release-name-${release.id}`) as HTMLInputElement;
                              const dateInput = document.getElementById(`release-date-${release.id}`) as HTMLInputElement;
                              if (nameInput && dateInput) {
                                onUpdate(release.id, nameInput.value, dateInput.value);
                              }
                            }}
                            className="text-indigo-600 hover:text-indigo-900 mr-4"
                          >
                            Save
                          </button>
                          <button onClick={() => setEditingReleaseId(null)} className="text-gray-600 hover:text-gray-900">
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{release.release_name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-600">{formatDateForDisplay(release.launch_date)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const counts = epicCounts.get(release.release_name);
                            const cleargoCount = counts?.cleargoCount ?? null;
                            const ahaCount = counts?.ahaCount ?? null;
                            
                            if (cleargoCount === null && ahaCount === null) {
                              return <span className="text-gray-400 text-sm">-</span>;
                            }
                            
                            const displayCleargo = cleargoCount !== null ? cleargoCount : '-';
                            const displayAha = ahaCount !== null ? ahaCount : '-';
                            
                            return (
                              <span className="text-gray-700 text-sm font-medium">
                                {displayCleargo} / {displayAha}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={async () => {
                                if (!confirm(`Sync epics for release "${release.release_name}"? This will sync all epics with matching tags for this release.`)) {
                                  return;
                                }
                                
                                setSyncingReleaseId(release.id);
                                try {
                                  const res = await fetch(`/api/integrations/aha/sync?sync_all=true&release=${encodeURIComponent(release.release_name)}`, {
                                    method: "POST",
                                    credentials: "include",
                                    headers: { "Content-Type": "application/json" },
                                  });
                                  
                                  if (!res.ok) {
                                    const errorData = await res.json();
                                    throw new Error(errorData.error || "Failed to sync epics");
                                  }
                                  
                                  const result = await res.json();
                                  const skipDetails = [];
                                  if (result.results.skipped_no_release > 0) {
                                    skipDetails.push(`${result.results.skipped_no_release} with no release`);
                                  }
                                  if (result.results.skipped_release_not_synced > 0) {
                                    skipDetails.push(`${result.results.skipped_release_not_synced} with unsynced release`);
                                  }
                                  const skipMessage = skipDetails.length > 0 ? `\nSkipped: ${skipDetails.join(', ')}` : '';
                                  
                                  alert(`Success: ${result.message}\n\nTotal epics fetched: ${result.results.total}\nCreated: ${result.results.created}\nUpdated: ${result.results.updated}${skipMessage}${result.results.errors.length > 0 ? `\nErrors: ${result.results.errors.length}` : ""}`);
                                  
                                  // Refresh epic counts for this release
                                  const newCounts = new Map(epicCounts);
                                  newCounts.delete(release.release_name);
                                  setEpicCounts(newCounts);
                                } catch (error: any) {
                                  alert(`Error: ${error.message}`);
                                } finally {
                                  setSyncingReleaseId(null);
                                }
                              }}
                              disabled={syncingReleaseId === release.id}
                              className="text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-2 py-1 text-sm"
                              title="Sync epics for this release"
                            >
                              {syncingReleaseId === release.id ? (
                                <span className="animate-pulse">Refreshing...</span>
                              ) : (
                                "Refresh"
                              )}
                            </button>
                            <button onClick={() => setEditingReleaseId(release.id)} className="text-indigo-600 hover:text-indigo-900">
                              Edit
                            </button>
                            <button onClick={() => onDelete(release.id)} className="text-red-600 hover:text-red-900">
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {pastReleases.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-sm text-gray-500">
                      No releases with launch dates before today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Archived Releases Section */}
      {archivedReleases.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-gray-900">Archived Releases ({archivedReleases.length})</h3>
          </div>
          <div className="border-2 border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 table-fixed">
              <colgroup>
                <col className="w-2/5" />
                <col className="w-1/5" />
                <col className="w-1/5" />
                <col className="w-40" />
              </colgroup>
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-900">Release Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-900">Launch Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-900">Epics Loaded vs. Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-900"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {archivedReleases.map((release) => (
                  <tr key={release.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{release.release_name}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
                          archived
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600">{formatDateForDisplay(release.launch_date)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const counts = epicCounts.get(release.release_name);
                        const cleargoCount = counts?.cleargoCount ?? null;
                        const ahaCount = counts?.ahaCount ?? null;
                        
                        if (cleargoCount === null && ahaCount === null) {
                          return <span className="text-gray-400 text-sm">-</span>;
                        }
                        
                        const displayCleargo = cleargoCount !== null ? cleargoCount : '-';
                        const displayAha = ahaCount !== null ? ahaCount : '-';
                        
                        return (
                          <span className="text-gray-700 text-sm font-medium">
                            {displayCleargo} / {displayAha}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      <button
                        onClick={async () => {
                          if (!confirm(`Unarchive release "${release.release_name}"?`)) {
                            return;
                          }
                          
                          try {
                            const res = await fetch(`/api/releases/${release.id}/archive`, {
                              method: "PATCH",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ archived: false }),
                            });
                            
                            if (!res.ok) {
                              const errorData = await res.json();
                              throw new Error(errorData.error || "Failed to unarchive release");
                            }
                            
                            await onRefreshReleases();
                            await onRefresh();
                            // Clear epic counts to trigger refetch
                            setEpicCounts(new Map());
                          } catch (error: any) {
                            alert(`Error: ${error.message}`);
                          }
                        }}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Unarchive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

