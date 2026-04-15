"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Modal, Button, Stack, TextInput, Text, Group } from '@mantine/core';
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
    const iso = dateString.split("T")[0];
    const parts = iso.split("-");
    if (parts.length !== 3) return dateString;
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return dateString;
    const month = String(m).padStart(2, "0");
    const day = String(d).padStart(2, "0");
    return `${month}/${day}/${y}`;
  };

  const [syncing, setSyncing] = useState(false);
  const [syncingReleaseId, setSyncingReleaseId] = useState<number | null>(null);
  const [epicCounts, setEpicCounts] = useState<Map<string, { cleargoCount: number | null; ahaCount: number | null }>>(new Map());
  const fetchingCountsRef = useRef<Set<string>>(new Set());
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<Set<number>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [syncModalOpened, setSyncModalOpened] = useState(false);
  const [startDate, setStartDate] = useState<string>("");

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

  // Filter releases to show those with launch dates on or after today (excluding archived)
  const futureReleases = useMemo(() => {
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
      return launchDateString >= todayString;
    });
  }, [releases]);

  // Separate archived releases
  const archivedReleases = useMemo(() => {
    return releases.filter((release) => release.archived === true);
  }, [releases]);

  // Clear selection when releases change (e.g., after deletion)
  useEffect(() => {
    const currentIds = new Set(pastReleases.map(r => r.id));
    const filteredSelected = new Set(Array.from(selectedReleaseIds).filter(id => currentIds.has(id)));
    if (filteredSelected.size !== selectedReleaseIds.size) {
      setSelectedReleaseIds(filteredSelected);
    }
  }, [pastReleases.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleSyncReleasesClick = () => {
    // Set default start date to today
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setStartDate(todayString);
    setSyncModalOpened(true);
  };

  const handleSyncReleases = async () => {
    if (!startDate) {
      alert("Please select a starting date.");
      return;
    }

    setSyncModalOpened(false);
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/aha/sync-releases", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: startDate }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to sync releases");
      }
      
      const result = await res.json();
      const withoutDatesMsg = result.releases_without_dates && result.releases_without_dates.length > 0
        ? `\nReleases without dates: ${result.releases_without_dates.length} (${result.releases_without_dates.map((r: any) => r.name).join(', ')})`
        : '';
      const startDateMsg = startDate ? `\nOnly synced releases with launch dates on or after ${startDate}` : '';
      alert(`Success: ${result.message}${startDateMsg}\n\nTotal releases: ${result.total_releases}\nReleases with epics: ${result.releases_with_epics}\nSynced: ${result.synced}${withoutDatesMsg}${result.errors > 0 ? `\nErrors: ${result.errors}` : ""}`);
      
      // Refresh the release list
      await onRefreshReleases();
      await onRefresh();
      // Clear epic counts to trigger refetch
      setEpicCounts(new Map());
      // Reset start date
      setStartDate("");
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedReleaseIds.size === pastReleases.length) {
      setSelectedReleaseIds(new Set());
    } else {
      setSelectedReleaseIds(new Set(pastReleases.map(r => r.id)));
    }
  };

  const handleToggleSelectRelease = (id: number) => {
    const newSelected = new Set(selectedReleaseIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedReleaseIds(newSelected);
  };

  const handleBatchDelete = async () => {
    if (selectedReleaseIds.size === 0) {
      alert("Please select at least one release to delete.");
      return;
    }

    const releaseNames = pastReleases
      .filter(r => selectedReleaseIds.has(r.id))
      .map(r => r.release_name)
      .join(", ");

    if (!confirm(`Are you sure you want to delete ${selectedReleaseIds.size} release(s)?\n\n${releaseNames}\n\nThis action cannot be undone.`)) {
      return;
    }

    setBatchDeleting(true);
    try {
      const res = await fetch("/api/releases/batch-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedReleaseIds) }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete releases");
      }

      const result = await res.json();
      alert(`Successfully deleted ${result.deleted_count} release(s).`);
      
      // Clear selection and refresh
      setSelectedReleaseIds(new Set());
      await onRefreshReleases();
      await onRefresh();
      // Clear epic counts to trigger refetch
      setEpicCounts(new Map());
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setBatchDeleting(false);
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
            {selectedReleaseIds.size > 0 && (
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 border border-red-700 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {batchDeleting ? "Deleting..." : `Delete Selected (${selectedReleaseIds.size})`}
              </button>
            )}
            <button
              onClick={handleSyncReleasesClick}
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
                <col className="w-12" />
                <col className="w-2/5" />
                <col className="w-1/5" />
                <col className="w-1/5" />
                <col className="w-40" />
              </colgroup>
              <thead className="bg-indigo-100">
                <tr>
                  <th className="px-4 py-2 text-center text-xs font-medium text-indigo-900">
                    <input
                      type="checkbox"
                      checked={pastReleases.length > 0 && selectedReleaseIds.size === pastReleases.length}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      title="Select all"
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Release Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Release Date (External)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Epics Loaded vs. Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-indigo-900">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-indigo-200">
                {pastReleases.map((release) => (
                  <tr key={release.id} className={`hover:bg-indigo-50 transition-colors ${selectedReleaseIds.has(release.id) ? 'bg-indigo-100' : ''}`}>
                    {editingReleaseId === release.id ? (
                      <>
                        <td className="px-4 py-3"></td>
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
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedReleaseIds.has(release.id)}
                            onChange={() => handleToggleSelectRelease(release.id)}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                        </td>
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
                                
                                // Set a timeout to prevent UI from getting stuck
                                const releaseNameForTimeout = release.release_name;
                                const timeoutId = setTimeout(() => {
                                  alert(`Sync for "${releaseNameForTimeout}" is taking longer than expected. This may take several minutes for large releases. The sync is still running in the background.`);
                                }, 30000); // Show warning after 30 seconds
                                
                                try {
                                  // Create an AbortController for timeout handling
                                  const controller = new AbortController();
                                  const fetchTimeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

                                  const res = await fetch(`/api/integrations/aha/sync?sync_all=true&release=${encodeURIComponent(release.release_name)}`, {
                                    method: "POST",
                                    credentials: "include",
                                    headers: { "Content-Type": "application/json" },
                                    signal: controller.signal,
                                  });
                                  
                                  clearTimeout(fetchTimeoutId);
                                  
                                  if (!res.ok) {
                                    const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
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
                                  if (error.name === 'AbortError') {
                                    alert(`Sync timeout: The sync request timed out after 5 minutes. The sync may still be processing on the server. Please refresh the page in a moment.`);
                                  } else {
                                    alert(`Error: ${error.message || 'An error occurred during sync'}`);
                                  }
                                } finally {
                                  clearTimeout(timeoutId);
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
                    <td colSpan={5} className="px-4 py-4 text-center text-sm text-gray-500">
                      No releases with launch dates before today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Future Releases Section */}
      {futureReleases.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-gray-900">Releases with Launch Dates On or After Today ({futureReleases.length})</h3>
          </div>
          <div className="border-2 border-green-200 rounded-lg bg-green-50 overflow-hidden">
            <table className="min-w-full divide-y divide-green-200 table-fixed">
              <colgroup>
                <col className="w-2/5" />
                <col className="w-1/5" />
                <col className="w-1/5" />
                <col className="w-40" />
              </colgroup>
              <thead className="bg-green-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-green-900">Release Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-green-900">Release Date (External)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-green-900">Epics Loaded vs. Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-green-900">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-green-200">
                {futureReleases.map((release) => (
                  <tr key={release.id} className="hover:bg-green-50 transition-colors">
                    {editingReleaseId === release.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input type="text" defaultValue={release.release_name} id={`release-name-${release.id}`} className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-green-500" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="text" defaultValue={formatDateForDisplay(release.launch_date)} id={`release-date-${release.id}`} placeholder="MM/DD/YYYY" className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-green-500" />
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
                            className="text-green-600 hover:text-green-900 mr-4"
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
                                setSyncingReleaseId(release.id);
                                try {
                                  const res = await fetch(`/api/integrations/aha/sync?release=${encodeURIComponent(release.release_name)}`, {
                                    method: "POST",
                                    credentials: "include",
                                  });

                                  if (!res.ok) {
                                    const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                                    throw new Error(errorData.error || "Failed to sync epics");
                                  }
                                  
                                  const result = await res.json();
                                  const skipMessage = result.results.skipped > 0 ? `\nSkipped: ${result.results.skipped}` : "";
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
                              className="text-green-600 hover:text-green-900 hover:bg-green-50 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-2 py-1 text-sm"
                              title="Sync epics for this release"
                            >
                              {syncingReleaseId === release.id ? (
                                <span className="animate-pulse">Refreshing...</span>
                              ) : (
                                "Refresh"
                              )}
                            </button>
                            <button onClick={() => setEditingReleaseId(release.id)} className="text-green-600 hover:text-green-900">
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
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-900">Release Date (External)</th>
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

      {/* Sync Releases Modal */}
      <Modal
        opened={syncModalOpened}
        onClose={() => {
          setSyncModalOpened(false);
          setStartDate("");
        }}
        title="Sync Releases from Aha"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Select a starting date. Only releases with launch dates on or after this date will be synced.
          </Text>
          <TextInput
            type="date"
            label="Starting Date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            styles={{
              input: {
                borderRadius: 8,
                border: '1px solid var(--color-gray-300)',
                fontFamily: 'var(--font-body)'
              }
            }}
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="subtle"
              onClick={() => {
                setSyncModalOpened(false);
                setStartDate("");
              }}
              disabled={syncing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSyncReleases}
              loading={syncing}
              disabled={!startDate}
            >
              Sync Releases
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}

