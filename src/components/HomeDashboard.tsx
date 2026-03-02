"use client";

import { Title, Text, Box, Select, Button, Group, Tooltip, Switch, Menu, UnstyledButton, ActionIcon } from '@mantine/core';
import { IconRefresh, IconDots, IconArrowsRightLeft, IconMessageCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { PurpleLoader } from "@/components/PurpleLoader";
import { DelegationModal, DelegationType } from "@/components/DelegationModal";
import { CommentsModal } from "@/components/CommentsModal";
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { fetchWithRateLimit } from "@/lib/fetch-with-rate-limit";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { isEnabled, FEATURE_NOT_APPLICABLE } from "@/lib/flags";

type ViewAsUser = { email: string; name: string } | null;

interface HomeDashboardProps {
  userEmail?: string | null;
  firstName?: string | null;
  isFirstTime?: boolean;
  isSuperAdmin?: boolean;
}

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
        sort_order?: number;
        status_definition_go?: string | null;
        status_definition_conditional?: string | null;
        status_definition_no_go?: string | null;
        rating_timing?: number | null;
    };
};

type ReleaseGroup = {
    releaseName: string;
    releaseDate: string | null;
    items: MyItem[];
};

// Traffic light (Go/No-Go score) for My Items
function StatusTrafficLight({
    status,
    itemId,
    epicId,
    onStatusUpdate,
    isSaving,
    showNotApplicable = false,
    isGate = false,
    definitions,
}: {
    status: string;
    itemId: string;
    epicId: string;
    onStatusUpdate: () => void | Promise<void>;
    isSaving: boolean;
    showNotApplicable?: boolean;
    isGate?: boolean;
    definitions?: { go?: string | null; conditional?: string | null; no_go?: string | null };
}) {
    const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    const baseLights = [
        {
            value: 'GO',
            color: '#10b981',
            greyColor: '#d1d5db',
            label: 'GO',
            definition: (definitions?.go?.trim()) || 'Meets all requirements',
        },
        {
            value: 'CONDITIONAL',
            color: 'var(--color-conditional-alloy, #FFA680)',
            greyColor: '#d1d5db',
            label: 'CONDITIONAL',
            definition: (definitions?.conditional?.trim()) || 'Meets requirements with conditions',
        },
        {
            value: 'NO_GO',
            color: '#ef4444',
            greyColor: '#d1d5db',
            label: 'NO GO',
            definition: (definitions?.no_go?.trim()) || 'Does not meet requirements',
        },
    ];
    const naLight = {
        value: 'NOT_APPLICABLE',
        color: 'var(--nav-bg, #37352A)',
        greyColor: 'transparent',
        label: 'n/a',
        definition: 'Not applicable; neutral to readiness score',
    };
    const lights = showNotApplicable && !isGate ? [...baseLights, naLight] : baseLights;
    const isNaLight = (light: typeof baseLights[0] | typeof naLight) => light.value === 'NOT_APPLICABLE';

    const handleStatusChange = async (newStatus: string) => {
        if (newStatus === status || isUpdating) return;
        
        setIsUpdating(true);
        setOptimisticStatus(newStatus);
        
        try {
            const res = await fetch(`/api/epics/${epicId}/criteria/${itemId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                
                if (res.status === 429) {
                    const resetHeader = res.headers.get('X-RateLimit-Reset');
                    let retryAfter = 5000;
                    
                    if (resetHeader) {
                        try {
                            const resetTime = new Date(resetHeader).getTime();
                            const now = Date.now();
                            const timeUntilReset = resetTime - now;
                            if (timeUntilReset > 0 && timeUntilReset < 60000) {
                                retryAfter = timeUntilReset + 500;
                            }
                        } catch (e) {
                            console.warn('Failed to parse X-RateLimit-Reset header:', e);
                        }
                    }
                    
                    notifications.show({
                        title: 'Rate limit exceeded',
                        message: `Too many requests. Retrying in ${Math.ceil(retryAfter / 1000)} seconds...`,
                        color: 'yellow',
                        autoClose: retryAfter,
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    
                    const retryRes = await fetchWithRateLimit(`/api/epics/${epicId}/criteria/${itemId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    
                    if (!retryRes.ok) {
                        const retryErrorData = await retryRes.json().catch(() => ({}));
                        throw new Error(retryErrorData.error || 'Failed to update Go/No-Go score after retry');
                    }
                    
                    if (typeof window !== 'undefined') {
                        localStorage.removeItem(getCacheKey(false));
                        localStorage.removeItem(getCacheKey(true));
                    }
                    await onStatusUpdate();
                    setOptimisticStatus(null);
                    return;
                }
                
                throw new Error(errorData.error || 'Failed to update Go/No-Go score');
            }
            
            if (typeof window !== 'undefined') {
                localStorage.removeItem(getCacheKey(false));
                localStorage.removeItem(getCacheKey(true));
            }
            await onStatusUpdate();
            setOptimisticStatus(null);
        } catch (error: any) {
            console.error('Failed to update Go/No-Go score:', error);
            notifications.show({
                title: 'Update failed',
                message: error.message || 'Failed to update Go/No-Go score. Please try again.',
                color: 'red',
                autoClose: 5000,
            });
            setOptimisticStatus(null);
        } finally {
            setIsUpdating(false);
        }
    };

    const currentStatus = optimisticStatus || status;

    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {lights.map((light) => {
                const isSelected = currentStatus === light.value;
                const showLabelInCircle = isNaLight(light);
                
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
                            onClick={() => !isSaving && !isUpdating && handleStatusChange(light.value)}
                            disabled={isSaving || isUpdating}
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                border: isSelected ? `3px solid ${light.color}` : '2px solid #e5e7eb',
                                backgroundColor: isSelected ? light.color : light.greyColor,
                                cursor: (isSaving || isUpdating) ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                                opacity: (isSaving || isUpdating) ? 0.5 : 1,
                                boxShadow: isSelected ? `0 0 8px ${light.color}66` : 'none',
                                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => {
                                if (!isSaving && !isUpdating && !isSelected) {
                                    e.currentTarget.style.backgroundColor = `${light.color}40`;
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSaving && !isUpdating && !isSelected) {
                                    e.currentTarget.style.backgroundColor = light.greyColor;
                                    e.currentTarget.style.transform = 'scale(1)';
                                }
                            }}
                        >
                            {showLabelInCircle && (
                                <span
                                    style={{
                                        fontSize: 8,
                                        fontWeight: 600,
                                        color: isSelected ? '#fff' : '#6b7280',
                                        lineHeight: 1,
                                        textTransform: 'lowercase',
                                    }}
                                >
                                    n/a
                                </span>
                            )}
                        </button>
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
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

interface CachedData {
    items: MyItem[];
    timestamp: number;
}

interface CachedReleaseSchedule {
    data: Array<{ release_name: string; launch_date: string | null }>;
    timestamp: number;
}

interface CachedEpicReleaseMap {
    data: Record<string, string | null>;
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
        
        if (age < CACHE_EXPIRY_MS) {
            return data.items;
        }
        
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

export function HomeDashboard({ userEmail, firstName, isFirstTime = false, isSuperAdmin = false }: HomeDashboardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [viewAsUser, setViewAsUser] = useState<ViewAsUser>(null);
  const [usersForViewAs, setUsersForViewAs] = useState<Array<{ value: string; label: string }>>([]);
  const [criteriaCount, setCriteriaCount] = useState<number | null>(null);
  
  const { flags: featureFlags } = useFeatureFlags();
  const showNotApplicable = isEnabled(FEATURE_NOT_APPLICABLE, featureFlags);
  const readOnly = Boolean(viewAsUser?.email);
  const [items, setItems] = useState<MyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
  const [delegationModalOpen, setDelegationModalOpen] = useState(false);
  const [selectedItemForDelegation, setSelectedItemForDelegation] = useState<MyItem | null>(null);
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [selectedItemForComments, setSelectedItemForComments] = useState<MyItem | null>(null);
  const [commentsModalInitialTab, setCommentsModalInitialTab] = useState<'content' | 'comments'>('comments');
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [releaseSchedule, setReleaseSchedule] = useState<Array<{ release_name: string; launch_date: string | null }>>([]);
  const [epicReleaseMap, setEpicReleaseMap] = useState<Map<string, string | null>>(new Map());
  const [showAllItems, setShowAllItems] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingReleaseNames, setIsLoadingReleaseNames] = useState(true);
  const [launchStages, setLaunchStages] = useState<Array<{ id: number; sort_order: number; duration_days: number | null }>>([]);
  const [stageDaysBeforeLaunch, setStageDaysBeforeLaunch] = useState<Map<number, number>>(new Map());
  const [stageDaysAfterLaunch, setStageDaysAfterLaunch] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled || !data?.users) return;
      const currentEmail = (userEmail || '').toLowerCase();
      const options: Array<{ value: string; label: string }> = [
        { value: '', label: 'My tasks' },
        ...data.users
          .filter((u: { email?: string }) => (u.email || '').toLowerCase() !== currentEmail)
          .map((u: { email: string; name?: string; first_name?: string; last_name?: string }) => ({
            value: u.email,
            label: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.name || u.email,
          })),
      ];
      setUsersForViewAs(options);
    })();
    return () => { cancelled = true; };
  }, [userEmail, isSuperAdmin]);

  useEffect(() => {
    const checkAuth = async () => {
      if (!userEmail) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
          const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
          const isExternal =
            marketingUrl &&
            typeof window !== 'undefined' &&
            new URL(marketingUrl).origin !== window.location.origin;
          if (isExternal) {
            window.location.href = marketingUrl;
          } else {
            router.push('/login');
          }
        }
      }
    };
    checkAuth();
  }, [userEmail, router, supabase]);

  useEffect(() => {
    if (readOnly) {
      loadData();
      fetchCurrentUser();
      fetchReleaseSchedule();
      return;
    }
    const cachedItems = getCachedData(showAllItems);
    const cachedSchedule = getCachedReleaseSchedule();
    const cachedEpicMap = getCachedEpicReleaseMap();

    if (cachedItems) {
      setItems(cachedItems);
      setLoading(false);
      setIsRefreshing(true);
    }
    if (cachedSchedule) setReleaseSchedule(cachedSchedule);
    if (cachedEpicMap) {
      setEpicReleaseMap(cachedEpicMap);
      setIsLoadingReleaseNames(false);
    } else if (cachedItems && cachedItems.length > 0) {
      setIsLoadingReleaseNames(true);
    } else {
      setIsLoadingReleaseNames(false);
    }
    loadData();
    fetchCurrentUser();
    fetchReleaseSchedule();
  }, [viewAsUser?.email]);

  useEffect(() => {
    const supabase = createClient();
    
    const deleteChannel = supabase
      .channel('epic-deletes')
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'epic'
        },
        (payload) => {
          console.log('Epic deleted, refreshing My Tasks:', payload.old);
          if (typeof window !== 'undefined') {
            localStorage.removeItem(getCacheKey(false));
            localStorage.removeItem(getCacheKey(true));
          }
          setItems(prevItems => {
            const deletedEpicId = payload.old?.id;
            if (deletedEpicId) {
              return prevItems.filter(item => item.launch?.id !== deletedEpicId);
            }
            return prevItems;
          });
          loadData(0, false);
        }
      )
      .subscribe();

    const archiveChannel = supabase
      .channel('epic-archive')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'epic'
        },
        (payload) => {
          const wasArchived = payload.old?.archived;
          const isArchived = payload.new?.archived;
          
          if (wasArchived !== isArchived) {
            if (isArchived) {
              console.log('Epic archived, refreshing My Tasks:', payload.new);
              if (typeof window !== 'undefined') {
                localStorage.removeItem(getCacheKey(false));
                localStorage.removeItem(getCacheKey(true));
              }
              setItems(prevItems => {
                const archivedEpicId = payload.new?.id;
                if (archivedEpicId) {
                  return prevItems.filter(item => item.launch?.id !== archivedEpicId);
                }
                return prevItems;
              });
            } else {
              console.log('Epic unarchived, refreshing My Tasks:', payload.new);
              if (typeof window !== 'undefined') {
                localStorage.removeItem(getCacheKey(false));
                localStorage.removeItem(getCacheKey(true));
              }
            }
            loadData(0, false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(deleteChannel);
      supabase.removeChannel(archiveChannel);
    };
  }, [showAllItems]);

  useEffect(() => {
    if (items.length > 0) {
      setIsLoadingReleaseNames(true);
      fetchEpicReleaseNames().finally(() => {
        setIsLoadingReleaseNames(false);
      });
    } else {
      setIsLoadingReleaseNames(false);
    }
  }, [items]);

  useEffect(() => {
    fetchLaunchStages();
  }, []);

  const fetchLaunchStages = async () => {
    try {
      const res = await fetch('/api/launch-stages', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const stages = data.stages || [];
        setLaunchStages(stages);
        
        // Calculate days before/after launch for each stage
        const daysBeforeMap = new Map<number, number>();
        const daysAfterMap = new Map<number, number>();
        
        const lastPreLaunchStage = stages.find((s: any) => s.sort_order === 3);
        
        stages.forEach((stage: any) => {
          if (stage.sort_order <= 3 && lastPreLaunchStage) {
            // Pre-launch stages: sum durations of stages before this one
            const stagesBefore = stages.filter(
              (s: any) =>
                s.sort_order < stage.sort_order &&
                s.sort_order <= lastPreLaunchStage.sort_order &&
                s.duration_days !== null
            );
            const totalDaysBefore = stagesBefore.reduce(
              (sum: number, s: any) => sum + (s.duration_days || 0),
              0
            );
            if (totalDaysBefore > 0) {
              daysBeforeMap.set(stage.id, totalDaysBefore);
            }
          } else if (stage.sort_order > 3) {
            // Post-launch stages: sum durations up to this stage
            const stagesUpTo = stages.filter(
              (s: any) =>
                s.sort_order <= stage.sort_order &&
                s.duration_days !== null
            );
            const totalDaysAfter = stagesUpTo.reduce(
              (sum: number, s: any) => sum + (s.duration_days || 0),
              0
            );
            if (totalDaysAfter > 0) {
              daysAfterMap.set(stage.id, totalDaysAfter);
            }
          }
        });
        
        setStageDaysBeforeLaunch(daysBeforeMap);
        setStageDaysAfterLaunch(daysAfterMap);
      }
    } catch (error) {
      console.error('Failed to fetch launch stages:', error);
    }
  };

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
    const retryDelay = 1000 * Math.pow(2, retryCount);
    const useViewAsCache = !readOnly;

    if (useCache && useViewAsCache && items.length === 0 && retryCount === 0) {
      const cachedItems = getCachedData(showAllItems);
      if (cachedItems && cachedItems.length > 0) {
        setItems(cachedItems);
        setLoading(false);
        setIsRefreshing(true);
      }
    }

    try {
      if (retryCount === 0 && (items.length === 0 || readOnly)) {
        setLoading(true);
      }
      setError(null);
      const params = new URLSearchParams();
      if (showAllItems) params.set('showAll', 'true');
      if (viewAsUser?.email) params.set('viewAsEmail', viewAsUser.email);
      if (!useCache) params.set('_t', String(Date.now()));
      const url = `/api/my-items${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, {
        cache: 'no-store',
        credentials: 'include',
        headers: useCache ? undefined : { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error("Unable to load your tasks. Please check your connection and try again.");
        }
        
        if (retryCount < maxRetries) {
          console.warn(`Request failed (attempt ${retryCount + 1}/${maxRetries + 1}), retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return loadData(retryCount + 1, false);
        }
        
        throw new Error("Unable to load your tasks. The server is experiencing issues. Please try again.");
      }
      
      const data = await res.json();
      setItems(data);
      if (!readOnly) setCachedData(showAllItems, data);
      setError(null);
      setIsRefreshing(false);
    } catch (e: any) {
      if (retryCount >= maxRetries) {
        const cachedItems = getCachedData(showAllItems);
        if (!cachedItems || cachedItems.length === 0) {
          setError(e.message || "Something went wrong while loading your tasks.");
        } else {
          console.warn('Failed to fetch fresh data, using cached data:', e.message);
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return loadData(retryCount + 1, false);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (readOnly) {
      loadData(0, false);
      return;
    }
    const cachedItems = getCachedData(showAllItems);
    if (cachedItems) {
      setItems(cachedItems);
      setIsRefreshing(true);
    }
    loadData(0, false);
  }, [showAllItems, viewAsUser?.email]);

  async function fetchReleaseSchedule() {
    try {
      const res = await fetchWithRateLimit("/api/releases", { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const schedule = data || [];
        setReleaseSchedule(schedule);
        setCachedReleaseSchedule(schedule);
      } else {
        console.warn('Failed to fetch release schedule:', res.status);
        const cachedSchedule = getCachedReleaseSchedule();
        if (cachedSchedule) {
          setReleaseSchedule(cachedSchedule);
        }
      }
    } catch (error) {
      console.error('Failed to fetch release schedule:', error);
      const cachedSchedule = getCachedReleaseSchedule();
      if (cachedSchedule) {
        setReleaseSchedule(cachedSchedule);
      }
    }
  }

  async function fetchEpicReleaseNames(): Promise<void> {
    try {
      const epicIds = Array.from(new Set(items.map(item => item.launch.id)));
      
      if (epicIds.length === 0) {
        setEpicReleaseMap(new Map());
        setIsLoadingReleaseNames(false);
        return;
      }
      
      const cachedMap = getCachedEpicReleaseMap();
      const releaseMap = cachedMap ? new Map(cachedMap) : new Map<string, string | null>();
      
      const missingEpicIds = epicIds.filter(id => !releaseMap.has(id));
      
      if (missingEpicIds.length === 0) {
        setEpicReleaseMap(releaseMap);
        setIsLoadingReleaseNames(false);
        return;
      }
      
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
              releaseMap.set(epicId, null);
            }
          } catch (error) {
            console.error(`Failed to fetch epic ${epicId}:`, error);
            releaseMap.set(epicId, null);
          }
        });
        await Promise.all(promises);
      }
      
      epicIds.forEach(id => {
        if (!releaseMap.has(id)) {
          releaseMap.set(id, null);
        }
      });
      
      setEpicReleaseMap(releaseMap);
      setCachedEpicReleaseMap(releaseMap);
      setIsLoadingReleaseNames(false);
    } catch (error) {
      console.error('Failed to fetch epic release names:', error);
      const cachedMap = getCachedEpicReleaseMap();
      if (cachedMap) {
        setEpicReleaseMap(cachedMap);
      } else {
        const allEpicIds = Array.from(new Set(items.map(item => item.launch.id)));
        const releaseMap = new Map<string, string | null>();
        allEpicIds.forEach(id => releaseMap.set(id, null));
        setEpicReleaseMap(releaseMap);
      }
      setIsLoadingReleaseNames(false);
    }
  }

  const getReleaseName = (epic: any): string | null => {
    if (!epic?.aha_fields || typeof epic.aha_fields !== 'object') return null;
    const fields = epic.aha_fields as any;

    if (fields.standard_fields && typeof fields.standard_fields === 'object') {
      const standardFields = fields.standard_fields;
      const releaseName = standardFields?.aha_release_name ||
        standardFields?.release?.name || null;
      if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
        return releaseName.trim();
      }
    }

    if (fields.custom_fields && typeof fields.custom_fields === 'object') {
      const customFields = fields.custom_fields;
      const releaseName = customFields?.release_target_after_pod_planning;
      if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
        return releaseName.trim();
      }
    }

    const topLevel = fields?.aha_release_name ?? epic?.aha_release_name;
    if (topLevel && typeof topLevel === 'string' && topLevel.trim()) {
      return topLevel.trim();
    }

    return null;
  };

  const normalizeDateStr = (d: string | null | undefined): string | null => {
    if (d == null || typeof d !== 'string' || !d.trim()) return null;
    try {
      const date = new Date(d.trim());
      if (isNaN(date.getTime())) return null;
      return date.toISOString().slice(0, 10);
    } catch {
      return null;
    }
  };

  const isSuccessDefinedCriterion = (item: MyItem): boolean =>
    (item.criterion?.label ?? '').toLowerCase().includes('success defined');

  const releaseGroups: ReleaseGroup[] = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const releaseDateMap = new Map<string, string | null>();
    const releaseNameByDate = new Map<string, string>();
    releaseSchedule.forEach(release => {
      if (release.release_name) {
        releaseDateMap.set(release.release_name, release.launch_date);
        const normDate = normalizeDateStr(release.launch_date);
        if (normDate) releaseNameByDate.set(normDate, release.release_name);
      }
    });

    const releaseGroupsMap = new Map<string, MyItem[]>();
    const ungroupedItems: MyItem[] = [];

    items.forEach(item => {
      let releaseName = epicReleaseMap.get(item.launch.id) ?? null;
      if (!releaseName && item.launch.target_launch_date) {
        const normDate = normalizeDateStr(item.launch.target_launch_date);
        releaseName = normDate ? (releaseNameByDate.get(normDate) ?? null) : null;
      }
      if (releaseName) {
        if (!releaseGroupsMap.has(releaseName)) {
          releaseGroupsMap.set(releaseName, []);
        }
        releaseGroupsMap.get(releaseName)!.push(item);
      } else {
        ungroupedItems.push(item);
      }
    });

    const groups: ReleaseGroup[] = Array.from(releaseGroupsMap.entries()).map(([releaseName, items]) => {
      const releaseDateNorm = normalizeDateStr(releaseDateMap.get(releaseName) ?? null);
      const releaseDatePassed = releaseDateNorm != null && releaseDateNorm < today;

      const sorted = [...items].sort((a, b) => {
        const nameCmp = (a.launch?.name ?? '').localeCompare(b.launch?.name ?? '');
        if (nameCmp !== 0) return nameCmp;
        const orderA = a.criterion?.sort_order ?? 0;
        const orderB = b.criterion?.sort_order ?? 0;
        return orderA - orderB;
      });

      const filteredItems = releaseDatePassed
        ? sorted.filter(
            (item) =>
              isSuccessDefinedCriterion(item) && item.status !== 'GO'
          )
        : sorted.filter((item) => item.status !== 'NOT_APPLICABLE');

      return {
        releaseName,
        releaseDate: releaseDateMap.get(releaseName) || null,
        items: filteredItems
      };
    });

    groups.sort((a, b) => {
      const nameA = (a.releaseName || '').toLowerCase();
      const nameB = (b.releaseName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const groupsWithItems = groups.filter((g) => g.items.length > 0);

    let releasesToShow = groupsWithItems;
    if (showAllItems && groupsWithItems.length > 10) {
      releasesToShow = groupsWithItems.slice(0, 10);
    }

    if (ungroupedItems.length > 0 && !isLoadingReleaseNames) {
      const sortedUngrouped = [...ungroupedItems].sort((a, b) => {
        const nameCmp = (a.launch?.name ?? '').localeCompare(b.launch?.name ?? '');
        if (nameCmp !== 0) return nameCmp;
        const orderA = a.criterion?.sort_order ?? 0;
        const orderB = b.criterion?.sort_order ?? 0;
        return orderA - orderB;
      });
      releasesToShow.push({
        releaseName: 'Ungrouped',
        releaseDate: null,
        items: sortedUngrouped
      });
    }

    return releasesToShow;
  }, [items, releaseSchedule, epicReleaseMap, showAllItems, isLoadingReleaseNames]);

  const headingStats = useMemo(() => {
    const totalCriteria = releaseGroups.reduce((sum, g) => sum + g.items.length, 0);

    const releasesWithDates = releaseSchedule
      .filter(r => r.release_name && r.launch_date)
      .map(r => ({
        name: r.release_name!,
        date: r.launch_date!
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 2);

    const nextTwoReleaseNames = new Set(releasesWithDates.map(r => r.name));
    const criteriaForNextTwoReleases = releaseGroups
      .filter(g => nextTwoReleaseNames.has(g.releaseName))
      .reduce((sum, g) => sum + g.items.length, 0);

    return {
      total: totalCriteria,
      forNextTwoReleases: criteriaForNextTwoReleases
    };
  }, [releaseGroups, releaseSchedule]);

  useEffect(() => {
    setCriteriaCount(headingStats.total);
  }, [headingStats.total]);

  const handleOpenDelegation = (item: MyItem) => {
    setSelectedItemForDelegation(item);
    setDelegationModalOpen(true);
  };

  const handleCloseDelegation = () => {
    setDelegationModalOpen(false);
    setSelectedItemForDelegation(null);
  };

  const handleOpenComments = (item: MyItem) => {
    setSelectedItemForComments(item);
    setCommentsModalInitialTab('comments');
    setCommentsModalOpen(true);
  };

  const handleCloseComments = () => {
    setCommentsModalOpen(false);
    setSelectedItemForComments(null);
    loadData(0, false);
  };

  const handleDelegate = async (delegationType: DelegationType, newApproverEmail: string) => {
    if (!selectedItemForDelegation) return;
    
    try {
      const res = await fetchWithRateLimit(`/api/epics/${selectedItemForDelegation.launch.id}/delegate`, {
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
  
  const displayName = firstName || userEmail?.split('@')[0] || 'dev';

  if (loading && items.length === 0) {
    return (
      <div className="min-h-screen pb-8" style={{ 
        fontFamily: 'var(--font-body)',
        backgroundColor: 'var(--color-platinum)'
      }}>
        <div style={{
          maxWidth: 'var(--page-container-max-width)',
          margin: '0 auto',
          paddingLeft: 'var(--page-container-padding-x)',
          paddingRight: 'var(--page-container-padding-x)',
          paddingTop: 'var(--page-container-padding-top)'
        }}
        className="sm:px-6 lg:px-8"
        >
          <div className="mb-8">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-2)' }}>
              <div style={{ flex: 1 }}>
                <div className="space-y-2 mb-2">
                  {/* Title skeleton - matches Title component with Marcellus font */}
                  <div 
                    className="bg-gray-200 rounded animate-pulse" 
                    style={{ 
                      height: 'var(--font-size-4xl)',
                      width: '480px',
                      maxWidth: '100%',
                      fontFamily: 'var(--font-marcellus), serif'
                    }} 
                  />
                  {/* Subtitle skeleton - matches Text size="lg" */}
                  <div 
                    className="bg-gray-200 rounded animate-pulse" 
                    style={{ 
                      height: 'var(--font-size-lg)',
                      width: '400px',
                      maxWidth: '100%',
                      marginTop: '8px'
                    }} 
                  />
                </div>
              </div>
            </div>
            {[1, 2].map((groupIndex) => (
              <div key={groupIndex} style={{ marginBottom: "var(--spacing-6)" }}>
                {/* Group header skeleton - matches h2 styling */}
                <div style={{ marginBottom: 'var(--spacing-3)' }}>
                  <div 
                    className="bg-gray-200 rounded animate-pulse" 
                    style={{ 
                      height: '20px',
                      width: '200px',
                      maxWidth: '100%',
                      fontFamily: 'var(--font-heading)'
                    }} 
                  />
                </div>
                <div
                  className="rounded-lg overflow-hidden"
                  style={{
                    border: "1px solid #E5E7EB",
                    backgroundColor: "#FFFFFF",
                    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
                  }}
                >
                  <table className="min-w-full table-fixed" style={{ borderCollapse: "collapse" }}>
                    <thead style={{ backgroundColor: "#F9FAFB", borderBottom: "2px solid #E5E7EB" }}>
                      <tr>
                        <th className="px-4 py-3 text-left" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Epic</th>
                        <th className="px-4 py-3 text-left w-24" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Tier</th>
                        <th className="hidden md:table-cell px-4 py-3 text-left" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Pod</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280", minWidth: "300px", width: "30%" }}>Criterion</th>
                        <th className="px-4 py-3 text-left w-24" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Go/No-Go Score</th>
                        <th className="px-4 py-3 text-left w-32" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Due on</th>
                      </tr>
                    </thead>
                    <tbody style={{ borderTop: "1px solid #E5E7EB" }}>
                      {Array.from({ length: 4 }).map((_, rowIndex) => (
                        <tr key={rowIndex} className="!bg-white" style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}>
                          <td className="px-4 py-3 w-100" style={{ padding: "12px 16px" }}>
                            <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: "70%" }} />
                          </td>
                          <td className="px-4 py-3 w-24">
                            <div className="h-6 bg-gray-200 rounded animate-pulse" style={{ width: "56px" }} />
                          </td>
                          <td className="hidden md:table-cell px-4 py-3" style={{ padding: "12px 16px" }}>
                            <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: "60px" }} />
                          </td>
                          <td style={{ padding: "12px 20px", minWidth: "300px", width: "30%" }}>
                            <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: "80%" }} />
                            <div className="h-3 bg-gray-200 rounded animate-pulse mt-2" style={{ width: "50%" }} />
                          </td>
                          <td className="px-4 py-3 w-24" style={{ padding: "12px 16px" }}>
                            <div className="h-6 bg-gray-200 rounded animate-pulse" style={{ width: "60px" }} />
                          </td>
                          <td className="px-4 py-3 w-32" style={{ padding: "12px 16px" }}>
                            <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: "80px" }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8" style={{ 
      fontFamily: 'var(--font-body)',
      backgroundColor: 'var(--color-platinum)'
    }}>
      <div style={{
        maxWidth: 'var(--page-container-max-width)',
        margin: '0 auto',
        paddingLeft: 'var(--page-container-padding-x)',
        paddingRight: 'var(--page-container-padding-x)',
        paddingTop: 'var(--page-container-padding-top)'
      }}
      className="sm:px-6 lg:px-8"
      >
        <div className="mb-8">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-2)' }}>
            <div style={{ flex: 1 }}>
              <Title 
                order={1} 
                className="text-4xl font-bold mb-2"
                style={{ 
                  fontFamily: 'var(--font-marcellus), serif',
                  color: 'var(--color-gray-900)',
                  fontSize: 'var(--font-size-4xl)',
                  fontWeight: 'var(--font-weight-bold)'
                }}
              >
                {isFirstTime ? (
                  <>Welcome to ClearGO, <span style={{ color: 'var(--table-steel, #697771)' }}>{displayName}</span>!</>
                ) : (
                  <>Welcome back, <span style={{ color: 'var(--table-steel, #697771)' }}>{displayName}</span>. You have <span style={{ color: 'var(--table-steel, #697771)' }}>{headingStats.total}</span> criteria to inform.
                 
                  
                  </>
                )}
              </Title>
              <Text 
                size="lg" 
                style={{ 
                  fontFamily: 'var(--font-body)',
                  color: 'var(--color-gray-500)',
                  fontSize: 'var(--font-size-lg)'
                }}
              >
                {isFirstTime ? (
                  <>
                    Get started by exploring your epics and launch readiness criteria. Track progress, collaborate with your team, and ensure successful go-to-market execution.
                  </>
                ) : (
                  <>
                    Manage your epics, track readiness criteria, and ensure successful go-to-market execution.
                  </>
                )}
              </Text>
            </div>
            <Tooltip label="Page Options" position="left" withArrow>
              <Menu shadow="md" width={280} position="bottom-end">
                <Menu.Target>
                  <UnstyledButton
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'var(--color-gray-600)',
                      transition: 'background-color 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-gray-100)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <IconDots size={20} />
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  {isSuperAdmin && usersForViewAs.length > 1 && (
                    <Menu.Label style={{ fontFamily: 'var(--font-body)' }}>
                      See Home page as
                    </Menu.Label>
                  )}
                  {isSuperAdmin && usersForViewAs.length > 1 && (
                    <>
                      <Box px="xs" pb="xs">
                        <Select
                          data={usersForViewAs}
                          value={viewAsUser ? viewAsUser.email : ''}
                          onChange={(value) => {
                            if (value === null || value === '') {
                              setViewAsUser(null);
                              return;
                            }
                            const opt = usersForViewAs.find((o) => o.value === value);
                            setViewAsUser(opt ? { email: opt.value, name: opt.label } : null);
                          }}
                          placeholder="My tasks"
                          allowDeselect={false}
                          searchable
                          nothingFoundMessage="No user found"
                          size="sm"
                          styles={() => ({
                            input: { fontFamily: 'var(--font-body)' },
                          })}
                        />
                      </Box>
                      <Menu.Divider />
                    </>
                  )}
                  <Menu.Label style={{ fontFamily: 'var(--font-body)' }}>
                    Show pending items only
                  </Menu.Label>
                  <Box px="xs" pb="xs">
                    <Group gap="sm">
                      <Switch
                        checked={showAllItems}
                        onChange={(e) => setShowAllItems(e.currentTarget.checked)}
                        label={showAllItems ? 'All' : 'Pending'}
                        styles={{
                          label: {
                            fontFamily: 'var(--font-body)',
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--mantine-color-dimmed)'
                          }
                        }}
                      />
                    </Group>
                  </Box>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<IconRefresh size={16} />}
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.removeItem(getCacheKey(false));
                        localStorage.removeItem(getCacheKey(true));
                      }
                      loadData(0, false);
                    }}
                    disabled={isRefreshing}
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Tooltip>
          </div>
          {isFirstTime && (
            <div 
              style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: '#eff6ff',
                borderLeft: '4px solid #3b82f6',
                borderRadius: '8px',
                border: '1px solid #dbeafe'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ fontSize: '20px', lineHeight: '1' }}>💡</div>
                <div style={{ flex: 1 }}>
                  <p style={{ 
                    fontFamily: 'var(--font-body)',
                    color: '#1e40af', 
                    fontWeight: '600', 
                    marginBottom: '4px',
                    fontSize: '14px'
                  }}>
                    Quick Start
                  </p>
                  <p style={{ 
                    fontFamily: 'var(--font-body)',
                    color: '#1e3a8a', 
                    fontSize: '14px', 
                    lineHeight: '1.6',
                    margin: 0
                  }}>
                    Start by reviewing your assigned epics below. Click on any epic to view its launch readiness criteria, track progress, and collaborate with your team.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {((viewAsUser && viewAsUser.email) || showAllItems) && (
          <Box
            style={{
              marginBottom: 'var(--spacing-4)',
              padding: '12px 16px',
              backgroundColor: 'var(--color-platinum)',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
            }}
          >
            <Group justify="space-between">
              <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                Viewing{' '}
                {viewAsUser && viewAsUser.email ? (
                  <>tasks as <strong style={{ color: 'var(--color-gray-900)' }}>{viewAsUser.name}</strong></>
                ) : (
                  <>my tasks</>
                )}
                {showAllItems ? ' • all items' : ' • pending items only'}
              </Text>
              {viewAsUser && viewAsUser.email && (
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setViewAsUser(null)}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  Back to my tasks
                </Button>
              )}
            </Group>
          </Box>
        )}

        <div>
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
              <PurpleLoader size="sm" />
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
                        <th className="hidden md:table-cell px-4 py-3 text-left" style={{ 
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
                          color: "#6B7280",
                          minWidth: "300px",
                          width: "30%"
                        }}>Criterion</th>
                        <th className="px-4 py-3 text-left w-24" style={{ 
                          fontSize: "12px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "#6B7280"
                        }}>Go/No-Go Score</th>
                        <th className="px-4 py-3 text-left w-32" style={{ 
                          fontSize: "12px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "#6B7280"
                        }}>Due on</th>
                        {!readOnly && (
                        <th className="px-4 py-3 text-right w-24" style={{ 
                          fontSize: "12px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "#6B7280"
                        }}></th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white" style={{ borderTop: "1px solid #E5E7EB" }}>
                      {group.items.map(item => (
                        <tr 
                          key={item.id}
                          className="!bg-white"
                          style={{ 
                            backgroundColor: "#FFFFFF",
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
                          <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                            {item.launch.pod || '-'}
                          </td>
                          <td style={{
                            padding: "12px 20px",
                            fontSize: "14px",
                            color: "#111827",
                            minWidth: "300px",
                            width: "30%"
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
                            {readOnly ? (
                              <span className="px-2 py-1 rounded text-xs font-medium" style={{
                                backgroundColor: item.status === 'GO' ? '#d1fae5' : item.status === 'CONDITIONAL' ? 'rgba(255, 166, 128, 0.3)' : item.status === 'NO_GO' ? '#fee2e2' : '#f3f4f6',
                                color: item.status === 'GO' ? '#065f46' : item.status === 'CONDITIONAL' ? '#9a3412' : item.status === 'NO_GO' ? '#991b1b' : '#374151',
                              }}>
                                {item.status === 'NOT_APPLICABLE' ? 'n/a' : item.status.replace('_', ' ')}
                              </span>
                            ) : (
                            <StatusTrafficLight
                              status={item.status}
                              itemId={item.id}
                              epicId={item.launch.id}
                              onStatusUpdate={loadData}
                              isSaving={savingItems.has(item.id)}
                              showNotApplicable={showNotApplicable}
                              isGate={item.criterion?.gate === true}
                              definitions={{
                                go: item.criterion?.status_definition_go,
                                conditional: item.criterion?.status_definition_conditional,
                                no_go: item.criterion?.status_definition_no_go,
                              }}
                            />
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap w-32" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                            {(() => {
                              // Calculate due date: use condition_due_date if available, otherwise calculate from launch stages
                              const calculateDueDate = (): string | null => {
                                // First, try to use stored condition_due_date
                                if (item.condition_due_date && item.condition_due_date.trim() !== '') {
                                  return item.condition_due_date;
                                }
                                
                                // If no stored date, calculate from launch stages (same logic as Epic detail page)
                                if (!item.criterion?.rating_timing || launchStages.length === 0) {
                                  return null;
                                }
                                
                                const targetDate = item.launch.target_launch_date;
                                if (!targetDate) {
                                  return null;
                                }
                                
                                const ratingTimingId = item.criterion.rating_timing;
                                const daysBefore = stageDaysBeforeLaunch.get(ratingTimingId);
                                const daysAfter = stageDaysAfterLaunch.get(ratingTimingId);
                                
                                if (daysBefore === undefined && daysAfter === undefined) {
                                  return null;
                                }
                                
                                const dueDate = new Date(targetDate);
                                
                                if (daysBefore !== undefined) {
                                  dueDate.setDate(dueDate.getDate() - daysBefore);
                                } else if (daysAfter !== undefined) {
                                  dueDate.setDate(dueDate.getDate() + daysAfter);
                                }
                                
                                return dueDate.toISOString().split('T')[0];
                              };
                              
                              const dueDateStr = calculateDueDate();
                              
                              if (!dueDateStr) {
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
                          {!readOnly && (
                          <td className="px-4 py-3 text-right whitespace-nowrap" style={{ padding: "12px 16px" }}>
                            <Group gap="xs" justify="flex-end">
                              <Tooltip label="Delegate this task" position="top" withArrow>
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  onClick={() => handleOpenDelegation(item)}
                                  style={{
                                    color: 'var(--color-gray-600)'
                                  }}
                                >
                                  <IconArrowsRightLeft size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Add comment" position="top" withArrow>
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  onClick={() => handleOpenComments(item)}
                                  style={{
                                    color: 'var(--color-gray-600)'
                                  }}
                                >
                                  <IconMessageCircle size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </td>
                          )}
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

          {selectedItemForComments && (
            <CommentsModal
              opened={commentsModalOpen}
              onClose={handleCloseComments}
              epicId={selectedItemForComments.launch.id}
              taskId={selectedItemForComments.id}
              taskLabel={selectedItemForComments.criterion.label}
              currentUserEmail={currentUserEmail}
              initialTab={commentsModalInitialTab}
            />
          )}
        </div>
      </div>
    </div>
  );
}
