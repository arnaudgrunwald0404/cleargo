"use client";
import { useEffect, useState, useRef } from "react";
import { Epic } from "@/types/epics";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TextInput, Select, Group, Box, ActionIcon, Badge, Title, Text, Alert, Modal, Button } from '@mantine/core';
import { IconSearch, IconX, IconAlertCircle, IconTrash } from '@tabler/icons-react';
import { canRolesPerform } from '@/lib/permissions';
import { notifications } from '@mantine/notifications';
import { PurpleLoader } from '@/components/PurpleLoader';

interface EpicsClientProps {
    initialEpics?: Epic[];
}

function EpicsClient({ initialEpics = [] }: EpicsClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [epics, setEpics] = useState<Epic[]>(initialEpics);
    const [products, setProducts] = useState<any[]>([]);
    const [releaseSchedule, setReleaseSchedule] = useState<Array<{ release_name: string; launch_date: string | null; archived?: boolean }>>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [configuredTags, setConfiguredTags] = useState<string[]>(['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo']);
    const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);
    const [deletingEpicId, setDeletingEpicId] = useState<string | null>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [epicToDelete, setEpicToDelete] = useState<{ id: string; name: string } | null>(null);
    const [syncingReleaseName, setSyncingReleaseName] = useState<string | null>(null);
    const [fetchingReleaseDates, setFetchingReleaseDates] = useState<Set<string>>(new Set());
    const fetchedReleaseDatesRef = useRef<Set<string>>(new Set());
    const [ahaEpicCounts, setAhaEpicCounts] = useState<Map<string, number | null>>(new Map());
    const fetchingAhaCountsRef = useRef<Set<string>>(new Set());
    const [archivingReleaseName, setArchivingReleaseName] = useState<string | null>(null);
    const [celebrationModalOpen, setCelebrationModalOpen] = useState(false);
    const [releaseToCelebrate, setReleaseToCelebrate] = useState<{ releaseName: string; releaseId: number | null } | null>(null);
    const [releaseScheduleWithIds, setReleaseScheduleWithIds] = useState<Array<{ id: number; release_name: string; launch_date: string | null; archived: boolean }>>([]);
    const [isDeterminingOrder, setIsDeterminingOrder] = useState(true);

    // Filter state
    const [filters, setFilters] = useState({
        search: "",
        tier: "ALL",
        status: "ALL",
        risk: "ALL"
    });
    const [showFilters, setShowFilters] = useState(false);
    const [selectedRelease, setSelectedRelease] = useState<string | null>(searchParams.get('release') || null);

    useEffect(() => {
        // Load current user roles
        fetch("/api/me", { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.user?.roles && Array.isArray(data.user.roles)) {
                    setCurrentUserRoles(data.user.roles);
                }
            })
            .catch(err => console.error("Failed to load user roles:", err));

        // Load settings to get configured tags
        fetch("/api/settings", { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.aha_tags && Array.isArray(data.aha_tags) && data.aha_tags.length > 0) {
                    setConfiguredTags(data.aha_tags);
                }
            })
            .catch(err => console.error("Failed to load settings:", err));

        // Only load additional data if we don't have initial epics
        if (initialEpics.length === 0) {
            loadData();
        } else {
            // Still load products and releases
            Promise.all([
                fetch("/api/products", { credentials: 'include' }),
                fetch("/api/releases", { credentials: 'include' })
            ]).then(([productsRes, releasesRes]) => {
                if (productsRes.ok) {
                    productsRes.json().then(data => setProducts(data));
                }
                if (releasesRes.ok) {
                    releasesRes.json().then(data => {
                        setReleaseSchedule(data || []);
                        setReleaseScheduleWithIds(data || []);
                        // After releases are loaded, check if order needs to be determined
                        // This will be handled by the useEffect that fetches missing dates
                    });
                }
            });
        }
    }, [initialEpics.length]);

    async function loadData() {
        try {
            setLoading(true);

            // Fast auth check: if not signed in, send to home/Welcome
            const me = await fetch('/api/me', { credentials: 'include' });
            if (me.status === 401) {
                router.push('/');
                return;
            }

            const [epicsRes, productsRes, releasesRes] = await Promise.all([
                fetch("/api/epics", { credentials: 'include' }),
                fetch("/api/products", { credentials: 'include' }),
                fetch("/api/releases", { credentials: 'include' })
            ]);

            if (epicsRes.status === 401) {
                router.push('/');
                return;
            }
            if (!epicsRes.ok) throw new Error("Failed to fetch epics");
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
                setReleaseScheduleWithIds(releasesData || []);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
            // After initial load, check if we need to determine order
            // This will be handled by the useEffect that fetches missing dates
        }
    }


    const canDeleteEpic = canRolesPerform(currentUserRoles, 'launch.delete');

    const handleDeleteClick = (epicId: string, epicName: string) => {
        setEpicToDelete({ id: epicId, name: epicName });
        setDeleteModalOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!epicToDelete) return;

        setDeletingEpicId(epicToDelete.id);
        setDeleteModalOpen(false);
        
        try {
            const res = await fetch(`/api/epics/${epicToDelete.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to delete epic');
            }

            // Remove epic from state
            setEpics(epics.filter(e => e.id !== epicToDelete.id));
            
            notifications.show({
                title: 'Epic deleted',
                message: `"${epicToDelete.name}" has been deleted successfully.`,
                color: 'green',
            });
        } catch (error: any) {
            notifications.show({
                title: 'Delete failed',
                message: error.message || 'Failed to delete epic',
                color: 'red',
            });
        } finally {
            setDeletingEpicId(null);
            setEpicToDelete(null);
        }
    };

    const filteredEpics = epics.filter(l => {
        if (filters.search && !l.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.tier !== "ALL" && l.tier !== filters.tier) return false;
        if (filters.status !== "ALL" && l.status !== filters.status) return false;
        if (filters.risk !== "ALL" && (l.risk_level || 'LOW') !== filters.risk) return false;
        return true;
    });

    // Extract release name from epic's aha_fields
    const getReleaseName = (epic: Epic): string | null => {
        if (!epic.aha_fields || typeof epic.aha_fields !== 'object') return null;
        const fields = epic.aha_fields as any;

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

    // Group epics by release
    const releaseGroupsMap = new Map<string, Epic[]>();
    const ungroupedEpics: Epic[] = [];

    filteredEpics.forEach(epic => {
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
    const releaseGroups: Array<{ releaseName: string; releaseDate: string | null; epics: Epic[] }> = Array.from(releaseGroupsMap.entries()).map(([releaseName, epics]) => ({
        releaseName,
        releaseDate: releaseDateMap.get(releaseName) || null,
        epics
    }));

    // Automatically fetch release dates from API when needed (only if not in database)
    useEffect(() => {
        const fetchMissingReleaseDates = async () => {
            // If we don't have epics or release schedule yet, keep determining order
            if (epics.length === 0 || releaseSchedule.length === 0) {
                setIsDeterminingOrder(true);
                return;
            }
            
            // First, check the database (releaseSchedule) to see which releases already have dates
            const releasesInDb = new Set<string>();
            releaseSchedule.forEach(release => {
                if (release.release_name && release.launch_date) {
                    releasesInDb.add(release.release_name);
                }
            });
            
            // Only fetch dates for releases that:
            // 1. Are not "Ungrouped"
            // 2. Don't have a date in the current releaseDateMap (from releaseSchedule)
            // 3. Are not already in the database
            // 4. Haven't been fetched in this session
            const releasesNeedingDates = releaseGroups
                .filter(group => 
                    group.releaseName !== "Ungrouped" && 
                    !group.releaseDate && 
                    !releasesInDb.has(group.releaseName) &&
                    !fetchedReleaseDatesRef.current.has(group.releaseName)
                )
                .map(group => group.releaseName);

            if (releasesNeedingDates.length === 0) {
                // No releases need dates, order is determined
                setIsDeterminingOrder(false);
                return;
            }
            
            // We're fetching dates, so order is not yet determined
            setIsDeterminingOrder(true);

            // Mark as fetched to prevent duplicate requests and set loading state
            releasesNeedingDates.forEach(name => fetchedReleaseDatesRef.current.add(name));
            setFetchingReleaseDates(new Set(releasesNeedingDates));

            try {
                const res = await fetch("/api/epics/release-dates", { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    const releaseDates = data.releases || [];
                    
                    // Find dates for missing releases
                    const datesToSave: Array<{ release_name: string; launch_date: string }> = [];
                    
                    releasesNeedingDates.forEach(releaseName => {
                        // Try exact match first
                        let found = releaseDates.find((r: any) => r.releaseName === releaseName);
                        
                        // If no exact match, try case-insensitive match
                        if (!found) {
                            found = releaseDates.find((r: any) => 
                                r.releaseName && r.releaseName.toLowerCase() === releaseName.toLowerCase()
                            );
                        }
                        
                        if (found && found.launchDate) {
                            console.log(`[EpicsClient] Found date for "${releaseName}": ${found.launchDate} (matched with "${found.releaseName}") - saving to database`);
                            datesToSave.push({
                                release_name: found.releaseName, // Use the exact name from API response
                                launch_date: found.launchDate
                            });
                        } else {
                            console.warn(`[EpicsClient] No date found for release: "${releaseName}"`);
                            console.log(`[EpicsClient] Available releases in API response:`, releaseDates.map((r: any) => r.releaseName));
                        }
                    });

                    // Save all found dates
                    if (datesToSave.length > 0) {
                        const saveResults = await Promise.all(
                            datesToSave.map(async ({ release_name, launch_date }) => {
                                const res = await fetch("/api/releases", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    credentials: 'include',
                                    body: JSON.stringify({
                                        release_name,
                                        launch_date,
                                    }),
                                });
                                
                                if (!res.ok) {
                                    const errorData = await res.json().catch(() => ({}));
                                    console.error(`Failed to save release date for ${release_name}:`, errorData);
                                    return { success: false, release_name, error: errorData };
                                }
                                
                                const data = await res.json();
                                console.log(`Successfully saved release date for ${release_name}:`, data);
                                return { success: true, release_name, data };
                            })
                        );
                        
                        const successfulSaves = saveResults.filter(r => r.success);
                        const failedSaves = saveResults.filter(r => !r.success);
                        
                        if (failedSaves.length > 0) {
                            console.error("Failed to save release dates:", failedSaves);
                            notifications.show({
                                title: 'Failed to save release dates',
                                message: `Could not save dates for ${failedSaves.length} release(s). Check console for details.`,
                                color: 'red',
                            });
                        }
                        
                        if (successfulSaves.length > 0) {
                            console.log(`Successfully saved ${successfulSaves.length} release date(s) to database:`, successfulSaves.map(r => r.release_name));
                            
                            // Mark these releases as saved so we don't fetch them again
                            successfulSaves.forEach(({ release_name }) => {
                                fetchedReleaseDatesRef.current.add(release_name);
                            });
                            
                            // Small delay to ensure database write is committed
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            // Refresh only the release schedule to show the new dates (without showing full page loading)
                            const releasesRes = await fetch("/api/releases", { credentials: 'include' });
                            if (releasesRes.ok) {
                                const releasesData = await releasesRes.json();
                                console.log("Refreshed release schedule from database:", releasesData);
                                
                                // Verify the saved releases are in the refreshed data
                                successfulSaves.forEach(({ release_name }) => {
                                    const saved = releasesData.find((r: any) => r.release_name === release_name);
                                    if (saved && saved.launch_date) {
                                        console.log(`✅ Verified: ${release_name} has date ${saved.launch_date} in database - will not fetch from API again`);
                                    } else {
                                        console.error(`❌ Verification failed: ${release_name} not found or has no date in refreshed data`);
                                    }
                                });
                                
                                setReleaseSchedule(releasesData || []);
                                setReleaseScheduleWithIds(releasesData || []);
                                
                                // Order is now determined after refresh
                                setIsDeterminingOrder(false);
                            } else {
                                const errorText = await releasesRes.text();
                                let errorMessage = "Failed to refresh release schedule after save";
                                try {
                                    const errorData = JSON.parse(errorText);
                                    errorMessage = errorData.error || errorMessage;
                                } catch {
                                    errorMessage = errorText || errorMessage;
                                }
                                console.error(errorMessage, { status: releasesRes.status, statusText: releasesRes.statusText });
                                // Even on error, we've done what we can - order is determined
                                setIsDeterminingOrder(false);
                            }
                        } else {
                            // No dates to save, order is determined
                            setIsDeterminingOrder(false);
                        }
                    } else {
                        // No dates found, order is determined
                        setIsDeterminingOrder(false);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch release dates:", error);
                // Remove from fetched set on error so we can retry
                releasesNeedingDates.forEach(name => fetchedReleaseDatesRef.current.delete(name));
                // Even on error, we've done what we can - order is determined
                setIsDeterminingOrder(false);
            } finally {
                // Clear loading state
                setFetchingReleaseDates(new Set());
            }
        };

        fetchMissingReleaseDates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [releaseSchedule, epics.length, releaseGroups.length]);

    // Fetch Aha epic counts for releases
    useEffect(() => {
        const fetchAhaEpicCounts = async () => {
            const releasesToFetch = releaseGroups
                .filter(group => 
                    group.releaseName !== "Ungrouped" && 
                    !ahaEpicCounts.has(group.releaseName) &&
                    !fetchingAhaCountsRef.current.has(group.releaseName)
                )
                .map(group => group.releaseName);

            if (releasesToFetch.length === 0) return;

            // Mark as fetching
            releasesToFetch.forEach(name => fetchingAhaCountsRef.current.add(name));

            // Fetch counts for all releases in parallel
            const countPromises = releasesToFetch.map(async (releaseName) => {
                try {
                    const res = await fetch(`/api/releases/epic-count/${encodeURIComponent(releaseName)}`, {
                        credentials: 'include'
                    });
                    if (res.ok) {
                        const data = await res.json();
                        return { releaseName, count: data.count };
                    }
                    // Silently fail - API route may not exist
                    return { releaseName, count: null };
                } catch (error) {
                    // Silently fail - API route may not exist
                    return { releaseName, count: null };
                }
            });

            const results = await Promise.all(countPromises);
            const newCounts = new Map(ahaEpicCounts);
            results.forEach(({ releaseName, count }) => {
                newCounts.set(releaseName, count);
            });
            setAhaEpicCounts(newCounts);

            // Clear fetching state
            releasesToFetch.forEach(name => fetchingAhaCountsRef.current.delete(name));
        };

        fetchAhaEpicCounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [releaseGroups.length]);

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
            releaseName: "Ungrouped",
            releaseDate: null,
            epics: ungroupedEpics
        });
    }

    // Check for celebration condition: all epics LAUNCHED for 90+ days
    const checkedReleasesRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const checkCelebrationCondition = () => {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            ninetyDaysAgo.setHours(0, 0, 0, 0);
            
            for (const group of releaseGroups) {
                if (group.releaseName === "Ungrouped" || group.epics.length === 0) continue;
                
                // Skip if we've already checked this release
                if (checkedReleasesRef.current.has(group.releaseName)) continue;
                
                // Check if all epics are LAUNCHED
                const allLaunched = group.epics.every(epic => epic.status === 'LAUNCHED');
                if (!allLaunched) {
                    checkedReleasesRef.current.add(group.releaseName);
                    continue;
                }
                
                // Check if all epics have been LAUNCHED for 90+ days
                // We'll check updated_at as a proxy for when status was set to LAUNCHED
                const allLaunched90Days = group.epics.every(epic => {
                    if (!epic.updated_at) return false;
                    const updatedDate = new Date(epic.updated_at);
                    updatedDate.setHours(0, 0, 0, 0);
                    return updatedDate < ninetyDaysAgo;
                });
                
                if (allLaunched90Days) {
                    // Find the release ID
                    const release = releaseScheduleWithIds.find(r => r.release_name === group.releaseName);
                    if (release && !release.archived) {
                        checkedReleasesRef.current.add(group.releaseName);
                        setReleaseToCelebrate({ releaseName: group.releaseName, releaseId: release.id });
                        setCelebrationModalOpen(true);
                        break; // Only show one at a time
                    }
                } else {
                    checkedReleasesRef.current.add(group.releaseName);
                }
            }
        };
        
        if (releaseGroups.length > 0 && releaseScheduleWithIds.length > 0 && !celebrationModalOpen) {
            checkCelebrationCondition();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [releaseGroups.length, releaseScheduleWithIds.length]);

    // Calculate stats for each release group
    const releaseStats = releaseGroups.map(group => {
        const highRiskCount = group.epics.filter(epic => epic.risk_level === 'HIGH').length;
        const ahaCount = group.releaseName !== "Ungrouped" ? ahaEpicCounts.get(group.releaseName) : null;
        return {
            ...group,
            highRiskCount,
            epicsLoaded: group.epics.length,
            ahaEpicCount: ahaCount
        };
    });

    // Filter release groups if a release is selected
    const filteredReleaseGroups = selectedRelease 
        ? releaseGroups.filter(group => group.releaseName === selectedRelease)
        : releaseGroups;

    if (loading) {
        return (
            <div className="pt-24 p-8 flex items-center justify-center">
                <PurpleLoader size="md" />
            </div>
        );
    }

    return (
        <div style={{
          maxWidth: 'var(--page-container-max-width)',
          margin: '0 auto',
          paddingLeft: 'var(--page-container-padding-x)',
          paddingRight: 'var(--page-container-padding-x)',
          paddingTop: 'var(--page-container-padding-top)',
          fontFamily: 'var(--font-body)'
        }}
        className="sm:px-6 lg:px-8"
        >
            <Group align="flex-start" mb="sm">
                <Box>
                    <Title style={{ 
                        fontFamily: 'var(--font-heading)', 
                        color: 'var(--color-gray-900)', 
                        fontSize: 'var(--font-size-page-title)', 
                        fontWeight: 'var(--font-weight-bold)',
                        marginBottom: 'var(--spacing-6)'
                    }}>Releases</Title>
                </Box>
            </Group>

            {error && (
                <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="xl">
                    {error}
                </Alert>
            )}

            {/* Release Cards */}
            {releaseStats.length > 0 && (
                <Box mb="md">
                    <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4" style={{ scrollbarWidth: 'thin' }}>
                        {isDeterminingOrder ? (
                            // Show skeleton cards while determining order
                            Array.from({ length: Math.max(releaseStats.length, 3) }).map((_, index) => (
                                <div
                                    key={`skeleton-${index}`}
                                    className="flex-shrink-0 w-64 p-4 rounded-lg border-2 border-gray-200 bg-gray-50 animate-pulse"
                                    style={{ fontFamily: 'var(--font-body)' }}
                                >
                                    <div className="space-y-2">
                                        <div className="h-6 bg-gray-300 rounded w-3/4"></div>
                                        <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                                        <div className="pt-2 space-y-1 border-t border-gray-200">
                                            <div className="flex justify-between text-sm">
                                                <div className="h-4 bg-gray-300 rounded w-24"></div>
                                                <div className="h-4 bg-gray-300 rounded w-12"></div>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <div className="h-4 bg-gray-300 rounded w-20"></div>
                                                <div className="h-4 bg-gray-300 rounded w-8"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            // Show actual cards once order is determined
                            releaseStats.map((stat, index) => {
                                const isSelected = selectedRelease === stat.releaseName;
                                return (
                                    <div
                                        key={index}
                                        onClick={() => {
                                            const newRelease = isSelected ? null : stat.releaseName;
                                            setSelectedRelease(newRelease);
                                            // Update URL without page reload
                                            const params = new URLSearchParams(searchParams.toString());
                                            if (newRelease) {
                                                params.set('release', newRelease);
                                            } else {
                                                params.delete('release');
                                            }
                                            router.push(`/epics?${params.toString()}`, { scroll: false });
                                        }}
                                        className={`
                                            flex-shrink-0 w-64 p-4 rounded-lg border-2 cursor-pointer transition-all
                                            ${isSelected 
                                                ? 'border-[#93C5FD] bg-[#EFF6FF] shadow-md border-[2px]' 
                                                : 'border-[#E5E7EB] bg-white hover:border-[#BFDBFE] hover:shadow-sm'
                                            }
                                        `}
                                        style={{ 
                                            fontFamily: 'var(--font-body)',
                                            transition: 'var(--transition-base)'
                                        }}
                                    >
                                        <div className="space-y-2">
                                            <h3 
                                                style={{ 
                                                    fontFamily: 'var(--font-heading)',
                                                    color: isSelected ? 'var(--color-blue-800)' : 'var(--color-gray-900)',
                                                    fontSize: 'var(--font-size-card-title)',
                                                    fontWeight: 'var(--font-weight-semibold)'
                                                }}
                                            >
                                                {stat.releaseName}
                                            </h3>
                                            {stat.releaseDate && (
                                                <p className="text-sm" style={{ 
                                                    color: 'var(--color-gray-500)', 
                                                    fontSize: 'var(--font-size-base)',
                                                    fontFamily: 'var(--font-body)'
                                                }}>
                                                    {new Date(stat.releaseDate).toLocaleDateString('en-US', { 
                                                        year: 'numeric', 
                                                        month: 'short', 
                                                        day: 'numeric' 
                                                    })}
                                                </p>
                                            )}
                                            <div className="pt-2 space-y-1 border-t" style={{ borderColor: 'var(--color-gray-200)' }}>
                                                <div className="flex justify-between text-sm">
                                                    <span style={{ 
                                                        color: 'var(--color-gray-500)', 
                                                        fontSize: 'var(--font-size-sm)',
                                                        fontFamily: 'var(--font-body)'
                                                    }}>Epics loaded:</span>
                                                    <span className="font-medium" style={{ 
                                                        color: isSelected ? 'var(--color-blue-900)' : 'var(--color-gray-900)', 
                                                        fontSize: 'var(--font-size-sm)',
                                                        fontFamily: 'var(--font-body)'
                                                    }}>
                                                        {stat.epicsLoaded}
                                                        {stat.releaseName !== "Ungrouped" && (
                                                            <span style={{ 
                                                                color: 'var(--color-gray-500)', 
                                                                marginLeft: 'var(--spacing-1)',
                                                                fontFamily: 'var(--font-body)'
                                                            }}>
                                                                {stat.ahaEpicCount !== null && stat.ahaEpicCount !== undefined
                                                                    ? ` / ${stat.ahaEpicCount}`
                                                                    : ' / -'
                                                                }
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span style={{ 
                                                        color: 'var(--color-gray-500)', 
                                                        fontSize: 'var(--font-size-sm)',
                                                        fontFamily: 'var(--font-body)'
                                                    }}>High risk:</span>
                                                    <span className="font-medium" style={{ 
                                                        color: stat.highRiskCount > 0 ? 'var(--color-error-base)' : 'var(--color-gray-500)',
                                                        fontSize: 'var(--font-size-sm)',
                                                        fontFamily: 'var(--font-body)'
                                                    }}>
                                                        {stat.highRiskCount}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </Box>
            )}

            {/* Search and Filters - Hidden by default */}
            {showFilters && (
                <Box className="bg-gray-50 rounded-lg p-4" mb="lg">
                    <Group justify="flex-start" align="center" mb="md">
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                setShowFilters(false);
                            }}
                            className="text-sm font-medium"
                        style={{ 
                            color: 'var(--color-blue-material)',
                            fontSize: 'var(--font-size-base)',
                            fontWeight: 'var(--font-weight-medium)',
                            fontFamily: 'var(--font-body)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-blue-material-dark)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-blue-material)'}
                        >
                            Hide search and filters
                        </a>
                    </Group>
                    <Group justify="space-between" align="center" mb="md">
                        <Group gap="md" style={{ flex: 1 }}>
                            <TextInput
                                placeholder="Search epics..."
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                leftSection={<IconSearch size={16} />}
                                rightSection={
                                    filters.search && (
                                        <ActionIcon
                                            size="sm"
                                            variant="transparent"
                                            onClick={() => setFilters({ ...filters, search: "" })}
                                        >
                                            <IconX size={14} />
                                        </ActionIcon>
                                    )
                                }
                                style={{ flex: 1, maxWidth: 400 }}
                            />
                        </Group>
                        {(filters.tier !== "ALL" || filters.status !== "ALL" || filters.risk !== "ALL" || filters.search) && (
                            <Badge
                                variant="light"
                                color="indigo"
                                size="lg"
                                rightSection={
                                    <ActionIcon
                                        size="xs"
                                        color="indigo"
                                        radius="xl"
                                        variant="transparent"
                                        onClick={() => setFilters({ search: "", tier: "ALL", status: "ALL", risk: "ALL" })}
                                    >
                                        <IconX size={12} />
                                    </ActionIcon>
                                }
                            >
                                {[filters.search && "Search", filters.tier !== "ALL" && filters.tier, filters.status !== "ALL" && filters.status, filters.risk !== "ALL" && filters.risk].filter(Boolean).length} active
                            </Badge>
                        )}
                    </Group>

                    <Group gap="md">
                        <Select
                            label="Tier"
                            placeholder="All Tiers"
                            value={filters.tier}
                            onChange={(value) => setFilters({ ...filters, tier: value || "ALL" })}
                            data={[
                                { value: "ALL", label: "All Tiers" },
                                { value: "TIER_1", label: "Tier 1" },
                                { value: "TIER_2", label: "Tier 2" },
                                { value: "TIER_3", label: "Tier 3" },
                            ]}
                            clearable
                            style={{ flex: 1 }}
                        />
                        <Select
                            label="Status"
                            placeholder="All Statuses"
                            value={filters.status}
                            onChange={(value) => setFilters({ ...filters, status: value || "ALL" })}
                            data={[
                                { value: "ALL", label: "All Statuses" },
                                { value: "PLANNED", label: "Planned" },
                                { value: "PRE_LAUNCH", label: "Pre-Launch" },
                                { value: "LAUNCHING", label: "Launching" },
                                { value: "LAUNCHED", label: "Launched" },
                            ]}
                            clearable
                            style={{ flex: 1 }}
                        />
                        <Select
                            label="Risk Level"
                            placeholder="All Risks"
                            value={filters.risk}
                            onChange={(value) => setFilters({ ...filters, risk: value || "ALL" })}
                            data={[
                                { value: "ALL", label: "All Risks" },
                                { value: "LOW", label: "Low" },
                                { value: "MEDIUM", label: "Medium" },
                                { value: "HIGH", label: "High" },
                            ]}
                            clearable
                            style={{ flex: 1 }}
                        />
                    </Group>
                </Box>
            )}

            {/* Toggle link to show filters - only show when filters are hidden */}
            {!showFilters && (
                <Group justify="flex-start" mb="md">
                    <a
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            setShowFilters(true);
                        }}
                        className="text-sm font-medium"
                        style={{ 
                            color: 'var(--color-blue-material)',
                            fontSize: 'var(--font-size-base)',
                            fontWeight: 'var(--font-weight-medium)',
                            fontFamily: 'var(--font-body)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-blue-material-dark)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-blue-material)'}
                    >
                        Search and filter epics.
                    </a>
                </Group>
            )}

            <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }} mt="md">
                Epics appear below if in Aha! : ClearGO Candidate = Yes OR Tags contain any of: {configuredTags.map(tag => `"${tag}"`).join(', ')}
            </Text>
                
            {filteredReleaseGroups.length === 0 ? (
                    <div className="rounded-lg overflow-hidden" style={{
                        border: `1px solid var(--color-gray-200)`,
                        backgroundColor: 'var(--color-gray-50)'
                    }}>
                        <div className="px-4 py-8 text-center" style={{ 
                            color: 'var(--color-gray-500)', 
                            fontSize: 'var(--font-size-base)',
                            fontFamily: 'var(--font-body)'
                        }}>
                            No epics found matching filters.
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8 pt-2">
                        {filteredReleaseGroups.map((group, groupIndex) => (
                            <div key={groupIndex} className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 style={{
                                        fontFamily: 'var(--font-heading)',
                                        fontSize: 'var(--font-size-section-title)',
                                        fontWeight: 'var(--font-weight-semibold)',
                                        color: 'var(--color-gray-900)'
                                    }}>
                                        {group.releaseName}
                                        {group.releaseDate ? (
                                            <span style={{ 
                                                marginLeft: 'var(--spacing-2)', 
                                                fontSize: 'var(--font-size-md)', 
                                                fontWeight: 'var(--font-weight-normal)',
                                                color: 'var(--color-gray-500)',
                                                fontFamily: 'var(--font-body)'
                                            }}>
                                                - {new Date(group.releaseDate).toLocaleDateString()}
                                            </span>
                                        ) : fetchingReleaseDates.has(group.releaseName) ? (
                                            <span style={{ 
                                                marginLeft: 'var(--spacing-2)', 
                                                fontSize: 'var(--font-size-base)', 
                                                fontWeight: 'var(--font-weight-normal)',
                                                fontStyle: 'italic',
                                                color: 'var(--color-gray-500)',
                                                fontFamily: 'var(--font-body)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 'var(--spacing-1)'
                                            }}>
                                                - <PurpleLoader size="sm" />
                                            </span>
                                        ) : null}
                                    </h2>
                                    {group.releaseName !== "Ungrouped" && (
                                        <div className="flex items-center gap-3">
                                            <button
                                                disabled={syncingReleaseName === group.releaseName}
                                                className="font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={{ 
                                                    fontSize: '14px', 
                                                    fontFamily: "'Public Sans', sans-serif",
                                                    color: "#2196F3",
                                                    fontWeight: 500
                                                }}
                                                onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.color = "#1976D2")}
                                                onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.color = "#2196F3")}
                                                onClick={async () => {
                                                if (!confirm(`Sync epics for release "${group.releaseName}"? This will sync all epics with matching tags for this release.`)) {
                                                    return;
                                                }
                                                
                                                setSyncingReleaseName(group.releaseName);
                                                try {
                                                    // #region agent log
                                                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EpicsClient.tsx:478',message:'Making sync request',data:{releaseName:group.releaseName,url:`/api/integrations/aha/sync?sync_all=true&release=${encodeURIComponent(group.releaseName)}`,hasCredentials:'include'},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B,D'})}).catch(()=>{});
                                                    // #endregion
                                                    const res = await fetch(`/api/integrations/aha/sync?sync_all=true&release=${encodeURIComponent(group.releaseName)}`, {
                                                        method: "POST",
                                                        credentials: "include",
                                                        headers: { "Content-Type": "application/json" },
                                                    });
                                                    
                                                    // #region agent log
                                                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EpicsClient.tsx:485',message:'Sync request response',data:{status:res.status,statusText:res.statusText,ok:res.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B,D'})}).catch(()=>{});
                                                    // #endregion
                                                    
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
                                                    
                                                    notifications.show({
                                                        title: 'Sync Complete',
                                                        message: `Created: ${result.results.created}, Updated: ${result.results.updated}${skipMessage}`,
                                                        color: 'green',
                                                    });
                                                    
                                                    // Reload epics to show updated data
                                                    loadData();
                                                } catch (error: any) {
                                                    notifications.show({
                                                        title: 'Sync Failed',
                                                        message: error.message,
                                                        color: 'red',
                                                    });
                                                } finally {
                                                    setSyncingReleaseName(null);
                                                }
                                            }}
                                            title="Sync epics for this release"
                                        >
                                            {syncingReleaseName === group.releaseName ? (
                                                <span className="animate-pulse">Refreshing...</span>
                                            ) : (
                                                "Refresh"
                                            )}
                                        </button>
                                        <button
                                            disabled={archivingReleaseName === group.releaseName}
                                            className="text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                            style={{ fontSize: '14px', fontFamily: 'Inter, sans-serif' }}
                                            onClick={async () => {
                                                const release = releaseScheduleWithIds.find(r => r.release_name === group.releaseName);
                                                if (!release) return;
                                                
                                                if (!confirm(`Archive release "${group.releaseName}"? This will hide it from the releases page.`)) {
                                                    return;
                                                }
                                                
                                                setArchivingReleaseName(group.releaseName);
                                                try {
                                                    const res = await fetch(`/api/releases/${release.id}/archive`, {
                                                        method: "PATCH",
                                                        credentials: "include",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ archived: true }),
                                                    });
                                                    
                                                    if (!res.ok) {
                                                        const errorData = await res.json();
                                                        throw new Error(errorData.error || "Failed to archive release");
                                                    }
                                                    
                                                    notifications.show({
                                                        title: 'Release Archived',
                                                        message: `"${group.releaseName}" has been archived and hidden from the releases page.`,
                                                        color: 'green',
                                                    });
                                                    
                                                    // Reload data to refresh the list
                                                    loadData();
                                                } catch (error: any) {
                                                    notifications.show({
                                                        title: 'Archive Failed',
                                                        message: error.message,
                                                        color: 'red',
                                                    });
                                                } finally {
                                                    setArchivingReleaseName(null);
                                                }
                                            }}
                                            title="Archive this release"
                                        >
                                            Archive
                                        </button>
                                        </div>
                                    )}
                                </div>
                                <div className="rounded-lg overflow-hidden" style={{ 
                                    border: "1px solid #E5E7EB",
                                    backgroundColor: "#FFFFFF",
                                    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)"
                                }}>
                                    <table className="min-w-full table-fixed" style={{ borderCollapse: "collapse" }}>
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
                                        <thead style={{ 
                                            backgroundColor: "#F9FAFB",
                                            borderBottom: "2px solid #E5E7EB"
                                        }}>
                                            <tr>
                                                <th className="px-4 py-3 text-left" style={{ 
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    color: "#6B7280"
                                                }}>Name</th>
                                                <th className="px-4 py-3 text-left w-24" style={{ 
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    color: "#6B7280"
                                                }}>Tier</th>
                                                <th className="px-4 py-3 text-left" style={{ 
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    color: "#6B7280"
                                                }}>Dev Backlog Pod</th>
                                                <th className="px-4 py-3 text-left w-32" style={{ 
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    color: "#6B7280"
                                                }}>Date</th>
                                                <th className="px-4 py-3 text-left w-24" style={{ 
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    color: "#6B7280"
                                                }}>Status</th>
                                                <th className="px-4 py-3 text-left w-24" style={{ 
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    color: "#6B7280"
                                                }}>Readiness</th>
                                                <th className="px-4 py-3 text-left w-24" style={{ 
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    color: "#6B7280"
                                                }}>Risk</th>
                                                <th className="px-4 py-3 text-right w-24" style={{ 
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    color: "#6B7280"
                                                }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white" style={{ borderTop: "1px solid #E5E7EB" }}>
                                            {group.epics.map(epic => (
                                                <tr 
                                                    key={epic.id} 
                                                    style={{ 
                                                        borderBottom: "1px solid #E5E7EB",
                                                        transition: "background-color 0.15s ease"
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F9FAFB"}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#FFFFFF"}
                                                >
                                                    <td className="px-4 py-3" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                        <Link 
                                                            href={`/epics/${epic.id}`} 
                                                            prefetch={false} 
                                                            className="font-medium"
                                                            style={{ 
                                                                color: "#228BE6",
                                                                textDecoration: "none",
                                                                fontWeight: 500
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                                                            onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
                                                        >
                                                            {epic.name}
                                                        </Link>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap w-24">
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${epic.tier === 'TIER_1' ? 'bg-purple-100 text-purple-800' :
                                                            epic.tier === 'TIER_2' ? 'bg-blue-100 text-blue-800' :
                                                                'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {epic.tier.replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                        {epic.pod || '-'}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap w-32" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                        {epic.target_launch_date ? new Date(epic.target_launch_date).toLocaleDateString() : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap w-24" style={{ padding: "12px 16px" }}>
                                                        <span className="px-2 py-1 rounded text-xs font-medium" style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            padding: "4px 10px",
                                                            borderRadius: "12px",
                                                            fontSize: "12px",
                                                            fontWeight: 500,
                                                            backgroundColor: "#FEF3C7",
                                                            color: "#92400E"
                                                        }}>
                                                            {epic.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono whitespace-nowrap w-24" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                        {epic.readiness_score ? `${Math.round(epic.readiness_score * 100)}%` : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap w-24">
                                                        {epic.risk_level && (
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${epic.risk_level === 'HIGH' ? 'bg-red-100 text-red-800' :
                                                                epic.risk_level === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
                                                                    'bg-green-100 text-green-800'
                                                                }`}>
                                                                {epic.risk_level}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right whitespace-nowrap w-24" style={{ padding: "12px 16px" }}>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Link 
                                                                href={`/epics/${epic.id}`} 
                                                                prefetch={false} 
                                                                className="text-sm"
                                                                style={{ 
                                                                    color: "#6B7280",
                                                                    fontSize: "14px"
                                                                }}
                                                                onMouseEnter={(e) => e.currentTarget.style.color = "#111827"}
                                                                onMouseLeave={(e) => e.currentTarget.style.color = "#6B7280"}
                                                            >
                                                                View
                                                            </Link>
                                                            {canDeleteEpic && (
                                                                <button
                                                                    onClick={() => handleDeleteClick(epic.id, epic.name)}
                                                                    disabled={deletingEpicId === epic.id}
                                                                    className="text-sm text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                                                                    title="Delete epic"
                                                                >
                                                                    {deletingEpicId === epic.id ? (
                                                                        <span className="text-xs">...</span>
                                                                    ) : (
                                                                        <IconTrash size={14} />
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
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

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteModalOpen}
                onClose={() => {
                    setDeleteModalOpen(false);
                    setEpicToDelete(null);
                }}
                title={
                    <div className="flex items-center gap-2">
                        <IconTrash size={20} className="text-red-600" />
                        <span className="font-semibold" style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}>Delete Epic</span>
                    </div>
                }
                centered
                size="md"
            >
                <div className="space-y-4">
                    <Text size="sm" c="dimmed">
                        Are you sure you want to delete <strong>"{epicToDelete?.name}"</strong>?
                    </Text>
                    <Alert icon={<IconAlertCircle size={16} />} title="Warning" color="red" variant="light">
                        This action cannot be undone. All criteria, comments, attachments, feedback, and snapshots associated with this epic will be permanently deleted.
                    </Alert>
                    <Group justify="flex-end" mt="xl">
                        <Button
                            variant="subtle"
                            onClick={() => {
                                setDeleteModalOpen(false);
                                setEpicToDelete(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            onClick={handleDeleteConfirm}
                            leftSection={<IconTrash size={16} />}
                        >
                            Delete Epic
                        </Button>
                    </Group>
                </div>
            </Modal>

            {/* Celebration Modal */}
            <Modal
                opened={celebrationModalOpen}
                onClose={() => {
                    setCelebrationModalOpen(false);
                    setReleaseToCelebrate(null);
                }}
                title={
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🎉</span>
                        <span className="font-semibold" style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}>Congratulations!</span>
                    </div>
                }
                centered
                size="md"
            >
                <div className="space-y-4">
                    <Text size="sm">
                        All epics in <strong>"{releaseToCelebrate?.releaseName}"</strong> have been launched for more than 90 days!
                    </Text>
                    <Text size="sm" c="dimmed">
                        Would you like to archive this release? Archived releases will be hidden from the main releases page but can be viewed and unarchived in settings.
                    </Text>
                    <Group justify="flex-end" mt="xl">
                        <Button
                            variant="subtle"
                            onClick={() => {
                                setCelebrationModalOpen(false);
                                setReleaseToCelebrate(null);
                            }}
                        >
                            Not Now
                        </Button>
                        <Button
                            color="indigo"
                            onClick={async () => {
                                if (!releaseToCelebrate?.releaseId) return;
                                
                                try {
                                    const res = await fetch(`/api/releases/${releaseToCelebrate.releaseId}/archive`, {
                                        method: "PATCH",
                                        credentials: "include",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ archived: true }),
                                    });
                                    
                                    if (!res.ok) {
                                        const errorData = await res.json();
                                        throw new Error(errorData.error || "Failed to archive release");
                                    }
                                    
                                    notifications.show({
                                        title: 'Release Archived',
                                        message: `"${releaseToCelebrate.releaseName}" has been archived.`,
                                        color: 'green',
                                    });
                                    
                                    setCelebrationModalOpen(false);
                                    setReleaseToCelebrate(null);
                                    
                                    // Reload data to refresh the list
                                    loadData();
                                } catch (error: any) {
                                    notifications.show({
                                        title: 'Archive Failed',
                                        message: error.message,
                                        color: 'red',
                                    });
                                }
                            }}
                        >
                            Archive Release
                        </Button>
                    </Group>
                </div>
            </Modal>


        </div >
    );
}

export default EpicsClient;