"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Tooltip, Button, Text, Switch, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { PurpleLoader } from "@/components/PurpleLoader";
import { DelegationModal, DelegationType } from "@/components/DelegationModal";
import { createClient } from "@/lib/supabase/client";

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
        pod?: string | null;
    };
    criterion: {
        label: string;
        category: string;
        gate?: boolean;
    };
};

type ReleaseGroup = {
    releaseName: string;
    releaseDate: string | null;
    items: MyItem[];
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
            // Clear cache when status changes to ensure fresh data
            // Note: We keep release schedule and epic release map cache since they don't change often
            if (typeof window !== 'undefined') {
                localStorage.removeItem(getCacheKey(false)); // Clear pending cache
                localStorage.removeItem(getCacheKey(true)); // Clear all cache
            }
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

// Cache configuration
const CACHE_KEY_PREFIX = 'myTasks_cache_';
const RELEASE_SCHEDULE_CACHE_KEY = 'myTasks_releaseSchedule_cache';
const EPIC_RELEASE_MAP_CACHE_KEY = 'myTasks_epicReleaseMap_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CachedData {
    items: MyItem[];
    timestamp: number;
}

interface CachedReleaseSchedule {
    data: Array<{ release_name: string; launch_date: string | null }>;
    timestamp: number;
}

interface CachedEpicReleaseMap {
    data: Record<string, string | null>; // epicId -> releaseName
    timestamp: number;
}

function getCacheKey(showAllItems: boolean): string {
    return `${CACHE_KEY_PREFIX}${showAllItems ? 'all' : 'pending'}`;
}

function getCachedData(showAllItems: boolean): MyItem[] | null {
    if (typeof window === 'undefined') return null;
    
    try {
        const cacheKey = getCacheKey(showAllItems);
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;
        
        const data: CachedData = JSON.parse(cached);
        const age = Date.now() - data.timestamp;
        
        // Return cached data if still valid
        if (age < CACHE_EXPIRY_MS) {
            return data.items;
        }
        
        // Cache expired, remove it
        localStorage.removeItem(cacheKey);
        return null;
    } catch (error) {
        console.warn('Failed to read cache:', error);
        return null;
    }
}

function setCachedData(showAllItems: boolean, items: MyItem[]): void {
    if (typeof window === 'undefined') return;
    
    try {
        const cacheKey = getCacheKey(showAllItems);
        const data: CachedData = {
            items,
            timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (error) {
        console.warn('Failed to write cache:', error);
    }
}

function getCachedReleaseSchedule(): Array<{ release_name: string; launch_date: string | null }> | null {
    if (typeof window === 'undefined') return null;
    
    try {
        const cached = localStorage.getItem(RELEASE_SCHEDULE_CACHE_KEY);
        if (!cached) return null;
        
        const data: CachedReleaseSchedule = JSON.parse(cached);
        const age = Date.now() - data.timestamp;
        
        if (age < CACHE_EXPIRY_MS) {
            return data.data;
        }
        
        localStorage.removeItem(RELEASE_SCHEDULE_CACHE_KEY);
        return null;
    } catch (error) {
        console.warn('Failed to read release schedule cache:', error);
        return null;
    }
}

function setCachedReleaseSchedule(schedule: Array<{ release_name: string; launch_date: string | null }>): void {
    if (typeof window === 'undefined') return;
    
    try {
        const data: CachedReleaseSchedule = {
            data: schedule,
            timestamp: Date.now()
        };
        localStorage.setItem(RELEASE_SCHEDULE_CACHE_KEY, JSON.stringify(data));
    } catch (error) {
        console.warn('Failed to write release schedule cache:', error);
    }
}

function getCachedEpicReleaseMap(): Map<string, string | null> | null {
    if (typeof window === 'undefined') return null;
    
    try {
        const cached = localStorage.getItem(EPIC_RELEASE_MAP_CACHE_KEY);
        if (!cached) return null;
        
        const data: CachedEpicReleaseMap = JSON.parse(cached);
        const age = Date.now() - data.timestamp;
        
        if (age < CACHE_EXPIRY_MS) {
            return new Map(Object.entries(data.data));
        }
        
        localStorage.removeItem(EPIC_RELEASE_MAP_CACHE_KEY);
        return null;
    } catch (error) {
        console.warn('Failed to read epic release map cache:', error);
        return null;
    }
}

function setCachedEpicReleaseMap(map: Map<string, string | null>): void {
    if (typeof window === 'undefined') return;
    
    try {
        const data: CachedEpicReleaseMap = {
            data: Object.fromEntries(map),
            timestamp: Date.now()
        };
        localStorage.setItem(EPIC_RELEASE_MAP_CACHE_KEY, JSON.stringify(data));
    } catch (error) {
        console.warn('Failed to write epic release map cache:', error);
    }
}

export function MyTasks() {
    const [items, setItems] = useState<MyItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
    const [delegationModalOpen, setDelegationModalOpen] = useState(false);
    const [selectedItemForDelegation, setSelectedItemForDelegation] = useState<MyItem | null>(null);
    const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
    const [releaseSchedule, setReleaseSchedule] = useState<Array<{ release_name: string; launch_date: string | null }>>([]);
    const [epicReleaseMap, setEpicReleaseMap] = useState<Map<string, string | null>>(new Map());
    const [showAllItems, setShowAllItems] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingReleaseNames, setIsLoadingReleaseNames] = useState(true);

    useEffect(() => {
        // Load cached data immediately
        const cachedItems = getCachedData(showAllItems);
        const cachedSchedule = getCachedReleaseSchedule();
        const cachedEpicMap = getCachedEpicReleaseMap();
        
        if (cachedItems) {
            setItems(cachedItems);
            setLoading(false);
            setIsRefreshing(true); // Show we're refreshing in background
        }
        
        if (cachedSchedule) {
            setReleaseSchedule(cachedSchedule);
        }
        
        if (cachedEpicMap) {
            setEpicReleaseMap(cachedEpicMap);
            setIsLoadingReleaseNames(false); // We have cached data, so not loading
        } else if (cachedItems && cachedItems.length > 0) {
            // If we have cached items but no cached epic map, we need to fetch release names
            setIsLoadingReleaseNames(true);
        } else {
            setIsLoadingReleaseNames(false); // No items yet, not loading
        }
        
        // Fetch fresh data
        loadData();
        fetchCurrentUser();
        fetchReleaseSchedule();
    }, []);

    useEffect(() => {
        // When items change, fetch epic details to get release names
        if (items.length > 0) {
            setIsLoadingReleaseNames(true);
            fetchEpicReleaseNames().finally(() => {
                setIsLoadingReleaseNames(false);
            });
        } else {
            setIsLoadingReleaseNames(false);
        }
    }, [items]);

    const fetchCurrentUser = async () => {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) {
                setCurrentUserEmail(user.email);
            }
        } catch (error) {
            console.error('Failed to fetch current user:', error);
        }
    };

    const loadData = async (retryCount = 0, useCache = true) => {
        const maxRetries = 3;
        const retryDelay = 1000 * Math.pow(2, retryCount); // Exponential backoff: 1s, 2s, 4s
        
        // Try to use cached data first if available and we have no current items
        if (useCache && items.length === 0 && retryCount === 0) {
            const cachedItems = getCachedData(showAllItems);
            if (cachedItems && cachedItems.length > 0) {
                setItems(cachedItems);
                setLoading(false);
                setIsRefreshing(true); // Indicate we're refreshing in background
            }
        }
        
        try {
            if (retryCount === 0) {
                // Only set loading on first attempt if we don't have cached data
                if (items.length === 0) {
                    setLoading(true);
                }
            }
            setError(null); // Clear any previous errors
            const url = showAllItems ? "/api/my-items?showAll=true" : "/api/my-items";
            const res = await fetch(url);
            
            if (!res.ok) {
                // Don't retry on client errors (4xx) except 429 (rate limit)
                if (res.status >= 400 && res.status < 500 && res.status !== 429) {
                    throw new Error("Unable to load your tasks. Please check your connection and try again.");
                }
                
                // Retry on server errors (5xx) or rate limiting (429)
                if (retryCount < maxRetries) {
                    console.warn(`Request failed (attempt ${retryCount + 1}/${maxRetries + 1}), retrying in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return loadData(retryCount + 1, false); // Don't use cache on retry
                }
                
                throw new Error("Unable to load your tasks. The server is experiencing issues. Please try again.");
            }
            
            const data = await res.json();
            setItems(data);
            setCachedData(showAllItems, data); // Cache the fresh data
            setError(null); // Clear error on success
            setIsRefreshing(false);
        } catch (e: any) {
            // Only set error if we've exhausted retries AND we don't have cached data
            if (retryCount >= maxRetries) {
                // If we have cached data, don't show error - just keep showing cached data
                const cachedItems = getCachedData(showAllItems);
                if (!cachedItems || cachedItems.length === 0) {
                    setError(e.message || "Something went wrong while loading your tasks.");
                } else {
                    // We have cached data, so don't show error
                    console.warn('Failed to fetch fresh data, using cached data:', e.message);
                }
            } else {
                // Continue retrying
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return loadData(retryCount + 1, false); // Don't use cache on retry
            }
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        // Reload data when showAllItems changes
        // Try cache first, then fetch fresh
        const cachedItems = getCachedData(showAllItems);
        if (cachedItems) {
            setItems(cachedItems);
            setIsRefreshing(true);
        }
        loadData(0, false); // Don't use cache in this effect since we already loaded it above
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showAllItems]);

    async function fetchReleaseSchedule() {
        try {
            const res = await fetch("/api/releases", { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                const schedule = data || [];
                setReleaseSchedule(schedule);
                setCachedReleaseSchedule(schedule); // Cache the schedule
            } else {
                console.warn('Failed to fetch release schedule:', res.status);
                // Try to use cached data if fetch fails
                const cachedSchedule = getCachedReleaseSchedule();
                if (cachedSchedule) {
                    setReleaseSchedule(cachedSchedule);
                }
            }
        } catch (error) {
            console.error('Failed to fetch release schedule:', error);
            // Try to use cached data if fetch fails
            const cachedSchedule = getCachedReleaseSchedule();
            if (cachedSchedule) {
                setReleaseSchedule(cachedSchedule);
            }
            // Don't show error to user - release schedule is not critical for displaying tasks
        }
    }

    async function fetchEpicReleaseNames(): Promise<void> {
        try {
            // Get unique epic IDs from items
            const epicIds = Array.from(new Set(items.map(item => item.launch.id)));
            
            if (epicIds.length === 0) {
                setEpicReleaseMap(new Map());
                setIsLoadingReleaseNames(false);
                return;
            }
            
            // Try to load from cache first
            const cachedMap = getCachedEpicReleaseMap();
            const releaseMap = cachedMap ? new Map(cachedMap) : new Map<string, string | null>();
            
            // Find epic IDs that are missing from cache
            const missingEpicIds = epicIds.filter(id => !releaseMap.has(id));
            
            if (missingEpicIds.length === 0) {
                // All epics are in cache, use cached data
                setEpicReleaseMap(releaseMap);
                setIsLoadingReleaseNames(false);
                return;
            }
            
            // Fetch missing epic details in batches
            const batchSize = 10;
            
            for (let i = 0; i < missingEpicIds.length; i += batchSize) {
                const batch = missingEpicIds.slice(i, i + batchSize);
                const promises = batch.map(async (epicId) => {
                    try {
                        const res = await fetch(`/api/epics/${epicId}`, { credentials: 'include' });
                        if (res.ok) {
                            const epic = await res.json();
                            const releaseName = getReleaseName(epic);
                            releaseMap.set(epicId, releaseName);
                        } else {
                            console.warn(`Failed to fetch epic ${epicId}:`, res.status);
                            // Mark as fetched even if failed (set to null to indicate no release)
                            releaseMap.set(epicId, null);
                        }
                    } catch (error) {
                        console.error(`Failed to fetch epic ${epicId}:`, error);
                        // Mark as fetched even if failed (set to null to indicate no release)
                        releaseMap.set(epicId, null);
                        // Continue with other epics even if one fails
                    }
                });
                await Promise.all(promises);
            }
            
            // Ensure all epic IDs are in the map (even if null)
            epicIds.forEach(id => {
                if (!releaseMap.has(id)) {
                    releaseMap.set(id, null);
                }
            });
            
            setEpicReleaseMap(releaseMap);
            setCachedEpicReleaseMap(releaseMap); // Cache the updated map
            setIsLoadingReleaseNames(false);
        } catch (error) {
            console.error('Failed to fetch epic release names:', error);
            // Try to use cached data if fetch fails
            const cachedMap = getCachedEpicReleaseMap();
            if (cachedMap) {
                setEpicReleaseMap(cachedMap);
            } else {
                // If no cache, mark all as null to indicate we've checked
                const allEpicIds = Array.from(new Set(items.map(item => item.launch.id)));
                const releaseMap = new Map<string, string | null>();
                allEpicIds.forEach(id => releaseMap.set(id, null));
                setEpicReleaseMap(releaseMap);
            }
            setIsLoadingReleaseNames(false);
            // Don't show error to user - release names are nice to have but not critical
        }
    }

    const getReleaseName = (epic: any): string | null => {
        if (!epic?.aha_fields || typeof epic.aha_fields !== 'object') return null;
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

    // Group items by release and sort by release date
    // When showing all items, limit to last 10 releases
    const releaseGroups: ReleaseGroup[] = useMemo(() => {
        // Create a map of release names to dates from release schedule
        const releaseDateMap = new Map<string, string | null>();
        releaseSchedule.forEach(release => {
            if (release.release_name) {
                releaseDateMap.set(release.release_name, release.launch_date);
            }
        });

        // Group items by release
        const releaseGroupsMap = new Map<string, MyItem[]>();
        const ungroupedItems: MyItem[] = [];

        items.forEach(item => {
            const releaseName = epicReleaseMap.get(item.launch.id);
            if (releaseName) {
                if (!releaseGroupsMap.has(releaseName)) {
                    releaseGroupsMap.set(releaseName, []);
                }
                releaseGroupsMap.get(releaseName)!.push(item);
            } else {
                ungroupedItems.push(item);
            }
        });

        // Convert to array and sort by release date
        const groups: ReleaseGroup[] = Array.from(releaseGroupsMap.entries()).map(([releaseName, items]) => ({
            releaseName,
            releaseDate: releaseDateMap.get(releaseName) || null,
            items
        }));

        // Sort release groups by date (descending - most recent first), with null dates at the end
        groups.sort((a, b) => {
            if (!a.releaseDate && !b.releaseDate) return 0;
            if (!a.releaseDate) return 1;
            if (!b.releaseDate) return -1;
            return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
        });

        // When showing all items, limit to last 10 releases (most recent)
        let releasesToShow = groups;
        if (showAllItems && groups.length > 10) {
            releasesToShow = groups.slice(0, 10);
        }

        // For display, reverse to show closest first (ascending)
        releasesToShow.reverse();

        // Only add ungrouped items if we've finished loading release names
        // This prevents showing items as "Ungrouped" prematurely while still fetching
        if (ungroupedItems.length > 0 && !isLoadingReleaseNames) {
            releasesToShow.push({
                releaseName: 'Ungrouped',
                releaseDate: null,
                items: ungroupedItems
            });
        }

        return releasesToShow;
    }, [items, releaseSchedule, epicReleaseMap, showAllItems, isLoadingReleaseNames]);

    // Calculate stats for the heading
    const headingStats = useMemo(() => {
        const totalCriteria = items.length;
        
        // Get next two releases (by date, ascending, excluding null dates)
        const releasesWithDates = releaseSchedule
            .filter(r => r.release_name && r.launch_date)
            .map(r => ({
                name: r.release_name!,
                date: r.launch_date!
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 2);
        
        const nextTwoReleaseNames = new Set(releasesWithDates.map(r => r.name));
        
        // Count criteria for next two releases
        const criteriaForNextTwoReleases = items.filter(item => {
            const releaseName = epicReleaseMap.get(item.launch.id);
            return releaseName && nextTwoReleaseNames.has(releaseName);
        }).length;
        
        return {
            total: totalCriteria,
            forNextTwoReleases: criteriaForNextTwoReleases
        };
    }, [items, releaseSchedule, epicReleaseMap]);

    const handleOpenDelegation = (item: MyItem) => {
        setSelectedItemForDelegation(item);
        setDelegationModalOpen(true);
    };

    const handleCloseDelegation = () => {
        setDelegationModalOpen(false);
        setSelectedItemForDelegation(null);
    };

    const handleDelegate = async (delegationType: DelegationType, newApproverEmail: string) => {
        if (!selectedItemForDelegation) return;
        
        try {
            const res = await fetch(`/api/epics/${selectedItemForDelegation.launch.id}/delegate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    delegationType,
                    newApproverEmail,
                    taskId: selectedItemForDelegation.id,
                    category: selectedItemForDelegation.criterion.category,
                    isGate: selectedItemForDelegation.criterion.gate || false,
                    taskLabel: selectedItemForDelegation.criterion.label,
                }),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to delegate');
            }

            handleCloseDelegation();
            
            notifications.show({
                title: 'Delegation successful',
                message: `Task has been delegated to ${newApproverEmail}. A Slack notification has been sent to notify them.`,
                color: 'green',
                autoClose: 5000,
            });
            
            // Clear items cache and reload to get fresh data after delegation
            // Note: We keep release schedule and epic release map cache since they don't change
            if (typeof window !== 'undefined') {
                localStorage.removeItem(getCacheKey(showAllItems));
            }
            loadData(0, false);
        } catch (error) {
            console.error('Delegation error:', error);
            notifications.show({
                title: 'Delegation failed',
                message: error instanceof Error ? error.message : 'Failed to delegate task',
                color: 'red',
                autoClose: 5000,
            });
            throw error;
        }
    };

    if (loading && items.length === 0) {
        return (
            <div className="p-8 flex items-center justify-center">
                <PurpleLoader size="md" />
            </div>
        );
    }

    // Show loading state while fetching release names (but we have items)
    // Check if all epics have been checked for release names
    if (isLoadingReleaseNames && items.length > 0) {
        const epicIds = Array.from(new Set(items.map(item => item.launch.id)));
        const allEpicsChecked = epicIds.every(id => epicReleaseMap.has(id));
        
        if (!allEpicsChecked) {
            // Still loading release names, show skeleton/loading
            return (
                <div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--spacing-6)'
                    }}>
                        <h2 style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: 'var(--font-size-2xl)',
                            fontWeight: 'var(--font-weight-bold)',
                            color: 'var(--color-gray-900)',
                            margin: 0
                        }}>
                            You have {headingStats.total} criteria to inform
                            {headingStats.forNextTwoReleases > 0 && (
                                <span style={{
                                    fontSize: 'var(--font-size-lg)',
                                    fontWeight: 'var(--font-weight-normal)',
                                    color: 'var(--color-gray-600)',
                                    display: 'block',
                                    marginTop: 'var(--spacing-1)'
                                }}>
                                    among which {headingStats.forNextTwoReleases} for the next two releases
                                </span>
                            )}
                        </h2>
                    </div>
                    <div className="p-8 flex items-center justify-center">
                        <PurpleLoader size="md" />
                    </div>
                </div>
            );
        }
    }

    return (
        <div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--spacing-6)'
            }}>
                <h2 style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 'var(--font-size-2xl)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: 'var(--color-gray-900)',
                    margin: 0
                }}>
                    You have {headingStats.total} criteria to inform
                    {headingStats.forNextTwoReleases > 0 && (
                        <span style={{
                            fontSize: 'var(--font-size-lg)',
                            fontWeight: 'var(--font-weight-normal)',
                            color: 'var(--color-gray-600)',
                            display: 'block',
                            marginTop: 'var(--spacing-1)'
                        }}>
                            among which {headingStats.forNextTwoReleases} for the next two releases
                        </span>
                    )}
                </h2>
                <Group gap="sm">
                    <Text size="sm" style={{
                        fontFamily: 'var(--font-body)',
                        color: 'var(--color-gray-600)'
                    }}>
                        {showAllItems ? 'Show all items (last 10 releases)' : 'Show pending items only'}
                    </Text>
                    <Switch
                        checked={showAllItems}
                        onChange={(e) => setShowAllItems(e.currentTarget.checked)}
                        label={showAllItems ? 'All' : 'Pending'}
                        styles={{
                            label: {
                                fontFamily: 'var(--font-body)',
                                fontSize: 'var(--font-size-sm)'
                            }
                        }}
                    />
                </Group>
            </div>

            {error && items.length === 0 && (
                <div style={{
                    backgroundColor: 'var(--color-error-light)',
                    border: '1px solid var(--color-error-base)',
                    borderRadius: 'var(--radius-base)',
                    padding: 'var(--spacing-4)',
                    marginBottom: 'var(--spacing-4)',
                    fontFamily: 'var(--font-body)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--spacing-4)'
                }}>
                    <div style={{ flex: 1 }}>
                        <div style={{
                            fontWeight: 'var(--font-weight-semibold)',
                            color: 'var(--color-error-dark)',
                            marginBottom: 'var(--spacing-1)',
                            fontSize: 'var(--font-size-base)'
                        }}>
                            Oops! We hit a roadblock
                        </div>
                        <div style={{
                            color: 'var(--color-error-dark)',
                            fontSize: 'var(--font-size-sm)'
                        }}>
                            {error}
                        </div>
                    </div>
                    <Button
                        onClick={() => loadData(0, false)}
                        variant="filled"
                        color="red"
                        size="sm"
                        loading={loading}
                        style={{
                            fontFamily: 'var(--font-body)',
                            flexShrink: 0
                        }}
                    >
                        Retry
                    </Button>
                </div>
            )}
            
            {isRefreshing && items.length > 0 && (
                <div style={{
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #93C5FD',
                    borderRadius: 'var(--radius-base)',
                    padding: 'var(--spacing-2) var(--spacing-4)',
                    marginBottom: 'var(--spacing-4)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--font-size-sm)',
                    color: '#1E40AF',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-2)'
                }}>
                    <PurpleLoader size="xs" />
                    <span>Refreshing data...</span>
                </div>
            )}

            {items.length === 0 ? (
                <div style={{
                    border: `2px solid var(--color-blue-200)`,
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--color-blue-50)',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        padding: 'var(--spacing-8) var(--spacing-4)',
                        textAlign: 'center',
                        color: 'var(--color-gray-500)',
                        fontFamily: 'var(--font-body)'
                    }}>You have no assigned tasks.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
                    {releaseGroups.map((group, groupIndex) => (
                        <div key={group.releaseName}>
                            {/* Release Header - Above Table */}
                            <div style={{
                                marginBottom: 'var(--spacing-3)'
                            }}>
                                <h2 style={{
                                    fontFamily: 'var(--font-heading)',
                                    color: 'var(--color-gray-900)',
                                    fontSize: '20px',
                                    fontWeight: 'var(--font-weight-semibold)',
                                    margin: 0
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
                                    ) : null}
                                </h2>
                            </div>

                            {/* Items Table */}
                            <div className="rounded-lg overflow-hidden" style={{ 
                                border: "1px solid #E5E7EB",
                                backgroundColor: "#FFFFFF",
                                boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)"
                            }}>
                                <table className="min-w-full table-fixed" style={{ borderCollapse: 'collapse' }}>
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
                                        }}>Epic</th>
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
                                        }}>Pod</th>
                                        <th style={{
                                            padding: "12px 16px",
                                            textAlign: "left",
                                            fontSize: "12px",
                                            fontWeight: 600,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            color: "#6B7280"
                                        }}>Criterion</th>
                                        <th className="px-4 py-3 text-left w-24" style={{ 
                                            fontSize: "12px",
                                            fontWeight: 600,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            color: "#6B7280"
                                        }}>Status</th>
                                        <th className="px-4 py-3 text-left w-32" style={{ 
                                            fontSize: "12px",
                                            fontWeight: 600,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            color: "#6B7280"
                                        }}>Due on</th>
                                        <th className="px-4 py-3 text-right w-24" style={{ 
                                            fontSize: "12px",
                                            fontWeight: 600,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            color: "#6B7280"
                                        }}></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white" style={{ borderTop: "1px solid #E5E7EB" }}>
                                    {group.items.map(item => (
                                        <tr 
                                            key={item.id} 
                                            style={{ 
                                                borderBottom: "1px solid #E5E7EB",
                                                transition: "background-color 0.15s ease"
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F9FAFB"}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#FFFFFF"}
                                        >
                                            <td className="px-4 py-3 w-100" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                <Link 
                                                    href={`/epics/${item.launch.id}`} 
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
                                                    {item.launch.name}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap w-24">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${item.launch.tier === 'TIER_1' ? 'bg-purple-100 text-purple-800' :
                                                    item.launch.tier === 'TIER_2' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {item.launch.tier.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                {item.launch.pod || '-'}
                                            </td>
                                            <td style={{
                                                padding: "12px 16px",
                                                fontSize: "14px",
                                                color: "#111827"
                                            }}>
                                                <div style={{
                                                    fontWeight: 500,
                                                    color: "#111827",
                                                    fontSize: "14px"
                                                }}>{item.criterion.label}</div>
                                                <div style={{
                                                    fontSize: "12px",
                                                    color: "#6B7280",
                                                    marginTop: "4px"
                                                }}>{item.criterion.category}</div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap w-24" style={{ padding: "12px 16px" }}>
                                                <StatusTrafficLight 
                                                    status={item.status}
                                                    itemId={item.id}
                                                    epicId={item.launch.id}
                                                    onStatusUpdate={loadData}
                                                    isSaving={savingItems.has(item.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap w-32" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                {(() => {
                                                    const dueDateStr = item.condition_due_date;
                                                    // Check for null, undefined, or empty string
                                                    if (!dueDateStr || (typeof dueDateStr === 'string' && dueDateStr.trim() === '')) {
                                                        return (
                                                            <span style={{
                                                                fontSize: 'var(--font-size-sm)',
                                                                color: 'var(--color-gray-500)',
                                                                fontFamily: 'var(--font-body)'
                                                            }}>-</span>
                                                        );
                                                    }
                                                    
                                                    try {
                                                        const dueDate = new Date(dueDateStr);
                                                        // Check if date is valid
                                                        if (isNaN(dueDate.getTime())) {
                                                            console.warn('Invalid due date:', dueDateStr, 'for item:', item.id);
                                                            return (
                                                                <span style={{
                                                                    fontSize: 'var(--font-size-sm)',
                                                                    color: 'var(--color-gray-500)',
                                                                    fontFamily: 'var(--font-body)'
                                                                }}>-</span>
                                                            );
                                                        }
                                                        
                                                        const today = new Date();
                                                        today.setHours(0, 0, 0, 0);
                                                        dueDate.setHours(0, 0, 0, 0);
                                                        const isOverdue = dueDate < today;
                                                        
                                                        return (
                                                            <span style={{
                                                                fontSize: "14px",
                                                                color: isOverdue ? "#DC2626" : "#111827",
                                                                fontWeight: isOverdue ? 500 : 'normal'
                                                            }}>
                                                                {dueDate.toLocaleDateString()}
                                                            </span>
                                                        );
                                                    } catch (e) {
                                                        console.warn('Error parsing due date:', dueDateStr, e);
                                                        return (
                                                            <span style={{
                                                                fontSize: 'var(--font-size-sm)',
                                                                color: 'var(--color-gray-500)',
                                                                fontFamily: 'var(--font-body)'
                                                            }}>-</span>
                                                        );
                                                    }
                                                })()}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap w-24" style={{ padding: "12px 16px" }}>
                                                <Button
                                                    variant="subtle"
                                                    size="xs"
                                                    onClick={() => handleOpenDelegation(item)}
                                                    style={{
                                                        fontSize: "14px"
                                                    }}
                                                >
                                                    Delegate
                                                </Button>
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

            {selectedItemForDelegation && (
                <DelegationModal
                    opened={delegationModalOpen}
                    onClose={handleCloseDelegation}
                    epicId={selectedItemForDelegation.launch.id}
                    epicName={selectedItemForDelegation.launch.name}
                    taskId={selectedItemForDelegation.id}
                    taskLabel={selectedItemForDelegation.criterion.label}
                    category={selectedItemForDelegation.criterion.category}
                    isGate={selectedItemForDelegation.criterion.gate || false}
                    currentApproverEmail={currentUserEmail}
                    onDelegate={handleDelegate}
                />
            )}
        </div>
    );
}

