"use client";
import React, { useState } from "react";

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

  const formatDateForInput = (dateString: string) => {
    if (!dateString) return "";
    return formatDateForDisplay(dateString);
  };

  const handleMapReleaseName = async (releaseName: string, launchDate: string) => {
    if (!launchDate.trim()) {
      alert("Please enter a launch date");
      return;
    }
    try {
      const res = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          release_name: releaseName.trim(),
          launch_date: formatDateForInput(launchDate),
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create release mapping");
      }
      await onRefreshReleases();
      await onRefresh();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const releaseNameToDateMap = new Map<string, string>();
  releases.forEach((release) => {
    if (release.release_name && release.launch_date) {
      releaseNameToDateMap.set(release.release_name, release.launch_date);
    }
  });

  const releasesWithoutDates = launchReleases.filter((launchRelease) => {
    const existingLaunchDate = releaseNameToDateMap.get(launchRelease.releaseName);
    return !existingLaunchDate;
  });

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

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-md font-semibold text-gray-900">Releases Without Launch Dates</h3>
          <button
            onClick={onRefresh}
            disabled={launchReleasesLoading}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Refresh
          </button>
        </div>
        {launchReleasesLoading ? (
          <div className="text-center py-4 text-gray-500 text-sm">Loading release names from launches...</div>
        ) : releasesWithoutDates.length === 0 ? (
          <p className="text-sm text-gray-500 italic">All releases have launch dates mapped</p>
        ) : (
          <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
            <table className="min-w-full divide-y divide-purple-200 table-fixed">
              <colgroup>
                <col className="w-2/5" />
                <col className="w-2/5" />
                <col className="w-24" />
              </colgroup>
              <thead className="bg-purple-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Release Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Launch Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-purple-900">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-purple-200">
                {releasesWithoutDates.map((launchRelease) => (
                  <ReleaseWithoutDateRow
                    key={launchRelease.releaseName}
                    launchRelease={launchRelease}
                    formatDateForInput={formatDateForInput}
                    handleMapReleaseName={handleMapReleaseName}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-md font-semibold text-gray-900">Current Mappings</h3>
          <button
            onClick={() => setEditingReleaseId("new")}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            + Add Mapping
          </button>
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading releases...</div>
        ) : (
          <div className="border-2 border-indigo-200 rounded-lg bg-indigo-50 overflow-hidden">
            <table className="min-w-full divide-y divide-indigo-200 table-fixed">
              <colgroup>
                <col className="w-2/5" />
                <col className="w-2/5" />
                <col className="w-24" />
              </colgroup>
              <thead className="bg-indigo-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Release Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Launch Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-indigo-900">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-indigo-200">
                {editingReleaseId === "new" && (
                  <tr className="hover:bg-indigo-50 transition-colors">
                    <td className="px-4 py-3">
                      <input type="text" placeholder="e.g. APP-R-304 Release 2025.10" id="release-name-new" className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="text" placeholder="MM/DD/YYYY" id="release-date-new" className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          const nameInput = document.getElementById("release-name-new") as HTMLInputElement;
                          const dateInput = document.getElementById("release-date-new") as HTMLInputElement;
                          if (nameInput && dateInput && nameInput.value && dateInput.value) {
                            setReleaseNameInput(nameInput.value);
                            setReleaseDateInput(dateInput.value);
                            onAdd();
                            setEditingReleaseId(null);
                          } else {
                            alert("Please fill in both release name and date");
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
                  </tr>
                )}
                {releases.map((release) => (
                  <tr key={release.id} className="hover:bg-indigo-50 transition-colors">
                    {editingReleaseId === release.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input type="text" defaultValue={release.release_name} id={`release-name-${release.id}`} className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="text" defaultValue={formatDateForDisplay(release.launch_date)} id={`release-date-${release.id}`} placeholder="MM/DD/YYYY" className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" />
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
                        <td className="px-4 py-3 text-right text-sm font-medium">
                          <button onClick={() => setEditingReleaseId(release.id)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                            Edit
                          </button>
                          <button onClick={() => onDelete(release.id)} className="text-red-600 hover:text-red-900">
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {releases.length === 0 && editingReleaseId !== "new" && (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-sm text-gray-500">
                      No release mappings configured. Click "+ Add Mapping" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReleaseWithoutDateRow({ launchRelease, formatDateForInput, handleMapReleaseName }: {
  launchRelease: LaunchRelease;
  formatDateForInput: (date: string) => string;
  handleMapReleaseName: (releaseName: string, launchDate: string) => Promise<void>;
}) {
  const [dateInput, setDateInput] = useState(launchRelease.launchDate ? formatDateForInput(launchRelease.launchDate) : "");
  return (
    <tr className="hover:bg-purple-50 transition-colors">
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="font-medium text-gray-900">{launchRelease.releaseName}</span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <input
          type="text"
          placeholder="MM/DD/YYYY"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dateInput.trim()) {
              handleMapReleaseName(launchRelease.releaseName, dateInput);
              setDateInput("");
            }
          }}
          className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 text-sm"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => {
            if (dateInput.trim()) {
              handleMapReleaseName(launchRelease.releaseName, dateInput);
              setDateInput("");
            } else {
              alert("Please enter a launch date");
            }
          }}
          className="text-purple-600 hover:text-purple-900 text-sm font-medium"
        >
          Map
        </button>
      </td>
    </tr>
  );
}
