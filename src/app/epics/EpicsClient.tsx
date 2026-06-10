"use client";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { Epic } from "@/types/epics";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMediaQuery } from "@mantine/hooks";
import { TextInput, Select, Group, Box, ActionIcon, Title, Text, Alert, Modal, Button, Tooltip, HoverCard, Stack, ScrollArea, Anchor, Collapse, SegmentedControl } from '@mantine/core';
import { IconSearch, IconX, IconAlertCircle, IconAlertTriangle, IconArchive, IconInfoCircle, IconRefresh, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { canRolesPerform } from '@/lib/permissions';
import { notifications } from '@mantine/notifications';
import { PurpleLoader } from '@/components/PurpleLoader';
import { createClient } from '@/lib/supabase/client';
import { UserDisplay } from '@/components/UserDisplay';
import { addCalendarDays, addCalendarMonth, dateToLocalDateString, diffCalendarDaysBetweenYmd, formatDateOnlyForDisplay, getCohort2DateForTimeline, parseDateOnlyLocal, subtractCalendarDays } from '@/lib/date-utils';
import { fetchStreamJSON } from '@/lib/fetch-stream';
import { ReleaseStagesChart } from '@/components/admin/ReleaseStagesChart';
import { isUiFrameworkEpic, parseUiLevelFromEpic } from '@/lib/epic-ui-framework';
import { getEpicGtmAccessDateYmd, getEpicInternalOrgsDateYmd, getReleaseDefaultGtmAccessDateYmd, getReleaseDefaultInternalReadinessDateYmd } from '@/lib/epic-rollout-dates';
import { GtmAccessDateCell } from '@/components/GtmAccessDateCell';
import { InternalReadinessDateCell } from '@/components/InternalReadinessDateCell';
import {
    mergeReleaseScheduleApiResponse,
    mergeReleaseScheduleRows,
    toReleaseScheduleSummary,
    type ReleaseScheduleRow,
} from '@/lib/release-schedule-merge';
import { Cohort1DateBadge } from '@/components/Cohort1DateBadge';
import { EpicGaDateBadge } from '@/components/EpicGaDateBadge';
import { addCalendarDaysToYmd } from '@/lib/date-utils';

interface EpicsClientProps {
    initialEpics?: Epic[];
    initialReleaseSchedule?: ReleaseScheduleRow[];
    initialReleaseScheduleStages?: DbReleaseStageRow[];
    initialUiRolloutStages?: DbReleaseStageRow[];
}

type DbReleaseStageRow = {
    id: number;
    name: string;
    sort_order: number;
    duration_days: number | null;
    details?: string | null;
    scope?: string;
    level_durations?: Record<string, { min_days: number; max_days: number }> | null;
    is_gate?: boolean;
    stage_type?: 'phase' | 'milestone';
};

/** GA Cohort 2 date for the UI rollout timeline. Delegates to the shared utility in lib/date-utils. */
const getCohort2DateForUiTimeline = getCohort2DateForTimeline;

const COHORT_DATE_TOOLTIP = "Date that the feature has automatically been turned on or can manually be turned on (i.e. needs to be purchased or needs to opt in). All enablement materials have been created before this date. Communications have been sent or will be sent to customers and reference this date as the date the customer will have the feature available to them.";
function CohortDateHeaderIcon() {
    return (
        <HoverCard width={300} shadow="md" withArrow openDelay={100} closeDelay={200}>
            <HoverCard.Target>
                <IconInfoCircle size={14} style={{ cursor: 'help', color: 'var(--table-header-text-platinum, var(--color-platinum, #E8E6E3))', opacity: 0.85 }} />
            </HoverCard.Target>
            <HoverCard.Dropdown style={{ fontSize: 13, lineHeight: 1.5 }}>
                {COHORT_DATE_TOOLTIP}
            </HoverCard.Dropdown>
        </HoverCard>
    );
}
function GtmOrgsHeaderIcon() {
    return (
        <HoverCard width={300} shadow="md" withArrow openDelay={100} closeDelay={200}>
            <HoverCard.Target>
                <IconInfoCircle size={14} style={{ cursor: 'help', color: 'var(--table-header-text-platinum, var(--color-platinum, #E8E6E3))', opacity: 0.85 }} />
            </HoverCard.Target>
            <HoverCard.Dropdown style={{ fontSize: 13, lineHeight: 1.5 }}>
                The date GTM orgs are enabled in the platform so users can access the functionality to perform launch tasks.{' '}
                <a
                    href="https://docs.google.com/spreadsheets/d/17Qka5O9fcZcRfCZ42k0MHLScMRu4BKvH2Zp00efI2oQ/edit?gid=0#gid=0"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#2196F3', textDecoration: 'underline' }}
                    onClick={e => e.stopPropagation()}
                >
                    You can see a list of the GTM orgs here.
                </a>
                {' '}If you see a date but no checkmark, a PM has not yet confirmed it is turned on.
            </HoverCard.Dropdown>
        </HoverCard>
    );
}
function InternalOrgsHeaderIcon() {
    return (
        <HoverCard width={300} shadow="md" withArrow openDelay={100} closeDelay={200}>
            <HoverCard.Target>
                <IconInfoCircle size={14} style={{ cursor: 'help', color: 'var(--table-header-text-platinum, var(--color-platinum, #E8E6E3))', opacity: 0.85 }} />
            </HoverCard.Target>
            <HoverCard.Dropdown style={{ fontSize: 13, lineHeight: 1.5 }}>
                The date all internal orgs (not just GTM orgs) are enabled in the platform to access this feature.
                If you see a date but no checkmark, a PM has not yet confirmed it is turned on.
            </HoverCard.Dropdown>
        </HoverCard>
    );
}

function GtmOrgsColumnHeader({ defaultTargetYmd }: { defaultTargetYmd?: string | null }) {
    const targetLabel = defaultTargetYmd
        ? formatDateOnlyForDisplay(defaultTargetYmd, { month: 'short', day: 'numeric' })
        : null;

    return (
        <div style={{ textTransform: 'none', letterSpacing: 'normal' }}>
            <div className="flex items-center gap-1" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                GTM Orgs
                <GtmOrgsHeaderIcon />
            </div>
            {targetLabel && (
                <Tooltip
                    label="Planned date GTM orgs are enabled, from the release timeline"
                    withArrow
                    multiline
                    w={240}
                >
                    <div
                        style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--table-header-text-platinum, var(--color-platinum, #E8E6E3))',
                            marginTop: '4px',
                            lineHeight: 1.35,
                            cursor: 'help',
                        }}
                    >
                        {targetLabel}
                    </div>
                </Tooltip>
            )}
        </div>
    );
}

function InternalReadinessColumnHeader({ defaultTargetYmd }: { defaultTargetYmd?: string | null }) {
    const targetLabel = defaultTargetYmd
        ? formatDateOnlyForDisplay(defaultTargetYmd, { month: 'short', day: 'numeric' })
        : null;

    return (
        <div style={{ textTransform: 'none', letterSpacing: 'normal' }}>
            <div className="flex items-center gap-1" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Internal Orgs
                <InternalOrgsHeaderIcon />
            </div>
            {targetLabel && (
                <Tooltip
                    label="Planned date all internal orgs are enabled, from the release timeline"
                    withArrow
                    multiline
                    w={240}
                >
                    <div
                        style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--table-header-text-platinum, var(--color-platinum, #E8E6E3))',
                            marginTop: '4px',
                            lineHeight: 1.35,
                            cursor: 'help',
                        }}
                    >
                        {targetLabel}
                    </div>
                </Tooltip>
            )}
        </div>
    );
}

/** Returns days until Cohort 1 Live (the release anchor date). */
function getDaysUntilCohort1(releaseDate: string): number | null {
    const anchorDate = parseDateOnlyLocal(releaseDate);
    if (!anchorDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    anchorDate.setHours(0, 0, 0, 0);
    const days = Math.round((anchorDate.getTime() - today.getTime()) / 86400000);
    return days > 0 ? days : null;
}

function EpicsClient({
    initialEpics = [],
    initialReleaseSchedule = [],
    initialReleaseScheduleStages = [],
    initialUiRolloutStages = [],
}: EpicsClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    /** Stable for effect deps — `searchParams` object identity can change every render in App Router. */
    const epicsSearchQueryString = searchParams.toString();
    const [epics, setEpics] = useState<Epic[]>(initialEpics);
    const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
    const [products, setProducts] = useState<any[]>([]);
    const [releaseSchedule, setReleaseSchedule] = useState<Array<{ release_name: string; launch_date: string | null; archived?: boolean; aha_epic_count?: number | null }>>(
        () => initialReleaseSchedule.map(({ release_name, launch_date, archived, aha_epic_count }) => ({
            release_name,
            launch_date,
            archived,
            aha_epic_count,
        }))
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);
    const [archivingEpicId, setArchivingEpicId] = useState<string | null>(null);
    const [archiveModalOpen, setArchiveModalOpen] = useState(false);
    const [epicToArchive, setEpicToArchive] = useState<{ id: string; name: string } | null>(null);
    const [syncingReleaseName, setSyncingReleaseName] = useState<string | null>(null);
    const [fetchingReleaseDates, setFetchingReleaseDates] = useState<Set<string>>(new Set());
    const fetchedReleaseDatesRef = useRef<Set<string>>(new Set());
    const releaseDatesFetchGenRef = useRef(0);
    const releaseDatesInFlightRef = useRef(false);
    const [ahaEpicCounts, setAhaEpicCounts] = useState<Map<string, number | null>>(new Map());
    const fetchingAhaCountsRef = useRef<Set<string>>(new Set());
    const [archivingReleaseName, setArchivingReleaseName] = useState<string | null>(null);
    const [celebrationModalOpen, setCelebrationModalOpen] = useState(false);
    const [releaseToCelebrate, setReleaseToCelebrate] = useState<{ releaseName: string; releaseId: number | null } | null>(null);
    const [releaseScheduleWithIds, setReleaseScheduleWithIds] = useState<ReleaseScheduleRow[]>(
        () =>
            initialReleaseSchedule.map((r) => ({
                id: r.id ?? 0,
                release_name: r.release_name,
                launch_date: r.launch_date,
                cohort2_date: r.cohort2_date ?? null,
                archived: r.archived ?? false,
                aha_epic_count: r.aha_epic_count ?? null,
            }))
    );
    // Only show skeleton if we don't have initial data - if we have epics, we can show them immediately
    const [isDeterminingOrder, setIsDeterminingOrder] = useState(initialEpics.length === 0);
    const [podOrder, setPodOrder] = useState<string[]>([]);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [ownerInfoMap, setOwnerInfoMap] = useState<Record<string, { first_name?: string; last_name?: string; avatar_url?: string }>>({});

    // Filter state
    const [filters, setFilters] = useState({
        search: "",
        module: "ALL",
        tier: "ALL",
        status: "ALL",
        risk: "ALL"
    });
    const isMobile = useMediaQuery("(max-width: 768px)");
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const [selectedRelease, setSelectedRelease] = useState<string | null>(searchParams.get('release') || null);
    const [releasesView, setReleasesView] = useState<'upcoming' | 'recent' | 'all'>('upcoming');
    const [showTimelineForRelease, setShowTimelineForRelease] = useState<string | null>(null);
    /** Configured stages from DB — same scopes as epic readiness tab (`release_schedule` vs `ui_rollout`). */
    const [releaseScheduleStagesForTimeline, setReleaseScheduleStagesForTimeline] = useState<DbReleaseStageRow[]>(
        () => initialReleaseScheduleStages,
    );
    const [uiRolloutStagesForTimeline, setUiRolloutStagesForTimeline] = useState<DbReleaseStageRow[]>(
        () => initialUiRolloutStages,
    );

    // Sync with Aha state
    const [refreshingEpics, setRefreshingEpics] = useState(false);

    useEffect(() => {
        // Load current user email and roles
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user?.email) {
                setCurrentUserEmail(user.email);
            }
        });

        // Only load additional data if we don't have initial epics
        if (initialEpics.length === 0) {
            loadData();
        } else {
            // Stagger requests to avoid rate limiting
            (async () => {
                try {
                    const { fetchWithRateLimit, batchFetchWithRateLimit } = await import('@/lib/fetch-with-rate-limit');
                    
                    // Priority 1: Auth check
                    const meRes = await fetchWithRateLimit("/api/me", { maxRetries: 1 });
                    if (meRes.ok) {
                        const data = await meRes.json();
                        if (data.user?.roles && Array.isArray(data.user.roles)) {
                            setCurrentUserRoles(data.user.roles);
                        }
                    }

                    // Priority 2: Batch fetch supporting data with delays
                    const supportingUrls = [
                        "/api/settings",
                        "/api/products",
                        ...(initialReleaseSchedule.length === 0 ? ["/api/releases"] : []),
                    ];

                    const supportingResults = await batchFetchWithRateLimit(supportingUrls, {
                        batchSize: 2,
                        batchDelay: 150,
                        maxRetries: 1
                    });

                    // Handle products
                    const productsResult = supportingResults.find(r => r.url === '/api/products');
                    if (productsResult?.response?.ok) {
                        const data = await productsResult.response.json();
                        setProducts(data);
                    }

                    // Refetch releases only when SSR did not provide schedule (avoids overwriting good dates)
                    const releasesResult = supportingResults.find(r => r.url === '/api/releases');
                    if (releasesResult?.response?.ok) {
                        const data = (await releasesResult.response.json()) as ReleaseScheduleRow[];
                        setReleaseScheduleWithIds((prev) => {
                            const merged = mergeReleaseScheduleApiResponse(prev, data || []);
                            setReleaseSchedule(toReleaseScheduleSummary(merged));
                            return merged;
                        });
                    }
                } catch (err) {
                    console.error("Failed to load initial data:", err);
                }
            })();
        }
    }, [initialEpics.length]);

    useEffect(() => {
        if (initialReleaseScheduleStages.length > 0) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch('/api/release-stages', { credentials: 'include' });
                if (!res.ok || cancelled) return;
                const json = await res.json();
                const rows = (json?.stages ?? []) as DbReleaseStageRow[];
                if (cancelled || !Array.isArray(rows)) return;

                const hasScope = rows.some((r) => r.scope != null && String(r.scope).trim() !== '');
                const scheduleRows = hasScope
                    ? rows.filter((r) => r.scope === 'release_schedule')
                    : rows;
                const uiRows = hasScope ? rows.filter((r) => r.scope === 'ui_rollout') : [];

                if (scheduleRows.length > 0) {
                    setReleaseScheduleStagesForTimeline(
                        [...scheduleRows].sort((a, b) => a.sort_order - b.sort_order),
                    );
                }
                if (uiRows.length > 0) {
                    setUiRolloutStagesForTimeline(
                        [...uiRows].sort((a, b) => a.sort_order - b.sort_order),
                    );
                }
            } catch (e) {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('[EpicsClient] release_stages fetch failed:', e);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [initialReleaseScheduleStages.length]);

    async function loadData() {
        try {
            setLoading(true);

            // Import fetchWithRateLimit
            const { fetchWithRateLimit, batchFetchWithRateLimit } = await import('@/lib/fetch-with-rate-limit');

            // Priority 1: Auth check (critical, must complete first)
            const me = await fetchWithRateLimit('/api/me', { maxRetries: 1 });
            if (me.status === 401) {
                router.push('/');
                return;
            }

            // Priority 2: Main data (epics) - most important
            const epicsRes = await fetchWithRateLimit('/api/epics', { maxRetries: 1 });
            if (epicsRes.status === 401) {
                router.push('/');
                return;
            }
            if (!epicsRes.ok) throw new Error("Failed to fetch epics");
            const epicsData = await epicsRes.json();
            setEpics(epicsData);

            // Priority 3: Supporting data (batch fetch with small delay)
            // Use batchFetchWithRateLimit to process in smaller batches
            const supportingUrls = [
                "/api/products",
                "/api/releases",
                "/api/settings"
            ];

            const supportingResults = await batchFetchWithRateLimit(supportingUrls, {
                batchSize: 2,
                batchDelay: 150,
                maxRetries: 1
            });

            // Process results
            const productsResult = supportingResults.find(r => r.url === '/api/products');
            if (productsResult?.response?.ok) {
                const productsData = await productsResult.response.json();
                setProducts(productsData);
            }

            const releasesResult = supportingResults.find(r => r.url === '/api/releases');
            if (releasesResult?.response?.ok) {
                const releasesData = await releasesResult.response.json();
                if (process.env.NODE_ENV === 'development' && releasesData && releasesData.length > 0) {
                    console.log('[Releases] Sample release data:', {
                        release_name: releasesData[0].release_name,
                        has_aha_epic_count: 'aha_epic_count' in releasesData[0],
                        aha_epic_count: releasesData[0].aha_epic_count
                    });
                }
                const rows = (releasesData || []) as ReleaseScheduleRow[];
                setReleaseScheduleWithIds((prev) => {
                    const merged = mergeReleaseScheduleApiResponse(prev, rows);
                    setReleaseSchedule(toReleaseScheduleSummary(merged));
                    return merged;
                });
            }

            // Load pod order from settings
            const settingsResult = supportingResults.find(r => r.url === '/api/settings');
            if (settingsResult?.response?.ok) {
                const settingsData = await settingsResult.response.json();
                setPodOrder(settingsData.pod_order || []);
                setSettingsLoaded(true);
            } else {
                // If settings failed to load, still mark as loaded to avoid infinite skeleton
                setSettingsLoaded(true);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }


    const canArchiveEpic = canRolesPerform(currentUserRoles, 'launch.delete');
    const canEditAccessDates = canRolesPerform(currentUserRoles, 'launch.accessDates.update');

    const handleGtmAccessUpdate = async (
        epicId: string,
        patch: {
            actual_gtm_access_date?: string | null;
            gtm_access_confirmed?: boolean;
            gtm_access_na?: boolean;
        }
    ) => {
        const prev = epics.find((e) => e.id === epicId);
        if (!prev) return;

        setEpics((list) =>
            list.map((e) => (e.id === epicId ? { ...e, ...patch } : e))
        );

        try {
            const res = await fetch(`/api/epics/${epicId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(patch),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to update GTM access');
            }
            const updated = await res.json();
            setEpics((list) => list.map((e) => (e.id === epicId ? { ...e, ...updated } : e)));
        } catch (error: unknown) {
            setEpics((list) => list.map((e) => (e.id === epicId ? prev : e)));
            notifications.show({
                title: 'Update failed',
                message: error instanceof Error ? error.message : 'Could not save GTM access',
                color: 'red',
            });
        }
    };

    const handleInternalReadinessUpdate = async (
        epicId: string,
        patch: {
            actual_internal_readiness_date?: string | null;
            internal_readiness_confirmed?: boolean;
            internal_readiness_na?: boolean;
        }
    ) => {
        const prev = epics.find((e) => e.id === epicId);
        if (!prev) return;

        setEpics((list) =>
            list.map((e) => (e.id === epicId ? { ...e, ...patch } : e))
        );

        try {
            const res = await fetch(`/api/epics/${epicId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(patch),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to update Internal Readiness');
            }
            const updated = await res.json();
            setEpics((list) => list.map((e) => (e.id === epicId ? { ...e, ...updated } : e)));
        } catch (error: unknown) {
            setEpics((list) => list.map((e) => (e.id === epicId ? prev : e)));
            notifications.show({
                title: 'Update failed',
                message: error instanceof Error ? error.message : 'Could not save Internal Readiness',
                color: 'red',
            });
        }
    };

    const handleArchiveClick = (epicId: string, epicName: string) => {
        setEpicToArchive({ id: epicId, name: epicName });
        setArchiveModalOpen(true);
    };

    const handleArchiveConfirm = async () => {
        if (!epicToArchive) return;

        setArchivingEpicId(epicToArchive.id);
        setArchiveModalOpen(false);

        try {
            const res = await fetch(`/api/epics/${epicToArchive.id}/archive`, {
                method: 'POST',
                credentials: 'include',
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to archive epic');
            }

            setEpics(epics.filter(e => e.id !== epicToArchive.id));

            notifications.show({
                title: 'Epic archived',
                message: `"${epicToArchive.name}" has been archived and removed from the list.`,
                color: 'green',
            });
        } catch (error: any) {
            notifications.show({
                title: 'Archive failed',
                message: error.message || 'Failed to archive epic',
                color: 'red',
            });
        } finally {
            setArchivingEpicId(null);
            setEpicToArchive(null);
        }
    };

    const handleDeleteEpic = async () => {
        if (!epicToArchive) return;

        setArchivingEpicId(epicToArchive.id);

        try {
            const res = await fetch(`/api/epics/${epicToArchive.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to delete epic');
            }

            setArchiveModalOpen(false);
            setEpics(epics.filter(e => e.id !== epicToArchive.id));
            setEpicToArchive(null);

            notifications.show({
                title: 'Epic deleted',
                message: `"${epicToArchive.name}" has been permanently deleted and removed from the list.`,
                color: 'green',
            });
        } catch (error: any) {
            notifications.show({
                title: 'Delete failed',
                message: error.message || 'Failed to delete epic',
                color: 'red',
            });
        } finally {
            setArchivingEpicId(null);
        }
    };

    const getModuleFromEpic = (epic: Epic): string | null => {
        if (!epic.aha_fields || typeof epic.aha_fields !== 'object') return null;
        const fields = epic.aha_fields as any;
        if (fields.custom_fields && typeof fields.custom_fields === 'object') {
            const cf = fields.custom_fields;
            const moduleVal = cf.gtm_module ?? cf.module;
            if (moduleVal && typeof moduleVal === 'string' && moduleVal.trim()) {
                return moduleVal.trim();
            }
        }
        return null;
    };

    const getGroupRolloutDateOptions = (group: { releaseDate: string | null; epics: Epic[] }) => {
        const uiEpics = group.epics.filter(isUiFrameworkEpic);
        const hasStandardEpics = group.epics.some((e) => !isUiFrameworkEpic(e));
        const uiLevels = uiEpics.map(parseUiLevelFromEpic).filter((x): x is number => x != null);
        // Column header defaults follow the standard release train unless every epic is UI Framework.
        return {
            useUiRollout: uiEpics.length > 0 && !hasStandardEpics,
            uiRolloutStages: uiRolloutStagesForTimeline,
            uiLevel: uiLevels[0] ?? 1,
        };
    };

    const getGroupGtmPlannedTargetYmd = (group: { releaseDate: string | null; epics: Epic[] }) => {
        return getReleaseDefaultGtmAccessDateYmd(
            group.releaseDate,
            releaseScheduleStagesForTimeline,
            getGroupRolloutDateOptions(group),
        );
    };

    const getGroupInternalReadinessPlannedTargetYmd = (group: { releaseDate: string | null; epics: Epic[] }) => {
        return getReleaseDefaultInternalReadinessDateYmd(
            group.releaseDate,
            releaseScheduleStagesForTimeline,
            getGroupRolloutDateOptions(group),
        );
    };

    const epicNeedsGtmConfirmation = (epic: Epic, releaseDateYmd?: string | null): boolean => {
        if (epic.gtm_access_confirmed === true || epic.gtm_access_na === true) return false;
        const plannedYmd = getEpicGtmAccessDateYmd(
            epic,
            releaseScheduleStagesForTimeline,
            uiRolloutStagesForTimeline,
            { releaseTrainDateYmd: releaseDateYmd ?? undefined },
        );
        if (!plannedYmd) return false;
        const todayYmd = dateToLocalDateString(new Date());
        const daysUntil = diffCalendarDaysBetweenYmd(plannedYmd, todayYmd);
        return daysUntil != null && daysUntil <= 0;
    };

    const epicNeedsInternalReadinessConfirmation = (epic: Epic, releaseDateYmd?: string | null): boolean => {
        if (epic.internal_readiness_confirmed === true || epic.internal_readiness_na === true) return false;
        const plannedYmd = getEpicInternalOrgsDateYmd(
            epic,
            releaseScheduleStagesForTimeline,
            uiRolloutStagesForTimeline,
            { releaseTrainDateYmd: releaseDateYmd ?? undefined },
        );
        if (!plannedYmd) return false;
        const todayYmd = dateToLocalDateString(new Date());
        const daysUntil = diffCalendarDaysBetweenYmd(plannedYmd, todayYmd);
        return daysUntil != null && daysUntil <= 0;
    };

    const filteredEpics = epics.filter(l => {
        // Exclude archived epics
        // #region agent log
        if (l.aha_id && (l.archived === true || l.archived === undefined || l.archived === null)) {
            // Filter archived epics
        }
        // #endregion
        if (l.archived === true) return false;
        
        if (filters.search && !l.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.module !== "ALL") {
            const m = getModuleFromEpic(l);
            if (m !== filters.module) return false;
        }
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

    const moduleOptions = useMemo(() => {
        const set = new Set<string>();
        epics.forEach(e => {
            const m = getModuleFromEpic(e);
            if (m) set.add(m);
        });
        const list = Array.from(set);
        if (podOrder.length > 0) {
            const normalizedOrder = podOrder.map(p => p?.trim().toLowerCase() || '');
            list.sort((a, b) => {
                const i = normalizedOrder.indexOf(a.toLowerCase());
                const j = normalizedOrder.indexOf(b.toLowerCase());
                if (i !== -1 && j !== -1) return i - j;
                if (i !== -1) return -1;
                if (j !== -1) return 1;
                return a.localeCompare(b);
            });
        } else {
            list.sort((a, b) => a.localeCompare(b));
        }
        return [{ value: "ALL", label: "All Modules" }, ...list.map(m => ({ value: m, label: m }))];
    }, [epics, podOrder]);

    // Create a map of release names to dates from release schedule (full rows, not summary state)
    const releaseDateMap = useMemo(() => {
        const map = new Map<string, string | null>();
        releaseScheduleWithIds.forEach((release) => {
            if (release.release_name) {
                map.set(release.release_name, release.launch_date);
            }
        });
        return map;
    }, [releaseScheduleWithIds]);

    // Group epics by release and sort by pod order
    const releaseGroups: Array<{ releaseName: string; releaseDate: string | null; epics: Epic[] }> = useMemo(() => {
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

        // Convert to array and sort epics within each release by module order
        const groups = Array.from(releaseGroupsMap.entries()).map(([releaseName, epics]) => {
            // Sort epics within each release group by module order
            const sortedEpics = [...epics].sort((a, b) => {
                // Sort by module order
                const moduleA = getModuleFromEpic(a);
                const moduleB = getModuleFromEpic(b);

                if (!moduleA && !moduleB) return 0;
                if (!moduleA) return 1;
                if (!moduleB) return -1;

                if (podOrder.length > 0) {
                    const normalizedOrder = podOrder.map(p => p?.trim().toLowerCase() || '');
                    const normA = moduleA.toLowerCase();
                    const normB = moduleB.toLowerCase();
                    const indexA = normalizedOrder.indexOf(normA);
                    const indexB = normalizedOrder.indexOf(normB);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                }

                return moduleA.localeCompare(moduleB);
            });
            
            return {
                releaseName,
                releaseDate: releaseDateMap.get(releaseName) || null,
                epics: sortedEpics
            };
        });

        // Sort release groups by date (ascending), with null dates at the end
        groups.sort((a, b) => {
            if (!a.releaseDate && !b.releaseDate) return 0;
            if (!a.releaseDate) return 1;
            if (!b.releaseDate) return -1;
            return a.releaseDate.localeCompare(b.releaseDate);
        });

        // Add ungrouped epics as a separate group at the end (also sorted by module order)
        if (ungroupedEpics.length > 0) {
            const sortedUngrouped = [...ungroupedEpics].sort((a, b) => {
                const moduleA = getModuleFromEpic(a);
                const moduleB = getModuleFromEpic(b);
                if (!moduleA && !moduleB) return 0;
                if (!moduleA) return 1;
                if (!moduleB) return -1;
                if (podOrder.length > 0) {
                    const normalizedOrder = podOrder.map(p => p?.trim().toLowerCase() || '');
                    const normA = moduleA.toLowerCase();
                    const normB = moduleB.toLowerCase();
                    const indexA = normalizedOrder.indexOf(normA);
                    const indexB = normalizedOrder.indexOf(normB);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                }
                return moduleA.localeCompare(moduleB);
            });

            groups.push({
                releaseName: "Ungrouped",
                releaseDate: null,
                epics: sortedUngrouped
            });
        }

        return groups;
    }, [filteredEpics, releaseDateMap, podOrder]);

    // Only show release groups whose release is in the schedule and not archived (GET /api/releases excludes archived)
    const displayedReleaseGroups = useMemo(() => {
        return releaseGroups.filter(g =>
            g.releaseName === "Ungrouped" || releaseScheduleWithIds.some(r => r.release_name === g.releaseName)
        );
    }, [releaseGroups, releaseScheduleWithIds]);

    const todayString = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, []);

    const releaseGroupsForView = useMemo(() => {
        const past = displayedReleaseGroups.filter(
            g => g.releaseDate && g.releaseDate < todayString
        );
        // Upcoming: future trains plus the active cohort (recent past launch still in Cohort 1 window)
        const upcoming = displayedReleaseGroups.filter((g) => {
            if (!g.releaseDate) return true;
            if (g.releaseDate >= todayString) return true;
            const cohort1End = addCalendarDaysToYmd(g.releaseDate, 28);
            return cohort1End != null && todayString <= cohort1End;
        });
        const recentFour = past.slice(-4);
        if (releasesView === 'upcoming') return upcoming;
        if (releasesView === 'recent') return recentFour;
        // All: chronological order (past then upcoming). Do not reverse past — that broke the
        // timeline (e.g. Mar, Feb, Jan then Apr, May).
        return [...recentFour, ...upcoming];
    }, [displayedReleaseGroups, todayString, releasesView]);

    useEffect(() => {
        if (selectedRelease && !releaseGroupsForView.some(g => g.releaseName === selectedRelease)) {
            setSelectedRelease(null);
            const params = new URLSearchParams(epicsSearchQueryString);
            params.delete('release');
            router.replace(`/epics${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
        }
    }, [releaseGroupsForView, selectedRelease, epicsSearchQueryString, router]);

    // Fetch owner (PM) info from app_user for avatar and display name
    useEffect(() => {
        const emails = new Set<string>();
        epics.forEach(epic => {
            const e = epic.owner?.email || epic.owner_email;
            if (e && typeof e === 'string' && e.includes('@')) emails.add(e.trim().toLowerCase());
        });
        if (emails.size === 0) {
            setOwnerInfoMap({});
            return;
        }
        const list = Array.from(emails);
        (async () => {
            const all: Record<string, { first_name?: string; last_name?: string; avatar_url?: string }> = {};
            for (let i = 0; i < list.length; i += 100) {
                const chunk = list.slice(i, i + 100);
                const res = await fetch(`/api/users/by-email?emails=${encodeURIComponent(chunk.join(','))}`);
                if (res.ok) {
                    const data = await res.json();
                    Object.assign(all, data);
                }
            }
            setOwnerInfoMap(all);
        })();
    }, [epics]);

    // Automatically fetch release dates from API when needed (only if not in database)
    useEffect(() => {
        let cancelled = false;
        const fetchGen = ++releaseDatesFetchGenRef.current;

        const fetchMissingReleaseDates = async () => {
            // If we don't have epics yet, keep determining order
            if (epics.length === 0) {
                setIsDeterminingOrder(true);
                return;
            }
            
            // If we have epics but no release schedule, we can still show epics
            // Order determination is just for sorting, not for display
            if (releaseScheduleWithIds.length === 0) {
                setIsDeterminingOrder(false);
                return;
            }
            
            // First, check the database to see which releases already have dates
            const releasesInDb = new Set<string>();
            const releasesWithCohort2 = new Set<string>();
            releaseScheduleWithIds.forEach((release) => {
                if (release.release_name && release.launch_date) {
                    releasesInDb.add(release.release_name);
                }
                if (release.release_name && release.cohort2_date) {
                    releasesWithCohort2.add(release.release_name);
                }
            });

            // Only fetch dates for releases that:
            // 1. Are not "Ungrouped"
            // 2. Don't have a date in the current releaseDateMap (from releaseSchedule)
            // 3. Are not already in the database
            // 4. Haven't been fetched in this session
            const releasesNeedingDates = displayedReleaseGroups
                .filter(group =>
                    group.releaseName !== "Ungrouped" &&
                    !group.releaseDate &&
                    !releasesInDb.has(group.releaseName) &&
                    !fetchedReleaseDatesRef.current.has(group.releaseName)
                )
                .map(group => group.releaseName);

            // Also fetch cohort2_date for releases that have a launch_date but no cohort2_date yet
            const releasesMissingCohort2 = displayedReleaseGroups
                .filter(group =>
                    group.releaseName !== "Ungrouped" &&
                    group.releaseDate &&
                    releasesInDb.has(group.releaseName) &&
                    !releasesWithCohort2.has(group.releaseName) &&
                    !fetchedReleaseDatesRef.current.has(`cohort2:${group.releaseName}`)
                )
                .map(group => group.releaseName);

            if (releasesNeedingDates.length === 0 && releasesMissingCohort2.length === 0) {
                setIsDeterminingOrder(false);
                return;
            }

            if (releaseDatesInFlightRef.current) {
                return;
            }

            // Only block the page for missing launch dates (sorting/cards). Cohort 2 backfill updates in place.
            if (releasesNeedingDates.length > 0) {
                setIsDeterminingOrder(true);
            }

            setFetchingReleaseDates(new Set([...releasesNeedingDates, ...releasesMissingCohort2]));

            releaseDatesInFlightRef.current = true;
            try {
                const { fetchWithRateLimit } = await import('@/lib/fetch-with-rate-limit');
                const res = await fetchWithRateLimit('/api/epics/release-dates', {
                    credentials: 'include',
                    maxRetries: 2,
                });
                if (cancelled || fetchGen !== releaseDatesFetchGenRef.current) return;

                if (res.ok) {
                    const data = await res.json();
                    const releaseDates = data.releases || [];
                    
                    // Find dates for missing releases
                    const datesToSave: Array<{ release_name: string; launch_date: string; cohort2_date?: string | null }> = [];

                    /** Find a release in releaseDates by name (exact, then case-insensitive) */
                    const findRelease = (releaseName: string) => {
                        return releaseDates.find((r: any) => r.releaseName === releaseName)
                            ?? releaseDates.find((r: any) => r.releaseName?.toLowerCase() === releaseName.toLowerCase());
                    };

                    releasesNeedingDates.forEach(releaseName => {
                        const found = findRelease(releaseName);
                        if (found && found.launchDate) {
                            console.log(`[EpicsClient] Found date for "${releaseName}": ${found.launchDate} (matched with "${found.releaseName}") - saving to database`);
                            datesToSave.push({
                                release_name: releaseName,
                                launch_date: found.launchDate,
                                cohort2_date: found.cohort2Date ?? null,
                            });
                        } else {
                            fetchedReleaseDatesRef.current.add(releaseName);
                            console.warn(`[EpicsClient] No date found for release: "${releaseName}"`);
                            console.log(`[EpicsClient] Available releases in API response:`, releaseDates.map((r: any) => r.releaseName));
                        }
                    });

                    // Also persist cohort2_date for releases that already have a launch_date
                    releasesMissingCohort2.forEach(releaseName => {
                        const found = findRelease(releaseName);
                        if (found?.cohort2Date) {
                            console.log(`[EpicsClient] Found cohort2_date for "${releaseName}": ${found.cohort2Date} - saving to database`);
                            // Only update cohort2_date; use the existing launch_date from releaseSchedule
                            const existing = releaseScheduleWithIds.find((r) => r.release_name === releaseName);
                            if (existing?.launch_date) {
                                datesToSave.push({
                                    release_name: releaseName,
                                    launch_date: existing.launch_date,
                                    cohort2_date: found.cohort2Date,
                                });
                            }
                        } else {
                            fetchedReleaseDatesRef.current.add(`cohort2:${releaseName}`);
                        }
                    });

                    // Show dates immediately (do not wait for POST + schedule refetch)
                    if (datesToSave.length > 0) {
                        setReleaseScheduleWithIds((prev) => {
                            const merged = mergeReleaseScheduleRows(prev, datesToSave);
                            if (!cancelled && fetchGen === releaseDatesFetchGenRef.current) {
                                setReleaseSchedule(toReleaseScheduleSummary(merged));
                            }
                            return merged;
                        });
                        setIsDeterminingOrder(false);
                    }

                    // Save all found dates
                    if (datesToSave.length > 0) {
                        const saveResults = await Promise.all(
                            datesToSave.map(async ({ release_name, launch_date, cohort2_date }) => {
                                const res = await fetch("/api/releases", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    credentials: 'include',
                                    body: JSON.stringify({
                                        release_name,
                                        launch_date,
                                        ...(cohort2_date ? { cohort2_date } : {}),
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
                            const releasesRes = await fetchWithRateLimit('/api/releases', {
                                credentials: 'include',
                                maxRetries: 1,
                            });
                            if (cancelled || fetchGen !== releaseDatesFetchGenRef.current) return;

                            if (releasesRes.ok) {
                                const releasesData = (await releasesRes.json()) as ReleaseScheduleRow[];
                                console.log("Refreshed release schedule from database:", releasesData);
                                
                                // Verify the saved releases are in the refreshed data (archived releases are excluded from the list)
                                successfulSaves.forEach(({ release_name }) => {
                                    const saved = releasesData.find((r: any) => r.release_name === release_name);
                                    if (saved && saved.launch_date) {
                                        console.log(`✅ Verified: ${release_name} has date ${saved.launch_date} in database - will not fetch from API again`);
                                    } else if (saved && !saved.launch_date) {
                                        console.error(`❌ Verification failed: ${release_name} has no date in refreshed data`);
                                    }
                                    // If not found: release may be archived (GET /api/releases excludes archived by default) - no error
                                });
                                
                                setReleaseScheduleWithIds((prev) => {
                                    const merged = mergeReleaseScheduleApiResponse(prev, releasesData || []);
                                    if (!cancelled && fetchGen === releaseDatesFetchGenRef.current) {
                                        setReleaseSchedule(toReleaseScheduleSummary(merged));
                                    }
                                    return merged;
                                });
                                
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
                } else {
                    console.error('[EpicsClient] release-dates API failed:', res.status, res.statusText);
                    releasesNeedingDates.forEach((name) => fetchedReleaseDatesRef.current.delete(name));
                    releasesMissingCohort2.forEach((name) =>
                        fetchedReleaseDatesRef.current.delete(`cohort2:${name}`)
                    );
                    setIsDeterminingOrder(false);
                }
            } catch (error) {
                console.error("Failed to fetch release dates:", error);
                // Remove from fetched set on error so we can retry
                releasesNeedingDates.forEach(name => fetchedReleaseDatesRef.current.delete(name));
                releasesMissingCohort2.forEach((name) =>
                    fetchedReleaseDatesRef.current.delete(`cohort2:${name}`)
                );
                setIsDeterminingOrder(false);
            } finally {
                releaseDatesInFlightRef.current = false;
                if (!cancelled && fetchGen === releaseDatesFetchGenRef.current) {
                    setFetchingReleaseDates(new Set());
                }
            }
        };

        void fetchMissingReleaseDates();

        return () => {
            cancelled = true;
        };
    }, [releaseScheduleWithIds, epics.length, releaseGroups.length, displayedReleaseGroups.length]);

    // Load AHA epic counts from release_schedule (cached) and fetch missing ones (lazy loaded)
    useEffect(() => {
        // Don't run if we don't have release groups yet
        if (displayedReleaseGroups.length === 0) {
            if (process.env.NODE_ENV === 'development') {
                console.log('[AHA Counts] Skipping - no release groups yet');
            }
            return;
        }

        const loadAhaEpicCounts = async () => {
            console.log('[AHA Counts] Starting loadAhaEpicCounts, releaseGroups:', displayedReleaseGroups.length);
            
            // First, load cached counts from releaseSchedule
            const cachedCounts = new Map<string, number | null>();
            releaseSchedule.forEach(release => {
                if (release.release_name) {
                    const count = (release as any).aha_epic_count;
                    if (count !== undefined && count !== null) {
                        cachedCounts.set(release.release_name, count);
                        console.log(`[AHA Counts] Found cached count for ${release.release_name}: ${count}`);
                    }
                }
            });
            
            // Also check releaseScheduleWithIds
            releaseScheduleWithIds.forEach(release => {
                if (release.release_name) {
                    const count = (release as any).aha_epic_count;
                    if (count !== undefined && count !== null && !cachedCounts.has(release.release_name)) {
                        cachedCounts.set(release.release_name, count);
                        console.log(`[AHA Counts] Found cached count in WithIds for ${release.release_name}: ${count}`);
                    }
                }
            });
            
            // Update state with cached counts
            if (cachedCounts.size > 0) {
                setAhaEpicCounts(prev => {
                    const merged = new Map(prev);
                    cachedCounts.forEach((count, name) => {
                        merged.set(name, count);
                    });
                    return merged;
                });
                console.log(`[AHA Counts] Loaded ${cachedCounts.size} cached counts into state`);
            } else {
                console.log('[AHA Counts] No cached counts found in releaseSchedule data');
            }

            // Find releases that need fetching (not in cache and not already fetching)
            const releasesToFetch = displayedReleaseGroups
                .filter(group => {
                    const shouldFetch = group.releaseName !== "Ungrouped" && 
                        !cachedCounts.has(group.releaseName) &&
                        !ahaEpicCounts.has(group.releaseName) &&
                        !fetchingAhaCountsRef.current.has(group.releaseName);
                    if (process.env.NODE_ENV === 'development' && shouldFetch) {
                        console.log(`[AHA Counts] Will fetch count for: ${group.releaseName}`);
                    }
                    return shouldFetch;
                })
                .map(group => group.releaseName);

            console.log(`[AHA Counts] Releases to fetch: ${releasesToFetch.length}`, releasesToFetch);

            if (releasesToFetch.length === 0) {
                // If we have cached counts, make sure they're in state
                if (cachedCounts.size > 0) {
                    setAhaEpicCounts(prev => {
                        const merged = new Map(prev);
                        cachedCounts.forEach((count, name) => {
                            if (!merged.has(name)) {
                                merged.set(name, count);
                            }
                        });
                        return merged;
                    });
                }
                console.log('[AHA Counts] No releases to fetch');
                return;
            }

            // Mark as fetching
            releasesToFetch.forEach(name => fetchingAhaCountsRef.current.add(name));

            console.log(`[AHA Counts] Fetching counts for ${releasesToFetch.length} releases...`);

            // Batch fetch counts with rate limiting
            const { batchFetchWithRateLimit } = await import('@/lib/fetch-with-rate-limit');
            const epicCountUrls = releasesToFetch.map(releaseName => 
                `/api/releases/epic-count/${encodeURIComponent(releaseName)}`
            );

            const batchResults = await batchFetchWithRateLimit(epicCountUrls, {
                batchSize: 3,
                batchDelay: 300,
                maxRetries: 1,
                credentials: 'include'
            });

            // Process results - read JSON from each response
            const results = await Promise.all(
                batchResults.map(async (result, index) => {
                    const releaseName = releasesToFetch[index];
                    if (result.response?.ok) {
                        try {
                            const data = await result.response.json();
                            console.log(`[AHA Counts] Fetched for ${releaseName}:`, data);
                            return { releaseName, count: data.ahaCount };
                        } catch (error) {
                            console.warn(`[AHA Counts] Failed to parse response for ${releaseName}:`, error);
                            return { releaseName, count: null };
                        }
                    } else {
                        if (result.error) {
                            console.warn(`[AHA Counts] Failed to fetch for ${releaseName}:`, result.error);
                        }
                        return { releaseName, count: null };
                    }
                })
            );
            const newCounts = new Map(ahaEpicCounts);
            results.forEach(({ releaseName, count }) => {
                newCounts.set(releaseName, count);
            });
            setAhaEpicCounts(newCounts);
            console.log(`[AHA Counts] Updated state with ${results.length} results`);

            // Clear fetching state
            releasesToFetch.forEach(name => fetchingAhaCountsRef.current.delete(name));
        };

        // Defer Aha epic counts loading until after initial render (non-critical data)
        const timeoutId = setTimeout(() => {
            loadAhaEpicCounts();
        }, 200); // Defer by 200ms to allow initial render

        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayedReleaseGroups.length, releaseSchedule.length, releaseScheduleWithIds.length, epics.length]);


    // Check for celebration condition: all epics released for 90+ days
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
                
                // Check if all epics are released (Cohort 1, GA, or Retroed)
                const allLaunched = group.epics.every(epic => 
                    ['Released_Cohort_1', 'Released_GA', 'Released_Retroed'].includes(epic.status)
                );
                if (!allLaunched) {
                    checkedReleasesRef.current.add(group.releaseName);
                    continue;
                }
                
                // Check if all epics have been released for 90+ days
                // We'll check updated_at as a proxy for when status was set to released
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
                        setReleaseToCelebrate({ releaseName: group.releaseName, releaseId: release.id ?? null });
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

    // Create a map of release names to cached AHA epic counts from releaseSchedule
    const cachedAhaCounts = new Map<string, number | null>();
    releaseSchedule.forEach(release => {
        if (release.release_name) {
            // Check both releaseSchedule and releaseScheduleWithIds for cached count
            const count = (release as any).aha_epic_count ?? 
                         releaseScheduleWithIds.find(r => r.release_name === release.release_name)?.aha_epic_count;
            if (count !== undefined && count !== null) {
                cachedAhaCounts.set(release.release_name, count);
            }
        }
    });
    
    // Also check releaseScheduleWithIds
    releaseScheduleWithIds.forEach(release => {
        if (release.release_name && (release as any).aha_epic_count !== undefined && (release as any).aha_epic_count !== null && !cachedAhaCounts.has(release.release_name)) {
            cachedAhaCounts.set(release.release_name, (release as any).aha_epic_count);
        }
    });

    // Calculate stats for each release group (using view-filtered list)
    const releaseStats = releaseGroupsForView.map(group => {
        const highRiskCount = group.epics.filter(epic => epic.risk_level === 'HIGH').length;
        // Prefer cached count from releaseSchedule, fallback to ahaEpicCounts state
        const cachedCount = cachedAhaCounts.get(group.releaseName);
        const stateCount = ahaEpicCounts.get(group.releaseName);
        const ahaCount = group.releaseName !== "Ungrouped" 
            ? (cachedCount !== undefined ? cachedCount : stateCount)
            : null;
        return {
            ...group,
            highRiskCount,
            epicsLoaded: group.epics.length,
            ahaEpicCount: ahaCount
        };
    });

    // Filter release groups if a release is selected (within view-filtered list)
    const filteredReleaseGroups = selectedRelease 
        ? releaseGroupsForView.filter(group => group.releaseName === selectedRelease)
        : releaseGroupsForView;

    // Check if we're still loading data (even if we have initial epics, we might be loading release schedule)
    // Show skeleton if:
    // 1. We're actively loading (loading state is true)
    // 2. We're determining order (fetching release dates)
    // 3. We have no epics at all and no initial epics
    // 4. We have epics but displayedReleaseGroups is empty (still loading release schedule to filter groups)
    const stillLoadingData = loading || isDeterminingOrder || 
        (initialEpics.length === 0 && epics.length === 0) ||
        (epics.length > 0 && displayedReleaseGroups.length === 0 && releaseScheduleWithIds.length === 0);

    // Check if user has permission to sync with Aha
    const canSyncWithAha = useMemo(() => {
        if (!currentUserRoles || currentUserRoles.length === 0) return false;
        const allowedRoles = ['SUPERADMIN', 'CPO', 'PRODUCT_OPS', 'PRODUCT'];
        return currentUserRoles.some(role => allowedRoles.includes(role.toUpperCase()));
    }, [currentUserRoles]);

    // Handle refresh existing epics (only those with ClearGO Candidate = Yes in Aha)
    const handleRefreshEpics = async () => {
        if (!confirm('This will refresh epics that have ClearGO Candidate = Yes in Aha! with the latest data. Continue?')) {
            return;
        }
        setRefreshingEpics(true);
        try {
            await fetchStreamJSON('/api/integrations/aha/sync?sync_all=true', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });

            notifications.show({
                title: 'Success',
                message: 'Epics refreshed successfully',
                color: 'green',
            });
            
            // Reload the page to show updated data
            router.refresh();
        } catch (error: any) {
            notifications.show({
                title: 'Error',
                message: error.message || 'Failed to refresh epics',
                color: 'red',
            });
        } finally {
            setRefreshingEpics(false);
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", background: "var(--color-platinum)", fontFamily: "var(--font-body)" }}>
                <div
                    style={{
                        maxWidth: "var(--page-container-max-width)",
                        margin: "0 auto",
                        paddingLeft: "var(--page-container-padding-x)",
                        paddingRight: "var(--page-container-padding-x)",
                        paddingTop: "var(--page-container-padding-top)",
                        paddingBottom: "var(--spacing-8)",
                    }}
                    className="sm:px-6 lg:px-8"
                >
                    <Box mb="sm">
                        <div className="h-9 bg-gray-200 rounded w-32 mb-2 animate-pulse" />
                    </Box>
                    <div className="h-4 bg-gray-200 rounded w-full max-w-xl animate-pulse mb-6" style={{ maxWidth: "36rem" }} />
                    {/* Release Cards Skeleton - hidden on mobile */}
                    <div className="hidden md:block mb-6">
                        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4" style={{ scrollbarWidth: "thin" }}>
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div
                                    key={`skeleton-${index}`}
                                    className="flex-shrink-0 w-64 p-4 rounded-lg border-2 border-gray-200 bg-white animate-pulse"
                                    style={{ fontFamily: 'var(--font-body)' }}
                                >
                                    <div className="space-y-2">
                                        <div className="h-6 bg-gray-300 rounded w-3/4" />
                                        <div className="h-4 bg-gray-300 rounded w-1/2" />
                                        <div className="pt-2 space-y-1 border-t border-gray-200">
                                            <div className="flex justify-between text-sm">
                                                <div className="h-4 bg-gray-300 rounded w-24" />
                                                <div className="h-4 bg-gray-300 rounded w-12" />
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <div className="h-4 bg-gray-300 rounded w-20" />
                                                <div className="h-4 bg-gray-300 rounded w-8" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div
                        className="rounded-lg overflow-hidden"
                        style={{
                            border: "1px solid #E5E7EB",
                            backgroundColor: "#FFFFFF",
                            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
                        }}
                    >
                        <div className="overflow-x-auto">
                            <table className="releases-epics-table w-full table-fixed" style={{ borderCollapse: "collapse", minWidth: "1170px" }}>
                                <thead style={{ backgroundColor: "#FFFFFF", borderBottom: "2px solid #E5E7EB" }}>
                                    <tr>
                                        {["Name", "GTM Orgs", "Internal Orgs", "Cohort 1", "GA", "Status", "Readiness", "Risk"].map((col) => (
                                            <th key={col} className={`${col === "Risk" ? "px-4 py-3 text-right" : "px-4 py-3 text-left"}${["GTM Orgs", "Internal Orgs", "Cohort 1", "GA", "Status", "Readiness"].includes(col) ? " hidden md:table-cell" : ""}${col === "GTM Orgs" || col === "Internal Orgs" ? " py-4" : ""}`} style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>
                                                {["Cohort 1", "GA"].includes(col) ? (
                                                    <div className="flex items-center gap-1">{col}<CohortDateHeaderIcon /></div>
                                                ) : col === "GTM Orgs" ? (
                                                    <div className="flex items-center gap-1">{col}<GtmOrgsHeaderIcon /></div>
                                                ) : col === "Internal Orgs" ? (
                                                    <div className="flex items-center gap-1">{col}<InternalOrgsHeaderIcon /></div>
                                                ) : col === "Risk" ? (
                                                    <div className="hidden md:flex items-center justify-end gap-1">{col}</div>
                                                ) : col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white" style={{ borderTop: "1px solid #E5E7EB" }}>
                                    {Array.from({ length: 6 }).map((_, index) => {
                                        const nameWidths = [220, 180, 260, 200, 240, 210];
                                        const nameW = nameWidths[index % nameWidths.length];
                                        return (
                                        <tr key={index} className="!bg-white" style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}>
                                            <td className="px-4 py-3" style={{ padding: "12px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: `${nameW}px`, marginBottom: "7px" }} />
                                                <div className="flex items-center gap-2">
                                                    <div className="skeleton-shimmer" style={{ height: "18px", width: "52px", borderRadius: "10px" }} />
                                                    <div className="skeleton-shimmer" style={{ height: "14px", width: `${60 + (index * 13) % 50}px` }} />
                                                    <div className="skeleton-shimmer" style={{ height: "14px", width: `${50 + (index * 7) % 40}px` }} />
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "12px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: "56px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "12px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: "56px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "12px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: "60px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "12px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: "60px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-24" style={{ padding: "12px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "22px", width: "64px", borderRadius: "10px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-32" style={{ padding: "12px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "8px", width: "80px", borderRadius: "4px", marginBottom: "5px" }} />
                                                <div className="skeleton-shimmer" style={{ height: "12px", width: "36px" }} />
                                            </td>
                                            <td className="px-4 py-3" style={{ padding: "12px 16px" }}>
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="hidden md:block skeleton-shimmer" style={{ height: "22px", width: "44px", borderRadius: "10px" }} />
                                                    <div className="skeleton-shimmer" style={{ height: "14px", width: "14px" }} />
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-platinum)' }}>
            <div style={{
              maxWidth: 'var(--page-container-max-width)',
              margin: '0 auto',
              paddingLeft: 'var(--page-container-padding-x)',
              paddingRight: 'var(--page-container-padding-x)',
              paddingTop: 'var(--page-container-padding-top)',
              paddingBottom: 'var(--spacing-8, 32px)',
              fontFamily: 'var(--font-body)'
            }}
            className="sm:px-6 lg:px-8"
            >
            <Box mb="sm">
                <Group align="center" gap="md111">
                    <Title style={{ 
                        fontFamily: 'var(--font-marcellus), serif', 
                        color: 'var(--color-gray-900)', 
                        fontSize: 'var(--font-size-page-title)', 
                        fontWeight: 'var(--font-weight-bold)',
                        marginBottom: 'var(--spacing-6)',
                        margin: 0
                    }}>Releases</Title>
                    <SegmentedControl
                        value={releasesView}
                        onChange={(v) => setReleasesView((v as 'upcoming' | 'recent' | 'all') || 'upcoming')}
                        data={[
                            { label: 'Upcoming', value: 'upcoming' },
                            { label: 'Recent', value: 'recent' },
                            { label: 'All', value: 'all' },
                        ]}
                        size="sm"
                        style={{ fontFamily: 'var(--font-body)' }}
                    />
                </Group>
            </Box>

            <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }} mt="sm" mb="md">
                Epics appear below when in Aha!: ClearGO Candidate = Yes or Yes - UI Framework
                {canSyncWithAha && (
                    <>
                        {' — '}
                        <Anchor
                            component="button"
                            type="button"
                            size="sm"
                            c="var(--color-cast-iron)"
                            style={{ fontFamily: 'var(--font-body)' }}
                            onClick={handleRefreshEpics}
                            disabled={refreshingEpics}
                        >
                            {refreshingEpics ? 'Refreshing…' : 'Refresh Epic Data'}
                        </Anchor>
                    </>
                )}
            </Text>

            {error && (
                <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="xl">
                    {error}
                </Alert>
            )}

            {/* Release Cards Skeleton - shown when loading, matches actual order (before filters) */}
            {stillLoadingData && (
                <div className="hidden md:block mb-6">
                    <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4" style={{ scrollbarWidth: "thin" }}>
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div
                                key={`skeleton-card-${index}`}
                                className="flex-shrink-0 w-64 p-4 rounded-lg border-2 border-gray-200 bg-white animate-pulse"
                                style={{ fontFamily: 'var(--font-body)' }}
                            >
                                <div className="space-y-2">
                                    <div className="h-6 bg-gray-300 rounded w-3/4" />
                                    <div className="h-4 bg-gray-300 rounded w-1/2" />
                                    <div className="pt-2 space-y-1 border-t border-gray-200">
                                        <div className="flex justify-between text-sm">
                                            <div className="h-4 bg-gray-300 rounded w-24" />
                                            <div className="h-4 bg-gray-300 rounded w-12" />
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <div className="h-4 bg-gray-300 rounded w-20" />
                                            <div className="h-4 bg-gray-300 rounded w-8" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Release Cards - hidden on mobile */}
            {releaseStats.length > 0 && (
                <div className="hidden md:block">
                <Box mb="sm">
                    <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4" style={{ scrollbarWidth: 'thin' }}>
                        {(loading || (isDeterminingOrder && releaseSchedule.length === 0)) ? (
                            // Show skeleton cards only when loading or when we truly don't have release data yet
                            Array.from({ length: Math.max(releaseStats.length, 3) }).map((_, index) => (
                                <div
                                    key={`skeleton-${index}`}
                                    className="flex-shrink-0 w-64 p-4 rounded-lg border-2 border-gray-200 bg-white animate-pulse"
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
                                            flex-shrink-0 w-64 p-4 rounded-lg border-1 border-gray-300 cursor-pointer transition-all !bg-white
                                            ${isSelected 
                                                ? 'shadow-md border-[2px]' 
                                                : 'border-[#E5E7EB] hover:shadow-sm hover:border-[var(--color-cast-iron-border)]'
                                            }
                                        `}
                                        style={{ 
                                            backgroundColor: '#FFFFFF',
                                            ...(isSelected ? {
                                                borderColor: 'var(--color-cast-iron-border, #C9C6BF)'
                                            } : {}),
                                            fontFamily: 'var(--font-body)',
                                            transition: 'var(--transition-base)'
                                        }}
                                    >
                                        <div className="space-y-2">
                                            <h3 
                                                style={{ 
                                                    fontFamily: 'var(--font-heading)',
                                                    color: isSelected ? 'var(--color-cast-iron)' : 'var(--color-gray-900)',
                                                    fontSize: '20px',
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
                                                    {formatDateOnlyForDisplay(stat.releaseDate, { 
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
                                                    }}>Epics loaded / in Aha!:</span>
                                                    <span className="font-medium" style={{ 
                                                        color: isSelected ? 'var(--color-cast-iron)' : 'var(--color-gray-900)', 
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
                </div>
            )}

            {/* Search and filters bar - collapsible on mobile */}
            {/* Only show filters when we have data and are not loading */}
            {!stillLoadingData && (initialEpics.length > 0 || epics.length > 0) && (
            <>
            {isMobile ? (
                <Box mb="lg">
                    <Button
                        variant="light"
                        size="sm"
                        leftSection={filtersExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                        onClick={() => setFiltersExpanded((v) => !v)}
                        style={{ fontFamily: 'var(--font-body)' }}
                    >
                        Filters
                        {(filters.search || filters.module !== "ALL" || filters.tier !== "ALL" || filters.status !== "ALL" || filters.risk !== "ALL" || selectedRelease) && (
                            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-800">
                                on
                            </span>
                        )}
                    </Button>
                    <Collapse in={filtersExpanded}>
                        <Box
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px',
                                paddingTop: '12px'
                            }}
                        >
                            <TextInput
                                placeholder="Search epics..."
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                leftSection={<IconSearch size={18} />}
                                rightSection={
                                    filters.search ? (
                                        <ActionIcon
                                            size="sm"
                                            variant="transparent"
                                            onClick={() => setFilters({ ...filters, search: "" })}
                                        >
                                            <IconX size={14} />
                                        </ActionIcon>
                                    ) : null
                                }
                                style={{ minWidth: 0 }}
                                styles={{
                                    input: {
                                        borderRadius: 8,
                                        border: '1px solid var(--color-gray-300)',
                                        fontFamily: 'var(--font-body)'
                                    }
                                }}
                            />
                            <Select
                                placeholder="Module"
                                value={filters.module}
                                onChange={(value) => setFilters({ ...filters, module: value || "ALL" })}
                                data={moduleOptions}
                                clearable
                                style={{ width: '100%' }}
                                styles={{
                                    input: {
                                        borderRadius: 8,
                                        border: '1px solid var(--color-gray-300)',
                                        backgroundColor: 'var(--color-gray-50)',
                                        fontFamily: 'var(--font-body)'
                                    }
                                }}
                            />
                            <Select
                                placeholder="Tier"
                                value={filters.tier}
                                onChange={(value) => setFilters({ ...filters, tier: value || "ALL" })}
                                data={[
                                    { value: "ALL", label: "All Tiers" },
                                    { value: "TIER_1", label: "Tier 1" },
                                    { value: "TIER_2", label: "Tier 2" },
                                    { value: "TIER_3", label: "Tier 3" },
                                ]}
                                clearable
                                style={{ width: '100%' }}
                                styles={{
                                    input: {
                                        borderRadius: 8,
                                        border: '1px solid var(--color-gray-300)',
                                        backgroundColor: 'var(--color-gray-50)',
                                        fontFamily: 'var(--font-body)'
                                    }
                                }}
                            />
                            <Select
                                placeholder="Status"
                                value={filters.status}
                                onChange={(value) => setFilters({ ...filters, status: value || "ALL" })}
                                data={[
                                    { value: "ALL", label: "All Statuses" },
                                    { value: "Pre_Release", label: "Pre-Release" },
                                    { value: "Released_Cohort_1", label: "Released Cohort 1" },
                                    { value: "Released_GA", label: "Released GA" },
                                    { value: "Released_Retroed", label: "Released Retroed" },
                                    { value: "Cancelled", label: "Cancelled" },
                                ]}
                                clearable
                                style={{ width: '100%' }}
                                styles={{
                                    input: {
                                        borderRadius: 8,
                                        border: '1px solid var(--color-gray-300)',
                                        backgroundColor: 'var(--color-gray-50)',
                                        fontFamily: 'var(--font-body)'
                                    }
                                }}
                            />
                            <Select
                                placeholder="Risk"
                                value={filters.risk}
                                onChange={(value) => setFilters({ ...filters, risk: value || "ALL" })}
                                data={[
                                    { value: "ALL", label: "All Risks" },
                                    { value: "LOW", label: "Low" },
                                    { value: "MEDIUM", label: "Medium" },
                                    { value: "HIGH", label: "High" },
                                ]}
                                clearable
                                style={{ width: '100%' }}
                                styles={{
                                    input: {
                                        borderRadius: 8,
                                        border: '1px solid var(--color-gray-300)',
                                        backgroundColor: 'var(--color-gray-50)',
                                        fontFamily: 'var(--font-body)'
                                    }
                                }}
                            />
                            {(filters.search || filters.module !== "ALL" || filters.tier !== "ALL" || filters.status !== "ALL" || filters.risk !== "ALL" || selectedRelease) && (
                                <Button
                                    variant="light"
                                    color="red"
                                    size="sm"
                                    leftSection={<IconX size={16} />}
                                    onClick={() => {
                                        setFilters({ search: "", module: "ALL", tier: "ALL", status: "ALL", risk: "ALL" });
                                        setSelectedRelease(null);
                                    }}
                                    style={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}
                                    styles={{
                                        root: {
                                            backgroundColor: 'var(--color-error-light, #FEE2E2)',
                                            color: 'var(--color-error-dark, #991B1B)'
                                        }
                                    }}
                                >
                                    Clear Filters
                                </Button>
                            )}
                        </Box>
                    </Collapse>
                </Box>
            ) : (
                <Group mb="lg" align="center" gap="sm">
                    <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>Filters:</Text>
                    <Box
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '16px',
                            padding: '8px 0'
                        }}
                    >
                    <TextInput
                        placeholder="Search epics..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        leftSection={<IconSearch size={18} />}
                        rightSection={
                            filters.search ? (
                                <ActionIcon
                                    size="sm"
                                    variant="transparent"
                                    onClick={() => setFilters({ ...filters, search: "" })}
                                >
                                    <IconX size={14} />
                                </ActionIcon>
                            ) : null
                        }
                        style={{ minWidth: 220, maxWidth: 320 }}
                        styles={{
                            input: {
                                borderRadius: 8,
                                border: '1px solid var(--color-gray-300)',
                                fontFamily: 'var(--font-body)'
                            }
                        }}
                    />
                    <Select
                        placeholder="Module"
                        value={filters.module}
                        onChange={(value) => setFilters({ ...filters, module: value || "ALL" })}
                        data={moduleOptions}
                        clearable
                        style={{ minWidth: 140 }}
                        styles={{
                            input: {
                                borderRadius: 8,
                                border: '1px solid var(--color-gray-300)',
                                backgroundColor: 'var(--color-gray-50)',
                                fontFamily: 'var(--font-body)'
                            }
                        }}
                    />
                    <Select
                        placeholder="Tier"
                        value={filters.tier}
                        onChange={(value) => setFilters({ ...filters, tier: value || "ALL" })}
                        data={[
                            { value: "ALL", label: "All Tiers" },
                            { value: "TIER_1", label: "Tier 1" },
                            { value: "TIER_2", label: "Tier 2" },
                            { value: "TIER_3", label: "Tier 3" },
                        ]}
                        clearable
                        style={{ minWidth: 120 }}
                        styles={{
                            input: {
                                borderRadius: 8,
                                border: '1px solid var(--color-gray-300)',
                                backgroundColor: 'var(--color-gray-50)',
                                fontFamily: 'var(--font-body)'
                            }
                        }}
                    />
                    <Select
                        placeholder="Status"
                        value={filters.status}
                        onChange={(value) => setFilters({ ...filters, status: value || "ALL" })}
                        data={[
                            { value: "ALL", label: "All Statuses" },
                            { value: "Pre_Release", label: "Pre-Release" },
                            { value: "Released_Cohort_1", label: "Released Cohort 1" },
                            { value: "Released_GA", label: "Released GA" },
                            { value: "Released_Retroed", label: "Released Retroed" },
                            { value: "Cancelled", label: "Cancelled" },
                        ]}
                        clearable
                        style={{ minWidth: 150 }}
                        styles={{
                            input: {
                                borderRadius: 8,
                                border: '1px solid var(--color-gray-300)',
                                backgroundColor: 'var(--color-gray-50)',
                                fontFamily: 'var(--font-body)'
                            }
                        }}
                    />
                    <Select
                        placeholder="Risk"
                        value={filters.risk}
                        onChange={(value) => setFilters({ ...filters, risk: value || "ALL" })}
                        data={[
                            { value: "ALL", label: "All Risks" },
                            { value: "LOW", label: "Low" },
                            { value: "MEDIUM", label: "Medium" },
                            { value: "HIGH", label: "High" },
                        ]}
                        clearable
                        style={{ minWidth: 100 }}
                        styles={{
                            input: {
                                borderRadius: 8,
                                border: '1px solid var(--color-gray-300)',
                                backgroundColor: 'var(--color-gray-50)',
                                fontFamily: 'var(--font-body)'
                            }
                        }}
                    />
                    {(filters.search || filters.module !== "ALL" || filters.tier !== "ALL" || filters.status !== "ALL" || filters.risk !== "ALL" || selectedRelease) && (
                        <Button
                            variant="light"
                            color="red"
                            size="sm"
                            leftSection={<IconX size={16} />}
                            onClick={() => {
                                setFilters({ search: "", module: "ALL", tier: "ALL", status: "ALL", risk: "ALL" });
                                setSelectedRelease(null);
                            }}
                            style={{
                                marginLeft: 'auto',
                                fontFamily: 'var(--font-body)',
                                fontWeight: 500
                            }}
                            styles={{
                                root: {
                                    backgroundColor: 'var(--color-error-light, #FEE2E2)',
                                    color: 'var(--color-error-dark, #991B1B)'
                                }
                            }}
                        >
                            Clear Filters
                        </Button>
                    )}
                    </Box>
                </Group>
            )}
            </>
            )}

          
                
            {filteredReleaseGroups.length === 0 ? (
                // Only show "no epics found" if we're done loading and truly have no epics
                // Otherwise show skeleton while loading
                stillLoadingData ? (
                    // Table skeleton while loading
                    <div className="rounded-lg overflow-hidden" style={{
                            border: "1px solid #E5E7EB",
                            backgroundColor: "#FFFFFF",
                            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)"
                    }}>
                        <div className="overflow-x-auto">
                            <table className="releases-epics-table w-full table-fixed" style={{ borderCollapse: "collapse", minWidth: "1170px" }}>
                                <colgroup>
                                    <col />
                                    <col style={{ width: '6.5rem' }} />
                                    <col style={{ width: '6.5rem' }} />
                                    <col style={{ width: '5.5rem' }} />
                                    <col style={{ width: '5.5rem' }} />
                                    <col style={{ width: '6.5rem' }} />
                                    <col style={{ width: '7rem' }} />
                                    <col style={{ width: '5.5rem' }} />
                                </colgroup>
                                <thead style={{ backgroundColor: "#FFFFFF", borderBottom: "2px solid #E5E7EB" }}>
                                    <tr>
                                        {["Name", "GTM Orgs", "Internal Orgs", "Cohort 1", "GA", "Status", "Readiness", "Risk"].map((col) => (
                                            <th key={col} className={`${col === "Risk" ? "px-4 py-3 text-right" : "px-4 py-3 text-left"}${["GTM Orgs", "Internal Orgs", "Cohort 1", "GA", "Status", "Readiness"].includes(col) ? " hidden md:table-cell" : ""}${col === "GTM Orgs" || col === "Internal Orgs" ? " py-4" : ""}`} style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>
                                                {["Cohort 1", "GA"].includes(col) ? (
                                                    <div className="flex items-center gap-1">{col}<CohortDateHeaderIcon /></div>
                                                ) : col === "GTM Orgs" ? (
                                                    <div className="flex items-center gap-1">{col}<GtmOrgsHeaderIcon /></div>
                                                ) : col === "Internal Orgs" ? (
                                                    <div className="flex items-center gap-1">{col}<InternalOrgsHeaderIcon /></div>
                                                ) : col === "Risk" ? (
                                                    <div className="hidden md:flex items-center justify-end gap-1">{col}</div>
                                                ) : col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white" style={{ borderTop: "1px solid #E5E7EB" }}>
                                    {[220, 180, 260, 200, 240].map((nameW, index) => (
                                        <tr key={index} className="!bg-white" style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}>
                                            <td className="px-4 py-3 w-100" style={{ padding: "14px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: `${nameW}px`, marginBottom: "7px" }} />
                                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                                    <div className="skeleton-shimmer" style={{ height: "18px", width: "52px", borderRadius: "10px" }} />
                                                    <div className="skeleton-shimmer" style={{ height: "14px", width: `${60 + (index * 13) % 50}px`, marginTop: "2px" }} />
                                                    <div className="skeleton-shimmer" style={{ height: "14px", width: `${50 + (index * 7) % 40}px`, marginTop: "2px" }} />
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "14px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: "56px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "14px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: "56px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "14px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: "60px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "14px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "14px", width: "60px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-24" style={{ padding: "14px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "22px", width: "64px", borderRadius: "10px" }} />
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 w-32" style={{ padding: "14px 16px" }}>
                                                <div className="skeleton-shimmer" style={{ height: "8px", width: "80px", borderRadius: "4px", marginBottom: "5px" }} />
                                                <div className="skeleton-shimmer" style={{ height: "12px", width: "36px" }} />
                                            </td>
                                            <td className="px-4 py-3" style={{ padding: "12px 16px" }}>
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="hidden md:block skeleton-shimmer" style={{ height: "22px", width: "44px", borderRadius: "10px" }} />
                                                    <div className="skeleton-shimmer" style={{ height: "14px", width: "14px" }} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    // Show "no epics found" only when we're done loading and truly have no epics
                    <div className="rounded-lg overflow-hidden" style={{
                        border: `1px solid var(--color-gray-200)`,
                        backgroundColor: 'var(--color-white, #FFFFFF)'
                    }}>
                        <div className="px-4 py-8 text-center" style={{ 
                            color: 'var(--color-gray-500)', 
                            fontSize: 'var(--font-size-base)',
                            fontFamily: 'var(--font-body)'
                        }}>
                            No epics found matching filters.
                        </div>
                    </div>
                )
            ) : (
                <div className="space-y-8 pt-2">
                        {filteredReleaseGroups.map((group, groupIndex) => (
                            <div key={groupIndex} className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 style={{
                                        fontFamily: 'var(--font-heading)',
                                        fontSize: '20px',
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
                                                - Cohort 1 on {formatDateOnlyForDisplay(group.releaseDate)}
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
                                        {group.releaseName !== "Ungrouped" && group.releaseDate && (() => {
                                            const daysUntil = getDaysUntilCohort1(group.releaseDate);
                                            if (!daysUntil) return null;
                                            const urgent = daysUntil <= 7;
                                            return (
                                                <span style={{
                                                    marginLeft: 'var(--spacing-2)',
                                                    display: 'inline-flex', alignItems: 'center',
                                                    verticalAlign: 'middle',
                                                }}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        padding: '2px 10px',
                                                        borderRadius: 20,
                                                        background: urgent ? '#FEF08A' : '#FEF9C3',
                                                        border: `1.5px solid ${urgent ? '#EAB308' : '#FDE047'}`,
                                                        color: '#713F12',
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        fontFamily: 'var(--font-body)',
                                                        whiteSpace: 'nowrap',
                                                        letterSpacing: '-0.01em',
                                                    }}>
                                                        <span style={{ fontSize: 15, fontWeight: 800 }}>{daysUntil}</span>
                                                        {' '}day{daysUntil !== 1 ? 's' : ''} until Cohort 1 Live
                                                    </span>
                                                </span>
                                            );
                                        })()}
                                        {group.releaseName !== "Ungrouped" && group.releaseDate && (
                                            <span style={{
                                                marginLeft: 'var(--spacing-2)',
                                                fontSize: 'var(--font-size-sm)',
                                                fontWeight: 'var(--font-weight-normal)',
                                                color: 'var(--color-gray-500)',
                                                fontFamily: 'var(--font-body)'
                                            }}>
                                                {'- '}
                                                <button
                                                    type="button"
                                                    onClick={() => setShowTimelineForRelease(prev => prev === group.releaseName ? null : group.releaseName)}
                                                    style={{
                                                        fontSize: 'inherit',
                                                        fontWeight: 'inherit',
                                                        color: '#2196F3',
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: 0
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#1976D2'; e.currentTarget.style.textDecoration = 'underline'; }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#2196F3'; e.currentTarget.style.textDecoration = 'none'; }}
                                                >
                                                    {showTimelineForRelease === group.releaseName ? 'Hide Release Timeline' : 'Show Release Timeline'}
                                                </button>
                                            </span>
                                        )}
                                    </h2>
                                    {group.releaseName !== "Ungrouped" && (
                                        <div className="flex items-center gap-3">
                                            <button
                                                disabled={syncingReleaseName === group.releaseName}
                                                className="disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={{
                                                    fontSize: 'var(--font-size-sm)',
                                                    fontFamily: 'var(--font-body)',
                                                    fontWeight: 'var(--font-weight-normal)',
                                                    color: '#2196F3',
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    padding: 0
                                                }}
                                                onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.color = '#1976D2')}
                                                onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.color = '#2196F3')}
                                                onClick={async () => {
                                                if (!confirm(`Sync epics for release "${group.releaseName}"? This will sync all epics with matching tags for this release.`)) {
                                                    return;
                                                }
                                                
                                                setSyncingReleaseName(group.releaseName);
                                                
                                                // Set a timeout to prevent UI from getting stuck
                                                const releaseNameForTimeout = group.releaseName;
                                                const timeoutId = setTimeout(() => {
                                                    // Check if still syncing this release (using a ref or direct check)
                                                    notifications.show({
                                                        title: 'Sync Taking Longer Than Expected',
                                                        message: `The sync for "${releaseNameForTimeout}" is still running. This may take several minutes for large releases. The page will refresh when complete.`,
                                                        color: 'yellow',
                                                        autoClose: 10000,
                                                    });
                                                }, 30000); // Show warning after 30 seconds
                                                
                                                try {
                                                    const existingAhaIds = group.epics
                                                        .map(e => e.aha_id)
                                                        .filter((id): id is string => Boolean(id));

                                                    const result = await fetchStreamJSON(
                                                        `/api/integrations/aha/sync?sync_all=true&release=${encodeURIComponent(group.releaseName)}`,
                                                        {
                                                            method: "POST",
                                                            credentials: "include",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ releaseName: group.releaseName, existingAhaIds }),
                                                        }
                                                    );
                                                    const skipDetails = [];
                                                    if (result.results.skipped_no_release > 0) {
                                                        skipDetails.push(`${result.results.skipped_no_release} with no release`);
                                                    }
                                                    if (result.results.skipped_release_not_synced > 0) {
                                                        skipDetails.push(`${result.results.skipped_release_not_synced} with unsynced release`);
                                                    }
                                                    if (result.results.removed_from_release > 0) {
                                                        skipDetails.push(`${result.results.removed_from_release} removed from release`);
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
                                                    if (error.name === 'AbortError') {
                                                        notifications.show({
                                                            title: 'Sync Timeout',
                                                            message: 'The sync request timed out after 5 minutes. The sync may still be processing on the server. Please refresh the page in a moment.',
                                                            color: 'orange',
                                                            autoClose: 15000,
                                                        });
                                                    } else {
                                                        notifications.show({
                                                            title: 'Sync Failed',
                                                            message: error.message || 'An error occurred during sync',
                                                            color: 'red',
                                                        });
                                                    }
                                                } finally {
                                                    clearTimeout(timeoutId);
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
                                            className="disabled:opacity-50 disabled:cursor-not-allowed"
                                            style={{
                                                fontSize: 'var(--font-size-sm)',
                                                fontFamily: 'var(--font-body)',
                                                fontWeight: 'var(--font-weight-normal)',
                                                color: '#2196F3',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: 0
                                            }}
                                            onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.color = '#1976D2')}
                                            onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.color = '#2196F3')}
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
                                {showTimelineForRelease === group.releaseName && group.releaseDate && (() => {
                                    if (group.epics.length === 0) return null;
                                    const uiEpics = [...group.epics].filter(isUiFrameworkEpic).sort((a, b) => a.name.localeCompare(b.name));
                                    const hasUi = uiEpics.length > 0;
                                    const hasStandard = group.epics.some((e) => !isUiFrameworkEpic(e));
                                    const cohort2 = getCohort2DateForUiTimeline(group.releaseName, group.releaseDate, releaseScheduleWithIds);
                                    const uiLevels = uiEpics.map(parseUiLevelFromEpic).filter((x): x is number => x != null);
                                    const primaryUiLevel = uiLevels.length > 0 ? uiLevels[0] : undefined;
                                    const uiLevelsDiffer = new Set(uiLevels).size > 1;
                                    /** UI rollout math requires a level; default matches epic detail when impact is unset. */
                                    const effectiveUiLevelForUiRollout = primaryUiLevel ?? 1;

                                    return (
                                        <div className="mt-3 space-y-4">
                                            {hasStandard && (
                                                <div>
                                                    {hasUi && (
                                                        <Text size="sm" fw={600} c="dimmed" mb={6} style={{ fontFamily: 'var(--font-body)' }}>
                                                            Standard launch timeline
                                                        </Text>
                                                    )}
                                                    <ReleaseStagesChart
                                                        releaseDate={group.releaseDate}
                                                        stages={releaseScheduleStagesForTimeline}
                                                        showHeading={false}
                                                        noContainer
                                                    />
                                                </div>
                                            )}
                                            {hasUi && (
                                                <div>
                                                    {hasStandard && (
                                                        <Text size="sm" fw={600} c="dimmed" mb={6} style={{ fontFamily: 'var(--font-body)' }}>
                                                            UI framework rollout timeline
                                                        </Text>
                                                    )}
                                                    {primaryUiLevel == null && (
                                                        <Text size="xs" c="dimmed" mb={6} style={{ fontFamily: 'var(--font-body)' }}>
                                                            No UI/UX impact level (1–3) found on these epics; using level {effectiveUiLevelForUiRollout} for phase lengths. Set the field in Aha! or open an epic for its chart.
                                                        </Text>
                                                    )}
                                                    {uiLevelsDiffer && (
                                                        <Text size="xs" c="dimmed" mb={6} style={{ fontFamily: 'var(--font-body)' }}>
                                                            UI impact levels differ across epics in this release; showing durations for level {primaryUiLevel ?? effectiveUiLevelForUiRollout}. Open an epic for its exact level.
                                                        </Text>
                                                    )}
                                                    <ReleaseStagesChart
                                                        releaseDate={group.releaseDate}
                                                        cohort2Date={cohort2}
                                                        stages={uiRolloutStagesForTimeline}
                                                        uiLevel={effectiveUiLevelForUiRollout}
                                                        showHeading={false}
                                                        noContainer
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                <div className="rounded-lg overflow-hidden" style={{ 
                                    border: "1px solid #E5E7EB",
                                    backgroundColor: "#FFFFFF",
                                    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)"
                                }}>
                                    <div className="overflow-x-auto overflow-y-visible">
                                    {(loading || (isDeterminingOrder && releaseSchedule.length === 0 && group.epics.length === 0)) ? (
                                        <table className="releases-epics-table w-full table-fixed" style={{ borderCollapse: "collapse", minWidth: "1170px" }}>
                                            <colgroup>
                                                <col />
                                                <col style={{ width: '6.5rem' }} />
                                                <col style={{ width: '6.5rem' }} />
                                                <col style={{ width: '5.5rem' }} />
                                                <col style={{ width: '5.5rem' }} />
                                                <col style={{ width: '6.5rem' }} />
                                                <col style={{ width: '7rem' }} />
                                                <col style={{ width: '5.5rem' }} />
                                            </colgroup>
                                            <thead style={{
                                                backgroundColor: "#FFFFFF",
                                                borderBottom: "2px solid #E5E7EB"
                                            }}>
                                                <tr>
                                                    <th className="px-4 py-3 text-left w-100" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Name</th>
                                                    <th className="hidden md:table-cell px-4 py-4 text-left" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}><GtmOrgsColumnHeader defaultTargetYmd={getGroupGtmPlannedTargetYmd(group)} /></th>
                                                    <th className="hidden md:table-cell px-4 py-4 text-left" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}><InternalReadinessColumnHeader defaultTargetYmd={getGroupInternalReadinessPlannedTargetYmd(group)} /></th>
                                                    <th className="hidden md:table-cell px-4 py-3 text-left w-28" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}><div className="flex items-center gap-1">Cohort 1<CohortDateHeaderIcon /></div></th>
                                                    <th className="hidden md:table-cell px-4 py-3 text-left w-28" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}><div className="flex items-center gap-1">GA<CohortDateHeaderIcon /></div></th>
                                                    <th className="hidden md:table-cell px-4 py-3 text-left w-24" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Status</th>
                                                    <th className="hidden md:table-cell px-4 py-3 text-left w-32" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>
                                                        <div className="flex items-center gap-1">
                                                            Readiness
                                                            <Tooltip label={<div style={{ maxWidth: '300px' }}><div style={{ fontWeight: 600, marginBottom: '8px' }}>How is this calculated?</div><div style={{ fontSize: '12px', lineHeight: '1.5' }}>The readiness score measures how complete your launch preparation is. Criteria are grouped into categories (like Technical, Legal, Marketing). Within each category, each criterion gets a score: GO = 100%, CONDITIONAL = 50%, NO_GO or NOT_SET = 0%. Gate criteria (must-have items) count 3 times more than regular criteria. If a category has a signoff that&apos;s GO, all criteria in that category are treated as GO. We then average the scores across all categories (each category has equal weight). The score is capped lower if there are gate blockers or missing criteria.</div></div>} withArrow multiline>
                                                                <IconInfoCircle size={14} style={{ cursor: 'help', color: 'var(--table-header-text-platinum, var(--color-platinum, #E8E6E3))', opacity: 0.85 }} />
                                                            </Tooltip>
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 text-right" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>
                                                        <div className="hidden md:flex items-center justify-end gap-1">
                                                            Risk
                                                            <Tooltip label={<div style={{ maxWidth: '300px' }}><div style={{ fontWeight: 600, marginBottom: '8px' }}>How is this calculated?</div><div style={{ fontSize: '12px', lineHeight: '1.5' }}>Risk is calculated from multiple factors that add up to a score (0-100 points). Days to launch: More points if launching soon (up to 40 points). Readiness status: NO_GO adds 30 points, CONDITIONAL adds 20 points. Readiness score below threshold: Up to 20 points based on how far below. Gate blockers: Adds 30 points if any gate criteria are NO_GO. Overdue criteria: Up to 20 points (5 points per overdue item). The final risk level is LOW, MEDIUM, or HIGH based on the total score. A GO epic can still be HIGH risk if launching soon.</div></div>} withArrow multiline>
                                                                <IconInfoCircle size={14} style={{ cursor: 'help', color: 'var(--table-header-text-platinum, var(--color-platinum, #E8E6E3))', opacity: 0.85 }} />
                                                            </Tooltip>
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white" style={{ borderTop: "1px solid #E5E7EB" }}>
                                                {Array.from({ length: 5 }).map((_, index) => {
                                                    const nameWidths = [220, 180, 260, 200, 240];
                                                    const nameW = nameWidths[index % nameWidths.length];
                                                    return (
                                                    <tr key={`skeleton-row-${index}`} className="!bg-white" style={{ backgroundColor: '#FFFFFF', borderBottom: "1px solid #E5E7EB" }}>
                                                        <td className="px-4 py-3 w-100" style={{ padding: "12px 16px" }}>
                                                            <div className="skeleton-shimmer" style={{ height: "14px", width: `${nameW}px`, marginBottom: "7px" }} />
                                                            <div className="flex items-center gap-2">
                                                                <div className="skeleton-shimmer" style={{ height: "18px", width: "52px", borderRadius: "10px" }} />
                                                                <div className="skeleton-shimmer" style={{ height: "14px", width: `${60 + (index * 13) % 50}px` }} />
                                                                <div className="skeleton-shimmer" style={{ height: "14px", width: `${50 + (index * 7) % 40}px` }} />
                                                            </div>
                                                        </td>
                                                        <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "12px 16px" }}><div className="skeleton-shimmer" style={{ height: "14px", width: "56px" }} /></td>
                                                        <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "12px 16px" }}><div className="skeleton-shimmer" style={{ height: "14px", width: "56px" }} /></td>
                                                        <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "12px 16px" }}><div className="skeleton-shimmer" style={{ height: "14px", width: "60px" }} /></td>
                                                        <td className="hidden md:table-cell px-4 py-3 w-28" style={{ padding: "12px 16px" }}><div className="skeleton-shimmer" style={{ height: "14px", width: "60px" }} /></td>
                                                        <td className="hidden md:table-cell px-4 py-3 w-24" style={{ padding: "12px 16px" }}><div className="skeleton-shimmer" style={{ height: "22px", width: "64px", borderRadius: "10px" }} /></td>
                                                        <td className="hidden md:table-cell px-4 py-3 w-32" style={{ padding: "12px 16px" }}>
                                                            <div className="skeleton-shimmer" style={{ height: "8px", width: "80px", borderRadius: "4px", marginBottom: "5px" }} />
                                                            <div className="skeleton-shimmer" style={{ height: "12px", width: "36px" }} />
                                                        </td>
                                                        <td className="px-4 py-3" style={{ padding: "12px 16px" }}>
                                                            <div className="flex items-center justify-end gap-2">
                                                                <div className="hidden md:block skeleton-shimmer" style={{ height: "22px", width: "44px", borderRadius: "10px" }} />
                                                                <div className="skeleton-shimmer" style={{ height: "14px", width: "14px" }} />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <table className="releases-epics-table w-full table-fixed" style={{ borderCollapse: "collapse", minWidth: "1170px" }}>
                                            <colgroup>
                                                <col />
                                                <col style={{ width: '6.5rem' }} />
                                                <col style={{ width: '6.5rem' }} />
                                                <col style={{ width: '5.5rem' }} />
                                                <col style={{ width: '5.5rem' }} />
                                                <col style={{ width: '6.5rem' }} />
                                                <col style={{ width: '7rem' }} />
                                                <col style={{ width: '5.5rem' }} />
                                            </colgroup>
                                            <thead style={{
                                                backgroundColor: "#FFFFFF",
                                                borderBottom: "2px solid #E5E7EB"
                                            }}>
                                                <tr>
                                                    <th className="px-4 py-3 text-left w-100" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Name</th>
                                                    <th className="hidden md:table-cell px-4 py-4 text-left" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}><GtmOrgsColumnHeader defaultTargetYmd={getGroupGtmPlannedTargetYmd(group)} /></th>
                                                    <th className="hidden md:table-cell px-4 py-4 text-left" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}><InternalReadinessColumnHeader defaultTargetYmd={getGroupInternalReadinessPlannedTargetYmd(group)} /></th>
                                                    <th className="hidden md:table-cell px-4 py-3 text-left w-28" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}><div className="flex items-center gap-1">Cohort 1<CohortDateHeaderIcon /></div></th>
                                                    <th className="hidden md:table-cell px-4 py-3 text-left w-28" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}><div className="flex items-center gap-1">GA<CohortDateHeaderIcon /></div></th>
                                                    <th className="hidden md:table-cell px-4 py-3 text-left w-24" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Status</th>
                                                    <th className="hidden md:table-cell px-4 py-3 text-left w-32" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>
                                                        <div className="flex items-center gap-1">
                                                            Readiness
                                                            <Tooltip label={<div style={{ maxWidth: '300px' }}><div style={{ fontWeight: 600, marginBottom: '8px' }}>How is this calculated?</div><div style={{ fontSize: '12px', lineHeight: '1.5' }}>The readiness score measures how complete your launch preparation is. Criteria are grouped into categories (like Technical, Legal, Marketing). Within each category, each criterion gets a score: GO = 100%, CONDITIONAL = 50%, NO_GO or NOT_SET = 0%. Gate criteria (must-have items) count 3 times more than regular criteria. If a category has a signoff that&apos;s GO, all criteria in that category are treated as GO. We then average the scores across all categories (each category has equal weight). The score is capped lower if there are gate blockers or missing criteria.</div></div>} withArrow multiline>
                                                                <IconInfoCircle size={14} style={{ cursor: 'help', color: 'var(--table-header-text-platinum, var(--color-platinum, #E8E6E3))', opacity: 0.85 }} />
                                                            </Tooltip>
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 text-right" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>
                                                        <div className="hidden md:flex items-center justify-end gap-1">
                                                            Risk
                                                            <Tooltip label={<div style={{ maxWidth: '300px' }}><div style={{ fontWeight: 600, marginBottom: '8px' }}>How is this calculated?</div><div style={{ fontSize: '12px', lineHeight: '1.5' }}>Risk is calculated from multiple factors that add up to a score (0-100 points). Days to launch: More points if launching soon (up to 40 points). Readiness status: NO_GO adds 30 points, CONDITIONAL adds 20 points. Readiness score below threshold: Up to 20 points based on how far below. Gate blockers: Adds 30 points if any gate criteria are NO_GO. Overdue criteria: Up to 20 points (5 points per overdue item). The final risk level is LOW, MEDIUM, or HIGH based on the total score. A GO epic can still be HIGH risk if launching soon.</div></div>} withArrow multiline>
                                                                <IconInfoCircle size={14} style={{ cursor: 'help', color: 'var(--table-header-text-platinum, var(--color-platinum, #E8E6E3))', opacity: 0.85 }} />
                                                            </Tooltip>
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white" style={{ borderTop: "1px solid #E5E7EB" }}>
                                                {group.epics.map((epic, epicIdx) => {

                                                return (
                                                <tr
                                                    key={epic.id}
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
                                                        <span className="inline-flex items-center gap-2">
                                                            {epic.aha_record_not_found && (
                                                                <Tooltip label="Record not found in Aha." withArrow>
                                                                    <span className="inline-flex text-red-600 flex-shrink-0" aria-hidden>
                                                                        <IconAlertTriangle size={20} strokeWidth={2.5} />
                                                                    </span>
                                                                </Tooltip>
                                                            )}
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
                                                        </span>
                                                        <div className="flex items-center gap-1 mt-1" style={{ flexWrap: "wrap" }}>
                                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${epic.tier === 'TIER_1' ? 'bg-purple-100 text-purple-800' :
                                                                epic.tier === 'TIER_2' ? 'bg-blue-100 text-blue-800' :
                                                                    'bg-gray-100 text-gray-800'
                                                                }`}>
                                                                {epic.tier.replace('_', ' ')}
                                                            </span>
                                                            {getModuleFromEpic(epic) && (
                                                                <>
                                                                    <span style={{ fontSize: "11px", color: "#D1D5DB" }}>|</span>
                                                                    <span style={{ fontSize: "12px", color: "#6B7280" }}>{getModuleFromEpic(epic)}</span>
                                                                </>
                                                            )}
                                                            {(epic.owner?.email || epic.owner_email) && (() => {
                                                                const ownerEmail = (epic.owner?.email || epic.owner_email)!;
                                                                const info = ownerInfoMap[ownerEmail.toLowerCase()];
                                                                const pmName = info?.first_name || ownerEmail.split('@')[0];
                                                                return (
                                                                    <>
                                                                        <span style={{ fontSize: "11px", color: "#D1D5DB" }}>|</span>
                                                                        <span style={{ fontSize: "12px", color: "#6B7280" }}>{pmName}</span>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </td>
                                                    <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap w-28 text-left" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                        <GtmAccessDateCell
                                                            epic={epic}
                                                            plannedYmd={getEpicGtmAccessDateYmd(
                                                                epic,
                                                                releaseScheduleStagesForTimeline,
                                                                uiRolloutStagesForTimeline,
                                                                { releaseTrainDateYmd: group.releaseDate },
                                                            )}
                                                            needsAttention={epicNeedsGtmConfirmation(epic, group.releaseDate)}
                                                            dateOptions={{ month: 'short', day: 'numeric' }}
                                                            editable={canEditAccessDates}
                                                            onUpdate={(patch) => handleGtmAccessUpdate(epic.id, patch)}
                                                        />
                                                    </td>
                                                    <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap w-28 text-left" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                        <InternalReadinessDateCell
                                                            epic={epic}
                                                            plannedYmd={getEpicInternalOrgsDateYmd(
                                                                epic,
                                                                releaseScheduleStagesForTimeline,
                                                                uiRolloutStagesForTimeline,
                                                                { releaseTrainDateYmd: group.releaseDate },
                                                            )}
                                                            needsAttention={epicNeedsInternalReadinessConfirmation(epic, group.releaseDate)}
                                                            dateOptions={{ month: 'short', day: 'numeric' }}
                                                            editable={canEditAccessDates}
                                                            onUpdate={(patch) => handleInternalReadinessUpdate(epic.id, patch)}
                                                        />
                                                    </td>
                                                    <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap w-28 text-left" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                        <Cohort1DateBadge
                                                            epic={epic}
                                                            scheduleReleaseDate={group.releaseDate}
                                                            dateOptions={{ month: 'short', day: 'numeric' }}
                                                        />
                                                    </td>
                                                    <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap w-28 text-left" style={{ padding: "12px 16px", fontSize: "14px", color: "#111827" }}>
                                                        <EpicGaDateBadge
                                                            epic={epic}
                                                            releaseSchedule={releaseScheduleWithIds}
                                                            releaseTrainDateYmd={group.releaseDate}
                                                            releaseName={group.releaseName}
                                                            dateOptions={{ month: 'short', day: 'numeric' }}
                                                        />
                                                    </td>
                                                    <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap w-24" style={{ padding: "12px 16px" }}>
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
                                                    <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap w-24" style={{ padding: "12px 16px" }}>
                                                        <div className="flex flex-col gap-1 items-center">
                                                            {epic.readiness_status ? (
                                                                <span className={`text-xs font-medium ${
                                                                    epic.readiness_status === 'GO' ? 'text-green-700 font-semibold' : 'text-gray-700'
                                                                }`}>
                                                                    {epic.readiness_status === 'GO' ? 'GO' : 
                                                                     epic.readiness_status === 'NO_GO' ? 'NO GO' : 
                                                                     epic.readiness_status === 'CONDITIONAL_GO' ? 'Cond. GO' : 
                                                                     epic.readiness_status}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs font-medium" style={{ color: "#6B7280" }}>-</span>
                                                            )}
                                                            <span className="font-mono text-xs" style={{ color: "#6B7280" }}>
                                                                {epic.readiness_score !== null && epic.readiness_score !== undefined ? `${Math.round(epic.readiness_score * 100)}%` : '0%'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap" style={{ padding: "12px 16px" }}>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <span className="hidden md:inline-flex items-center gap-1 shrink-0">
                                                                {epic.risk_level && (
                                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${epic.risk_level === 'HIGH' ? 'bg-red-100 text-red-800' :
                                                                        epic.risk_level === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
                                                                            'bg-green-100 text-green-800'
                                                                        }`}>
                                                                        {epic.risk_level}
                                                                    </span>
                                                                )}
                                                                {(epic.criteria_red_flag_count ?? 0) > 0 && (
                                                                    <span className="inline-flex items-center gap-0.5" aria-label={`${epic.criteria_red_flag_count} criteria with No Go`}>
                                                                        {(epic.criteria_red_flag_names ?? Array.from({ length: epic.criteria_red_flag_count ?? 0 }, () => 'No Go criterion')).map((name, i) => (
                                                                            <Tooltip key={i} label={name} withArrow>
                                                                                <span className="rounded-full bg-red-500 shrink-0" style={{ width: 9, height: 9 }} aria-label={name} />
                                                                            </Tooltip>
                                                                        ))}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            {epic.aha_record_not_found && (
                                                                <Tooltip label="Record not found in Aha." withArrow>
                                                                    <span className="inline-flex text-red-600 shrink-0" aria-hidden>
                                                                        <IconAlertTriangle size={20} strokeWidth={2.5} />
                                                                    </span>
                                                                </Tooltip>
                                                            )}
                                                            {canArchiveEpic && (
                                                                <Tooltip label='Archive epic. This will set "ClearGO Candidate" to "No" in Aha.'>
                                                                    <button
                                                                        onClick={() => handleArchiveClick(epic.id, epic.name)}
                                                                        disabled={archivingEpicId === epic.id}
                                                                        className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center shrink-0"
                                                                    >
                                                                        {archivingEpicId === epic.id ? (
                                                                            <span className="text-xs">...</span>
                                                                        ) : (
                                                                            <IconArchive size={14} />
                                                                        )}
                                                                    </button>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }

            {/* Archive Confirmation Modal */}
            <Modal
                opened={archiveModalOpen}
                onClose={() => {
                    setArchiveModalOpen(false);
                    setEpicToArchive(null);
                }}
                title={
                    <div className="flex items-center gap-2">
                        <IconArchive size={20} className="text-gray-600" />
                        <span className="font-semibold" style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}>Archive Epic</span>
                    </div>
                }
                centered
                size="md"
            >
                <div className="space-y-4">
                    <Text size="sm" c="dimmed">
                        Archive <strong>"{epicToArchive?.name}"</strong>? This will set ClearGO Candidate to No in Aha and remove the epic from this list.
                    </Text>
                    <Alert icon={<IconAlertCircle size={16} />} title="Archived epics" color="blue" variant="light">
                        The epic will be archived in ClearGO. You can bring it back by setting ClearGO Candidate to Yes in Aha and syncing.
                    </Alert>
                    <Group justify="flex-end" mt="xl" gap="sm">
                        <Button
                            variant="subtle"
                            color="red"
                            onClick={handleDeleteEpic}
                            loading={archivingEpicId === epicToArchive?.id}
                            disabled={!!archivingEpicId}
                        >
                            Changed my mind, delete this
                        </Button>
                        <Button
                            color="gray"
                            onClick={handleArchiveConfirm}
                            leftSection={<IconArchive size={16} />}
                            disabled={!!archivingEpicId}
                        >
                            Archive Epic
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

        </div>
        </div>
    );
}

export default EpicsClient;