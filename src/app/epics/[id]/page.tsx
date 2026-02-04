"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Epic } from "@/types/epics";
import Link from "next/link";
import { useParams } from "next/navigation";
import Matrix from "@/components/Matrix";
import { createClient } from "@/lib/supabase/client";
import { Button, Select, Avatar, Group, Badge, Tabs, Tooltip, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconUsers } from "@tabler/icons-react";
import DecisionList from "@/components/DecisionList";
import EpicFieldsSidebar from "@/components/EpicFieldsSidebar";
import { fetchWithRateLimit, batchFetchWithRateLimit } from "@/lib/fetch-with-rate-limit";
import { PurpleLoader } from "@/components/PurpleLoader";
import { SuccessConfigSection } from "@/components/epic/SuccessConfigSection";
import { HeartDashboard } from "@/components/epic/HeartDashboard";
import { EpicMetricsManager } from "@/components/epic/EpicMetricsManager";
import { ScorecardPageContent } from "@/components/epic/ScorecardPageContent";
import { RetroPageContent } from "@/components/epic/RetroPageContent";
import type { EpicSuccessConfigWithDetails, EpicSuccessMetricWithDetails } from "@/lib/services/successMeasurementService";
import { EpicDetailTabs } from "@/components/EpicDetailTabs";
import { epicDetailCache } from "@/lib/cache/epic-detail-cache";
import { AIPruneReviewBanner } from "@/components/epic/AIPruneReviewBanner";
import { isEnabled, FEATURE_AI_PRUNING, FEATURE_NOT_APPLICABLE } from "@/lib/flags";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";

export default function EpicDetailPage() {
    const params = useParams();
    const id = params?.id as string | undefined;
    const { flags: featureFlags } = useFeatureFlags();

    if (!id) {
        return <div className="p-8">Invalid epic ID</div>;
    }

    const [epic, setEpic] = useState<Epic | null>(null);
    const [matrix, setMatrix] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshDecisions, setRefreshDecisions] = useState(0);
    const [updatingTier, setUpdatingTier] = useState(false);
    const [updatingRiskLevel, setUpdatingRiskLevel] = useState(false);
    const [pmOwner, setPmOwner] = useState<{ name?: string; email?: string; avatar_url?: string } | null>(null);
    const [releaseDate, setReleaseDate] = useState<string | null>(null);
    const [releaseName, setReleaseName] = useState<string | null>(null);
    const [fetchingReleaseDate, setFetchingReleaseDate] = useState(false);
    const [launchStages, setLaunchStages] = useState<Array<{ id: number; name: string; sort_order: number; duration_days: number | null }>>([]);
    const [stageDaysBeforeLaunch, setStageDaysBeforeLaunch] = useState<Map<number, number>>(new Map());
    const [stageDaysAfterLaunch, setStageDaysAfterLaunch] = useState<Map<number, number>>(new Map());
    const [instantiationFailed, setInstantiationFailed] = useState(false);
    const [instantiating, setInstantiating] = useState(false);
    const [criterionFilter, setCriterionFilter] = useState<'all' | 'overdue' | 'too_soon'>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
    const [activeTab, setActiveTab] = useState<string>('readiness');
    const [readinessThreshold, setReadinessThreshold] = useState<number | null>(null);
    const [showFieldsSidebar, setShowFieldsSidebar] = useState(false); // Hidden by default for faster load
    const [successConfig, setSuccessConfig] = useState<EpicSuccessConfigWithDetails | null>(null);
    const [successMetrics, setSuccessMetrics] = useState<EpicSuccessMetricWithDetails[]>([]);
    const [loadingSuccessData, setLoadingSuccessData] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    // Refs to track and cleanup async operations
    const attachmentFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingAttachmentRequestsRef = useRef<Set<string>>(new Set());
    const failedAttachmentRequestsRef = useRef<Set<string>>(new Set());
    const loadDataInProgressRef = useRef<boolean>(false);
    const loadDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastLoadDataRef = useRef<number>(0);

    const getInitials = (email: string) => {
        return email.substring(0, 2).toUpperCase();
    };

    const getAvatarColor = (email: string) => {
        const colors = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'indigo'];
        let hash = 0;
        for (let i = 0; i < email.length; i++) {
            hash = email.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const loadData = useCallback(async () => {
        // Prevent multiple simultaneous calls
        if (loadDataInProgressRef.current) {
            console.warn('loadData already in progress, skipping duplicate call');
            return;
        }

        // Debounce rapid successive calls (min 2000ms between calls to prevent loops)
        const now = Date.now();
        const timeSinceLastCall = now - lastLoadDataRef.current;
        if (timeSinceLastCall < 2000) {
            console.warn(`loadData called too soon (${timeSinceLastCall}ms ago), debouncing`);
            if (loadDataTimeoutRef.current) {
                clearTimeout(loadDataTimeoutRef.current);
            }
            loadDataTimeoutRef.current = setTimeout(() => {
                loadData();
            }, 2000 - timeSinceLastCall);
            return;
        }

        loadDataInProgressRef.current = true;
        lastLoadDataRef.current = Date.now();

        try {
            // Get current user email and create supabase client once
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) {
                setCurrentUserEmail(user.email);
            }

            // Use shared rate-limit-aware fetch utility
            const fetchWithRetry = (url: string) => fetchWithRateLimit(url, { maxRetries: 1 });


            // Priority 1: Critical data (epic, settings, criteria) - fetch first
            const [epicRes, settingsRes, criteriaRes] = await Promise.all([
                fetchWithRetry(`/api/epics/${id}`),
                fetchWithRetry('/api/settings'),
                fetchWithRetry('/api/criteria')
            ]);

            // Read responses immediately to avoid "body stream already read" errors
            let settingsData: any = null;
            let criteriaData: any = null;

            if (settingsRes.ok) {
                try {
                    settingsData = await settingsRes.json();
                } catch (err) {
                    console.warn('Failed to parse settings:', err);
                }
            }

            if (criteriaRes.ok) {
                try {
                    criteriaData = await criteriaRes.json();
                } catch (err) {
                    console.warn('Failed to parse criteria:', err);
                }
            }

            // Priority 2: Database queries (not rate limited) - can run in parallel with API calls
            const [matrixQuery, launchStagesQuery] = await Promise.all([
                supabase
                    .from('epic_criterion_status')
                    .select(`
                        *,
                        ai_prune_suggested,
                        ai_prune_reason,
                        criterion:criterion_id (
                            *,
                            decision_owner_email,
                            rating_timing
                        ),
                        decision_owner:decision_owner_id (
                            id,
                            email,
                            first_name,
                            last_name,
                            avatar_url
                        )
                    `)
                    .eq('epic_id', id),
                supabase
                    .from('launch_stages')
                    .select('id, name, sort_order, duration_days')
                    .order('sort_order', { ascending: true })
            ]);

            // Priority 3: Secondary data (batch fetch with delays) - non-critical
            const secondaryUrls = [
                `/api/epics/${id}/success/config`,
                `/api/epics/${id}/success/metrics`
            ].filter(Boolean) as string[];

            const secondaryResults = await batchFetchWithRateLimit(secondaryUrls, {
                batchSize: 2,
                batchDelay: 200,
                maxRetries: 1
            });

            // Map results back to expected format - handle null responses
            const successConfigResult = secondaryResults.find(r => r.url === `/api/epics/${id}/success/config`);
            const successConfigRes = successConfigResult?.response || { ok: false, json: async () => null };

            const successMetricsResult = secondaryResults.find(r => r.url === `/api/epics/${id}/success/metrics`);
            const successMetricsRes = successMetricsResult?.response || { ok: false, json: async () => [] };

            const releaseScheduleQuery = { data: null, error: null }; // Will be fetched conditionally

            // Process epic data
            if (!epicRes.ok) {
                let errorMessage = "Failed to fetch epic";
                try {
                    const errorData = await epicRes.json();
                    errorMessage = errorData.error || errorMessage;
                    if (errorData.details) {
                        errorMessage += `: ${errorData.details}`;
                    }
                } catch {
                    errorMessage = `Failed to fetch epic: ${epicRes.status} ${epicRes.statusText}`;
                }
                throw new Error(errorMessage);
            }
            const data = await epicRes.json();
            setEpic(data);

            // Process success config and metrics (already fetched in parallel)
            try {
                if (successConfigRes && successConfigRes.ok) {
                    const configData = await successConfigRes.json();
                    setSuccessConfig(configData);
                } else if (successConfigRes && (successConfigRes as any).status === 404) {
                    setSuccessConfig(null);
                }
            } catch (err) {
                console.warn('Failed to parse success config:', err);
            }

            try {
                if (successMetricsRes && successMetricsRes.ok) {
                    const metricsData = await successMetricsRes.json();
                    setSuccessMetrics(Array.isArray(metricsData) ? metricsData : []);
                } else {
                    setSuccessMetrics([]);
                }
            } catch (err) {
                console.warn('Failed to parse success metrics:', err);
                setSuccessMetrics([]);
            }

            // Process settings once (used for both threshold and pod mapping)
            // Check cache first, then use fetched data if needed
            let settings: any = epicDetailCache.getSettings();
            if (!settings && settingsData) {
                settings = settingsData;
                epicDetailCache.setSettings(settings);
            }

            let settingsMapping: Record<string, string> = {};
            if (settings) {
                settingsMapping = settings.pod_product_manager_mapping || {};

                // Set threshold immediately
                const tier = data.tier || 'TIER_3';
                const thresholds: Record<string, number> = {
                    'TIER_1': settings.threshold_tier1 || 0.9,
                    'TIER_2': settings.threshold_tier2 || 0.8,
                    'TIER_3': settings.threshold_tier3 || 0.7,
                };
                setReadinessThreshold(thresholds[tier] || 0.7);
            } else {
                // Fallback to defaults
                const tier = data.tier || 'TIER_3';
                const defaultThresholds: Record<string, number> = {
                    'TIER_1': 0.9,
                    'TIER_2': 0.8,
                    'TIER_3': 0.7,
                };
                setReadinessThreshold(defaultThresholds[tier] || 0.7);
            }

            // Process matrix data
            const { data: matrixData, error: matrixError } = matrixQuery;
            if (matrixError) throw matrixError;

            // Process criteria - check cache first
            let allActiveCriteria: any[] = epicDetailCache.getCriteria() || [];
            if (allActiveCriteria.length === 0 && criteriaData) {
                allActiveCriteria = (criteriaData.items || []).filter((c: any) => c.is_active === true);
                epicDetailCache.setCriteria(allActiveCriteria);
            }

            // Process launch stages - check cache first
            let cachedStages = epicDetailCache.getLaunchStages();
            let stagesData: any[] | null = null;
            let stagesError: any = null;

            if (cachedStages) {
                stagesData = cachedStages;
            } else {
                const queryResult = launchStagesQuery;
                stagesData = queryResult.data;
                stagesError = queryResult.error;
                if (!stagesError && stagesData) {
                    epicDetailCache.setLaunchStages(stagesData);
                }
            }

            let fetchedLaunchStages: Array<{ id: number; name: string; sort_order: number; duration_days: number | null }> = [];
            // Pre-calculate days-before-launch for each stage (optimization: calculate once, reuse many times)
            const calculatedDaysBeforeLaunch = new Map<number, number>();
            const calculatedDaysAfterLaunch = new Map<number, number>();

            if (!stagesError && stagesData) {
                fetchedLaunchStages = stagesData;
                setLaunchStages(stagesData);

                // Find the last pre-launch stage (Internal Readiness, sort_order 3)
                const lastPreLaunchStage = fetchedLaunchStages
                    .filter(stage => stage.duration_days !== null && stage.sort_order <= 3)
                    .sort((a, b) => b.sort_order - a.sort_order)[0];

                const lastPreLaunchSortOrder = lastPreLaunchStage?.sort_order ?? 3;

                // Pre-calculate days-before-launch for each pre-launch stage
                fetchedLaunchStages.forEach(stage => {
                    if (stage.sort_order <= lastPreLaunchSortOrder && stage.duration_days !== null) {
                        const targetStageDuration = stage.duration_days || 0;
                        const stagesAfterTarget = fetchedLaunchStages.filter(s =>
                            s.sort_order > stage.sort_order &&
                            s.sort_order <= lastPreLaunchSortOrder &&
                            s.duration_days !== null
                        );
                        const totalDaysBefore = targetStageDuration + stagesAfterTarget.reduce((sum, s) =>
                            sum + (s.duration_days || 0), 0
                        );
                        calculatedDaysBeforeLaunch.set(stage.id, totalDaysBefore);
                    } else if (stage.sort_order > lastPreLaunchSortOrder && stage.duration_days !== null) {
                        // Pre-calculate days-after-launch for post-launch stages
                        const stagesFromPreLaunchToTarget = fetchedLaunchStages.filter(s =>
                            s.sort_order > lastPreLaunchSortOrder &&
                            s.sort_order <= stage.sort_order &&
                            s.duration_days !== null
                        );
                        const totalDaysAfter = stagesFromPreLaunchToTarget.reduce((sum, s) =>
                            sum + (s.duration_days || 0), 0
                        );
                        calculatedDaysAfterLaunch.set(stage.id, totalDaysAfter);
                    }
                });

                // Store pre-calculated maps in state for reuse
                setStageDaysBeforeLaunch(calculatedDaysBeforeLaunch);
                setStageDaysAfterLaunch(calculatedDaysAfterLaunch);
            }

            // Fetch release schedule if needed (after we have epic data)
            const ahaFields = (data as any).aha_fields || {};
            const getReleaseName = (): string | null => {
                if (!ahaFields || typeof ahaFields !== 'object') return null;

                if (ahaFields.standard_fields && typeof ahaFields.standard_fields === 'object') {
                    const standardFields = ahaFields.standard_fields;
                    const releaseName = standardFields?.aha_release_name ||
                        standardFields?.release?.name || null;
                    if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
                        return releaseName.trim();
                    }
                }

                if (ahaFields.custom_fields && typeof ahaFields.custom_fields === 'object') {
                    const customFields = ahaFields.custom_fields;
                    const releaseName = customFields?.release_target_after_pod_planning;
                    if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
                        return releaseName.trim();
                    }
                }

                return null;
            };

            const extractedReleaseName = getReleaseName();
            setReleaseName(extractedReleaseName);
            let fetchedReleaseDate: string | null = null;
            if (extractedReleaseName) {
                const { data: releaseSchedule, error: releaseError } = await supabase
                    .from('release_schedule')
                    .select('launch_date')
                    .eq('release_name', extractedReleaseName)
                    .maybeSingle();

                // Check if we have a date in the schedule
                if (releaseSchedule?.launch_date) {
                    fetchedReleaseDate = releaseSchedule.launch_date;
                    setReleaseDate(releaseSchedule.launch_date);
                } else {
                    // Automatically fetch release date from API if not in schedule
                    setFetchingReleaseDate(true);
                    try {
                        console.log(`[Epic Detail] Fetching release date for: ${extractedReleaseName}`);
                        const releaseDatesRes = await fetch("/api/epics/release-dates", { credentials: 'include' });
                        if (releaseDatesRes.ok) {
                            const releaseDatesData = await releaseDatesRes.json();
                            console.log(`[Epic Detail] Release dates API response:`, releaseDatesData);
                            const releaseDates = releaseDatesData.releases || [];
                            const found = releaseDates.find((r: any) => r.releaseName === extractedReleaseName);
                            console.log(`[Epic Detail] Found release date:`, found);

                            if (found && found.launchDate) {
                                // Save to release_schedule
                                console.log(`[Epic Detail] Saving release date to schedule:`, { release_name: extractedReleaseName, launch_date: found.launchDate });
                                const saveRes = await fetch("/api/releases", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    credentials: 'include',
                                    body: JSON.stringify({
                                        release_name: extractedReleaseName,
                                        launch_date: found.launchDate,
                                    }),
                                });

                                if (saveRes.ok) {
                                    const savedData = await saveRes.json();
                                    console.log(`[Epic Detail] Successfully saved release date:`, savedData);
                                    fetchedReleaseDate = found.launchDate;
                                    setReleaseDate(found.launchDate);
                                } else {
                                    const errorData = await saveRes.json().catch(() => ({}));
                                    console.error("[Epic Detail] Failed to save release date:", errorData);
                                    setReleaseDate(null);
                                }
                            } else {
                                console.log(`[Epic Detail] No release date found for: ${extractedReleaseName}`);
                                setReleaseDate(null);
                            }
                        } else {
                            const errorData = await releaseDatesRes.json().catch(() => ({}));
                            console.error("[Epic Detail] Failed to fetch release dates:", errorData);
                            setReleaseDate(null);
                        }
                    } catch (error) {
                        console.error("[Epic Detail] Exception while fetching release date:", error);
                        setReleaseDate(null);
                    } finally {
                        setFetchingReleaseDate(false);
                    }
                }
            } else {
                setReleaseDate(null);
            }

            // NON-BLOCKING: Instantiate criteria in parallel (don't wait for it)
            // This allows the page to load faster while criteria are being instantiated
            fetch(`/api/epics/${id}/instantiate-criteria`, { method: 'POST' })
                .then(resp => {
                    if (!resp.ok) {
                        setInstantiationFailed(true);
                        notifications.show({
                            title: 'Could not populate criteria',
                            message: 'We were unable to instantiate criteria for this epic. You can retry below.',
                            color: 'orange',
                        });
                    } else {
                        setInstantiationFailed(false);
                    }
                })
                .catch(e => {
                    console.warn('Failed to instantiate criteria:', e);
                    setInstantiationFailed(true);
                });

            // Deduplicate by criterion_id (keep the most recently updated one)
            const deduplicated = (matrixData || []).reduce((acc: any[], item: any) => {
                const existing = acc.find((a: any) => a.criterion_id === item.criterion_id);
                if (!existing) {
                    acc.push(item);
                } else {
                    // Keep the one with the most recent last_updated_at
                    const existingDate = new Date(existing.last_updated_at || 0);
                    const itemDate = new Date(item.last_updated_at || 0);
                    if (itemDate > existingDate) {
                        const index = acc.indexOf(existing);
                        acc[index] = item;
                    }
                }
                return acc;
            }, []);

            const statusByCriterion = new Map<string, any>(
                deduplicated.map((it: any) => [it.criterion_id, it])
            );

            // Helper for applicability
            const applies = (app: 'ALL' | 'TIER_1_ONLY' | 'TIER_1_AND_2', tier: 'TIER_1' | 'TIER_2' | 'TIER_3') =>
                app === 'ALL' ||
                (app === 'TIER_1_ONLY' && tier === 'TIER_1') ||
                (app === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2'));

            // Merge: existing statuses + synthetic rows for non-applicable active criteria
            const merged: any[] = [...deduplicated];
            (allActiveCriteria || []).forEach((c: any) => {
                if (!statusByCriterion.has(c.id)) {
                    const isApplicable = c?.tier_applicability
                        ? applies(c.tier_applicability as any, (data.tier as any))
                        : true;
                    const notReq = !isApplicable;
                    // Add all criteria that don't have status rows yet (both applicable and non-applicable)
                    merged.push({
                        id: `virtual-${c.id}`,
                        criterion_id: c.id,
                        status: 'NOT_SET',
                        current_status_notes: null,
                        last_updated_at: null,
                        criterion: c,
                        notRequired: notReq,
                    });
                }
            });


            // Annotate applicability for existing statuses
            const withApplicability = merged.map((item: any) => ({
                ...item,
                notRequired: item.notRequired === true || (item?.criterion?.tier_applicability
                    ? !applies(item.criterion.tier_applicability as any, (data.tier as any))
                    : false),
            }));

            // Sort by criterion sort_order
            const sorted = withApplicability.sort((a: any, b: any) =>
                (a.criterion?.sort_order || 0) - (b.criterion?.sort_order || 0)
            );

            // Resolve approver emails using pod mapping if needed
            const podRaw = (data as any).pod || ahaFields.custom_fields?.dev_backlog_pod || null;
            const pod = podRaw ? String(podRaw).trim() : null;

            // Debug logging
            if (pod) {
                console.log('Pod value:', pod);
                console.log('Pod mapping keys:', Object.keys(settingsMapping));
                console.log('Pod mapping:', settingsMapping);
                console.log('Matched PM email:', settingsMapping[pod]);
            }

            // Resolve PM owner: prioritize pod mapping since that's the source of truth for PM assignment
            // We'll resolve this after we've processed the matrix to also check PM criteria approvers

            // Get unique approver emails first (including delegated approvers)
            const approverEmails = new Set<string>();
            sorted.forEach((item: any) => {
                // Priority: decision_owner_id (delegated) > criterion template email > pod mapping > AHA assigned user
                let approverEmail: string | null = null;

                if (item.decision_owner?.email) {
                    // Use delegated approver if available
                    approverEmail = item.decision_owner.email;
                } else {
                    // Fall back to criterion template
                    const criterionEmail = item.criterion?.decision_owner_email;

                    // If it's a placeholder, resolve using pod mapping
                    if (criterionEmail === "[name of pod's product manager]" || (criterionEmail && criterionEmail.toLowerCase().includes("pod"))) {
                        if (pod) {
                            // Normalize pod name (trim whitespace)
                            const normalizedPod = pod.trim();

                            // Try exact match first
                            if (settingsMapping[normalizedPod]) {
                                approverEmail = settingsMapping[normalizedPod];
                            } else {
                                // Try case-insensitive match
                                const podLower = normalizedPod.toLowerCase();
                                const matchingKey = Object.keys(settingsMapping).find(key => key.toLowerCase() === podLower);
                                if (matchingKey && settingsMapping[matchingKey]) {
                                    approverEmail = settingsMapping[matchingKey];
                                }
                            }
                        }

                        // If pod mapping failed, try AHA assigned user as fallback
                        if (!approverEmail) {
                            const assignedUser = ahaFields?.standard_fields?.assigned_to_user;
                            if (assignedUser?.email) {
                                approverEmail = assignedUser.email;
                            }
                        }
                    } else if (criterionEmail) {
                        // Not a placeholder, use criterion email directly
                        approverEmail = criterionEmail;
                    }
                }

                // Only add to approverEmails if it's a real email (not a placeholder)
                if (approverEmail && approverEmail !== "[name of pod's product manager]" && approverEmail.includes("@")) {
                    approverEmails.add(approverEmail);
                }
            });

            // Collect PM email for batching with approver emails (using pod already declared above)
            let pmEmail: string | null = null;
            if (pod && settingsMapping[pod]) {
                pmEmail = settingsMapping[pod];
            } else if (pod) {
                const podLower = pod.toLowerCase();
                const matchingKey = Object.keys(settingsMapping).find(key => key.toLowerCase() === podLower);
                if (matchingKey && settingsMapping[matchingKey]) {
                    pmEmail = settingsMapping[matchingKey];
                }
            }

            // If no PM email from pod mapping, try Aha assigned user
            if (!pmEmail) {
                const assignedUser = ahaFields?.standard_fields?.assigned_to_user;
                if (assignedUser?.email) {
                    pmEmail = assignedUser.email;
                }
            }

            // Batch fetch user info for all approver emails AND PM owner in a single API call
            const userInfoMap: Record<string, { first_name?: string; last_name?: string; avatar_url?: string }> = {};
            const allEmailsToFetch = new Set(approverEmails);
            if (pmEmail && pmEmail.includes("@")) {
                allEmailsToFetch.add(pmEmail);
            }

            if (allEmailsToFetch.size > 0) {
                try {
                    const emailsParam = Array.from(allEmailsToFetch).join(',');
                    const userInfoRes = await fetch(`/api/users/by-email?emails=${encodeURIComponent(emailsParam)}`);
                    if (userInfoRes.ok) {
                        const fetchedUserMap = await userInfoRes.json();
                        // Merge fetched user info into userInfoMap
                        Object.keys(fetchedUserMap).forEach(email => {
                            userInfoMap[email.toLowerCase()] = fetchedUserMap[email];
                        });

                        // Set PM owner if we have the email
                        if (pmEmail) {
                            const pmInfo = userInfoMap[pmEmail.toLowerCase()];
                            if (pmInfo) {
                                setPmOwner({
                                    email: pmEmail,
                                    name: pmInfo.first_name && pmInfo.last_name
                                        ? `${pmInfo.first_name} ${pmInfo.last_name}`
                                        : pmInfo.first_name || pmInfo.last_name || undefined,
                                    avatar_url: pmInfo.avatar_url,
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to fetch user info from API:', e);
                }
            }

            // Calculate due dates for criteria based on rating_timing and launch stages
            // Use fetched values directly instead of state (state updates are async)
            const targetDate = fetchedReleaseDate || data.target_launch_date || null;

            // Memoization cache for calculateDueDate to avoid redundant calculations
            const dueDateCache = new Map<number, string | null>();

            const calculateDueDate = (ratingTimingId: number | null | undefined): string | null => {
                if (!targetDate || !ratingTimingId || fetchedLaunchStages.length === 0) {
                    return null;
                }

                // Check cache first
                if (dueDateCache.has(ratingTimingId)) {
                    return dueDateCache.get(ratingTimingId)!;
                }

                // Use pre-calculated values from local variables (state updates are async)
                const daysBefore = calculatedDaysBeforeLaunch.get(ratingTimingId);
                const daysAfter = calculatedDaysAfterLaunch.get(ratingTimingId);

                if (daysBefore === undefined && daysAfter === undefined) {
                    // Stage not found in pre-calculated maps
                    dueDateCache.set(ratingTimingId, null);
                    return null;
                }

                const dueDate = new Date(targetDate);

                if (daysBefore !== undefined) {
                    // Pre-launch stage: subtract days before launch
                    dueDate.setDate(dueDate.getDate() - daysBefore);
                } else if (daysAfter !== undefined) {
                    // Post-launch stage: add days after launch
                    dueDate.setDate(dueDate.getDate() + daysAfter);
                }

                const result = dueDate.toISOString().split('T')[0];
                // Cache the result
                dueDateCache.set(ratingTimingId, result);
                return result; // Return as YYYY-MM-DD
            };

            // LAZY LOAD: Initialize with empty data, fetch after initial render (non-blocking)
            // This dramatically improves initial page load time
            const commentsData: Record<string, { count: number; lastComment?: any }> = {};
            const attachmentsData: Record<string, number> = {};

            // Initialize with empty data
            sorted.forEach((item: any) => {
                commentsData[item.id] = { count: 0 };
                attachmentsData[item.id] = 0;
            });

            // Fetch comments/attachments AFTER initial render (non-blocking)
            // This allows the page to show immediately while counts load in background
            const itemIds = sorted.map((item: any) => item.id);

            if (itemIds.length > 0) {
                // Clear any existing timeout to prevent duplicate requests
                if (attachmentFetchTimeoutRef.current) {
                    clearTimeout(attachmentFetchTimeoutRef.current);
                }

                // Use setTimeout to defer until after initial render
                attachmentFetchTimeoutRef.current = setTimeout(() => {
                    // Filter out virtual IDs - they don't have status rows and can't have comments/attachments
                    const realItemIds = itemIds.filter((itemId: string) => !itemId.startsWith('virtual-'));

                    // Use optimized batch counts API to fetch all comment and attachment counts in a single request
                    fetch(`/api/epics/${id}/criteria/counts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ statusIds: itemIds })
                    }).then(async (res) => {
                        if (!res.ok) {
                            console.warn('Failed to fetch batch counts:', res.status);
                            return;
                        }

                        try {
                            const countsData = await res.json();

                            // Process counts data and update matrix in a single state update
                            setMatrix(prevMatrix => prevMatrix.map((item: any) => {
                                const counts = countsData[item.id] || { commentCount: 0, attachmentCount: 0 };
                                return {
                                    ...item,
                                    commentCount: counts.commentCount || 0,
                                    attachmentCount: counts.attachmentCount || 0,
                                    ...(counts.lastComment ? { lastComment: counts.lastComment } : {}),
                                };
                            }));
                        } catch (e) {
                            console.warn('Failed to parse batch counts:', e);
                        }
                    }).catch((err) => {
                        console.warn('Failed to fetch batch counts:', err);
                    });
                }, 100); // Small delay to let initial render complete
            }

            const resolvedMatrix = sorted.map((item: any) => {
                // Priority: decision_owner_id (delegated) > criterion template email > pod mapping > AHA assigned user
                let approverEmail: string | null = null;
                let approverInfo: { first_name?: string; last_name?: string; avatar_url?: string } | null = null;

                if (item.decision_owner?.email) {
                    // Use delegated approver if available
                    approverEmail = item.decision_owner.email;
                    approverInfo = {
                        first_name: item.decision_owner.first_name || undefined,
                        last_name: item.decision_owner.last_name || undefined,
                        avatar_url: item.decision_owner.avatar_url || undefined,
                    };
                } else {
                    // Fall back to criterion template
                    const criterionEmail = item.criterion?.decision_owner_email;

                    // If it's a placeholder, resolve using pod mapping
                    if (criterionEmail === "[name of pod's product manager]" || (criterionEmail && criterionEmail.toLowerCase().includes("pod"))) {
                        if (pod) {
                            // Normalize pod name (trim whitespace)
                            const normalizedPod = pod.trim();

                            // Try exact match first
                            if (settingsMapping[normalizedPod]) {
                                approverEmail = settingsMapping[normalizedPod];
                            } else {
                                // Try case-insensitive match
                                const podLower = normalizedPod.toLowerCase();
                                const matchingKey = Object.keys(settingsMapping).find(key => key.toLowerCase() === podLower);
                                if (matchingKey && settingsMapping[matchingKey]) {
                                    approverEmail = settingsMapping[matchingKey];
                                }
                            }
                        }

                        // If pod mapping failed, try AHA assigned user as fallback
                        if (!approverEmail) {
                            const assignedUser = ahaFields?.standard_fields?.assigned_to_user;
                            if (assignedUser?.email) {
                                approverEmail = assignedUser.email;
                            }
                        }
                    } else if (criterionEmail) {
                        // Not a placeholder, use criterion email directly
                        approverEmail = criterionEmail;
                    }

                    // Get approver info from userInfoMap
                    if (approverEmail && approverEmail !== "[name of pod's product manager]" && approverEmail.includes("@")) {
                        approverInfo = userInfoMap[approverEmail.toLowerCase()] || null;
                    }
                }

                // Calculate due date based on rating_timing
                // If rating_timing is set, always calculate (override stored date)
                // Otherwise, use stored date if available
                const calculatedDueDate = calculateDueDate(item.criterion?.rating_timing);
                const finalDueDate = calculatedDueDate || item.condition_due_date || null;

                // Get comments and attachments data for this item
                const commentsInfo = commentsData[item.id] || { count: 0 };
                const attachmentCount = attachmentsData[item.id] || 0;

                return {
                    ...item,
                    approverEmail,
                    approverInfo,
                    notRequired: item.notRequired === true,
                    condition_due_date: finalDueDate,
                    commentCount: commentsInfo.count,
                    lastComment: commentsInfo.lastComment,
                    attachmentCount,
                };
            });

            setMatrix(resolvedMatrix);

            // PM owner email resolution is already done above (pmEmail variable)
            // Now check if we need to fetch PM owner info (if not already fetched in batch)
            // Third priority: get it from Product Management & Documentation Foundation criteria if not found earlier
            if (!pmEmail) {
                const pmFoundationItems = resolvedMatrix.filter((item: any) => {
                    const category = item.criterion?.category;
                    return category && category.toLowerCase().includes('product management') && category.toLowerCase().includes('documentation');
                });

                if (pmFoundationItems.length > 0 && pmFoundationItems[0].approverEmail) {
                    pmEmail = pmFoundationItems[0].approverEmail;
                }
            }

            // Fetch PM owner info if email is available and wasn't already fetched in batch
            if (pmEmail) {
                // Check if PM owner was already set from batch fetch above
                const pmInfoFromBatch = userInfoMap[pmEmail.toLowerCase()];
                if (pmInfoFromBatch) {
                    // Already fetched in batch, just set it
                    setPmOwner({
                        email: pmEmail,
                        name: pmInfoFromBatch.first_name && pmInfoFromBatch.last_name
                            ? `${pmInfoFromBatch.first_name} ${pmInfoFromBatch.last_name}`
                            : pmInfoFromBatch.first_name || pmInfoFromBatch.last_name || undefined,
                        avatar_url: pmInfoFromBatch.avatar_url,
                    });
                } else {
                    // Not in batch (e.g., found from PM Foundation criteria), fetch separately
                    const normalizedEmail = pmEmail.toLowerCase().trim();
                    try {
                        const pmUserRes = await fetch(`/api/users/by-email?emails=${encodeURIComponent(normalizedEmail)}`);
                        if (pmUserRes.ok) {
                            const pmUserMap = await pmUserRes.json();
                            const pmUser = pmUserMap[normalizedEmail];

                            if (pmUser) {
                                const fullName = [pmUser.first_name, pmUser.last_name]
                                    .filter(Boolean)
                                    .join(' ')
                                    .trim();

                                setPmOwner({
                                    name: fullName || undefined,
                                    email: pmEmail,
                                    avatar_url: pmUser.avatar_url || undefined
                                });
                            } else {
                                // If user not found, use email
                                setPmOwner({ email: pmEmail });
                            }
                        } else {
                            // If API call failed, use email
                            setPmOwner({ email: pmEmail });
                        }
                    } catch (e) {
                        console.warn('Error fetching PM owner info:', e);
                        // If error, use email
                        setPmOwner({ email: pmEmail });
                    }
                }
            } else {
                setPmOwner(null);
            }

        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
            loadDataInProgressRef.current = false;
        }
    }, [id]);

    const fetchSuccessData = useCallback(async () => {
        if (!id) return;
        setLoadingSuccessData(true);
        try {
            // Fetch success config and metrics in parallel
            const [configRes, metricsRes] = await Promise.all([
                fetchWithRateLimit(`/api/epics/${id}/success/config`, { maxRetries: 1 }),
                fetchWithRateLimit(`/api/epics/${id}/success/metrics`, { maxRetries: 1 }),
            ]);

            if (configRes.ok) {
                const configData = await configRes.json();
                setSuccessConfig(configData);
            } else if (configRes.status !== 404) {
                let errorDetails = configRes.statusText;
                try {
                    const errorData = await configRes.json();
                    errorDetails = errorData.details || errorData.error || configRes.statusText;
                    console.error('Error fetching success config:', errorDetails);
                    if (errorData.stack && process.env.NODE_ENV === 'development') {
                        console.error('Error stack:', errorData.stack);
                    }
                    if (errorData.code && process.env.NODE_ENV === 'development') {
                        console.error('Error code:', errorData.code);
                    }
                } catch {
                    console.error('Error fetching success config:', configRes.statusText);
                }
            } else {
                setSuccessConfig(null);
            }

            if (metricsRes.ok) {
                const metricsData = await metricsRes.json();
                setSuccessMetrics(Array.isArray(metricsData) ? metricsData : []);
            } else {
                let errorDetails = metricsRes.statusText;
                try {
                    const errorData = await metricsRes.json();
                    errorDetails = errorData.details || errorData.error || metricsRes.statusText;
                    console.error('Error fetching success metrics:', errorDetails);
                    if (errorData.stack && process.env.NODE_ENV === 'development') {
                        console.error('Error stack:', errorData.stack);
                    }
                } catch {
                    console.error('Error fetching success metrics:', metricsRes.statusText);
                }
                setSuccessMetrics([]);
            }

            // Check if user is admin
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) {
                const { data: me } = await supabase
                    .from('app_user')
                    .select('roles')
                    .eq('email', user.email)
                    .single();
                const userRoles = (me?.roles as string[]) || [];
                setIsAdmin(
                    userRoles.includes('SUPERADMIN') ||
                    userRoles.includes('PRODUCT_OPS') ||
                    userRoles.includes('CPO')
                );
            }
        } catch (error) {
            console.error('Error fetching success data:', error);
        } finally {
            setLoadingSuccessData(false);
        }
    }, [id]);

    // Track the last epic ID we fetched success data for to prevent infinite loops
    const lastFetchedEpicIdRef = useRef<string | null>(null);
    const epicIdString = useMemo(() => epic?.id ? String(epic.id) : null, [epic?.id]);

    // Success data is now fetched in parallel with initial load, so we don't need a separate useEffect
    // The fetchSuccessData function is kept for manual refresh scenarios (e.g., when user clicks refresh button)

    useEffect(() => {
        if (id) {
            // Clear any pending attachment requests when loading new data
            pendingAttachmentRequestsRef.current.clear();
            failedAttachmentRequestsRef.current.clear();

            // Clear any pending loadData timeout
            if (loadDataTimeoutRef.current) {
                clearTimeout(loadDataTimeoutRef.current);
                loadDataTimeoutRef.current = null;
            }

            // Reset loadData in progress flag
            loadDataInProgressRef.current = false;

            loadData();
        }

        // Cleanup function to clear timeouts on unmount or when id changes
        return () => {
            if (attachmentFetchTimeoutRef.current) {
                clearTimeout(attachmentFetchTimeoutRef.current);
                attachmentFetchTimeoutRef.current = null;
            }
            if (loadDataTimeoutRef.current) {
                clearTimeout(loadDataTimeoutRef.current);
                loadDataTimeoutRef.current = null;
            }
            pendingAttachmentRequestsRef.current.clear();
            loadDataInProgressRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Update threshold when epic tier changes
    useEffect(() => {
        const currentTier = epic?.tier;
        if (!currentTier) return;

        async function updateThreshold(tier: string) {
            try {
                const settingsRes = await fetch('/api/settings');
                if (settingsRes.ok) {
                    const settings = await settingsRes.json();
                    const thresholds: Record<string, number> = {
                        'TIER_1': settings.threshold_tier1 || 0.9,
                        'TIER_2': settings.threshold_tier2 || 0.8,
                        'TIER_3': settings.threshold_tier3 || 0.7,
                    };
                    setReadinessThreshold(thresholds[tier] || 0.7);
                }
            } catch (e) {
                console.warn('Failed to fetch settings for threshold:', e);
                // Fallback to defaults
                const defaultThresholds: Record<string, number> = {
                    'TIER_1': 0.9,
                    'TIER_2': 0.8,
                    'TIER_3': 0.7,
                };
                setReadinessThreshold(defaultThresholds[tier] || 0.7);
            }
        }

        updateThreshold(currentTier);
    }, [epic?.tier]);

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <PurpleLoader size="md" />
            </div>
        );
    }
    if (error) {
        return <div className="p-8 text-red-600">Error: {error}</div>;
    }
    if (!epic) {
        return <div className="p-8">Epic not found</div>;
    }

    async function handleTierUpdate(newTier: string | null) {
        console.log('handleTierUpdate called with:', newTier, 'current tier:', epic?.tier);
        if (!newTier || !epic || newTier === epic.tier) {
            console.log('Early return: newTier=', newTier, 'epic=', epic, 'newTier === epic.tier', epic ? newTier === epic.tier : false);
            return;
        }

        setUpdatingTier(true);
        try {
            console.log('Sending PATCH request to update tier:', newTier);
            const res = await fetch(`/api/epics/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier: newTier }),
            });

            console.log('Response status:', res.status, 'ok:', res.ok);

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Failed to update tier' }));
                console.error('API error:', errorData);
                throw new Error(errorData.error || `HTTP ${res.status}: Failed to update tier`);
            }

            const updatedEpic = await res.json();
            console.log('Updated epic:', updatedEpic);
            setEpic(updatedEpic);

            notifications.show({
                title: 'Tier updated',
                message: `Epic tier has been updated to ${newTier.replace('_', ' ')}`,
                color: 'green',
            });

            // Reload matrix data as tier change may affect criteria
            await loadData();
        } catch (error: any) {
            console.error('Error updating tier:', error);
            notifications.show({
                title: 'Error',
                message: error.message || 'Failed to update tier',
                color: 'red',
            });
        } finally {
            setUpdatingTier(false);
        }
    }

    async function retryInstantiate() {
        if (!id) return;
        setInstantiating(true);
        try {
            const resp = await fetch(`/api/epics/${id}/instantiate-criteria`, { method: 'POST' });
            if (!resp.ok) throw new Error('Instantiate failed');
            setInstantiationFailed(false);
            notifications.show({ title: 'Criteria populated', message: 'Applicable criteria were added to this epic.', color: 'green' });
            await loadData();
        } catch (e: any) {
            notifications.show({ title: 'Retry failed', message: e?.message || 'Could not populate criteria', color: 'red' });
        } finally {
            setInstantiating(false);
        }
    }

    async function handleRiskLevelUpdate(newRiskLevel: string | null) {
        if (!newRiskLevel || !epic || newRiskLevel === epic.risk_level) return;

        setUpdatingRiskLevel(true);
        try {
            const res = await fetch(`/api/epics/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ risk_level: newRiskLevel }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Failed to update risk level' }));
                throw new Error(errorData.error || `HTTP ${res.status}: Failed to update risk level`);
            }

            const updatedEpic = await res.json();
            setEpic(updatedEpic);

            notifications.show({
                title: 'Risk level updated',
                message: `Epic risk level has been updated to ${newRiskLevel}`,
                color: 'green',
            });
        } catch (error: any) {
            console.error('Error updating risk level:', error);
            notifications.show({
                title: 'Error',
                message: error.message || 'Failed to update risk level',
                color: 'red',
            });
        } finally {
            setUpdatingRiskLevel(false);
        }
    }

    return (
        <div className="flex">
            <div className="flex-1 sm:px-6 lg:px-8" style={{
                maxWidth: 'var(--page-container-max-width)',
                margin: '0 auto',
                paddingLeft: 'var(--page-container-padding-x)',
                paddingRight: 'var(--page-container-padding-x)',
                paddingTop: 'var(--page-container-padding-top)',
                paddingBottom: 'var(--spacing-8)'
            }}>
                <div className="mb-1">
                    <Link
                        href="/epics"
                        style={{
                            color: 'var(--color-blue-600)',
                            fontSize: 'var(--font-size-sm)',
                            fontFamily: 'var(--font-body)',
                            textDecoration: 'none'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--color-blue-800)';
                            e.currentTarget.style.textDecoration = 'underline';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--color-blue-600)';
                            e.currentTarget.style.textDecoration = 'none';
                        }}
                    >← Back to Epics</Link>
                </div>

                <div className="flex justify-between items-center mb-4">
                    <div className="flex-1">
                        <h1 style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: 'var(--font-size-page-title)',
                            fontWeight: 'var(--font-weight-bold)',
                            color: 'var(--color-gray-900)',
                            marginBottom: 0
                        }}>{epic.name}</h1>
                        <div className="flex gap-2 items-center flex-wrap">
                            {pmOwner && pmOwner.email && (
                                <Tooltip label="Product Owner" withArrow>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: 'var(--spacing-1) var(--spacing-2)',
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-medium)',
                                        backgroundColor: 'var(--color-blue-100)',
                                        color: 'var(--color-blue-800)',
                                        borderRadius: 'var(--radius-base)',
                                        cursor: 'help',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        <IconUsers size={14} />
                                        {pmOwner.name || pmOwner.email}
                                    </span>
                                </Tooltip>
                            )}
                            {(() => {
                                const ahaFields = (epic as any)?.aha_fields || {};
                                const pod = (epic as any)?.pod || ahaFields?.custom_fields?.dev_backlog_pod || null;
                                return pod ? (
                                    <span style={{
                                        padding: 'var(--spacing-1) var(--spacing-2)',
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-medium)',
                                        backgroundColor: 'var(--color-blue-100)',
                                        color: 'var(--color-blue-800)',
                                        borderRadius: 'var(--radius-base)',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        {String(pod).trim()}
                                    </span>
                                ) : null;
                            })()}
                            <Select
                                value={epic.tier}
                                onChange={handleTierUpdate}
                                data={[
                                    { value: 'TIER_1', label: 'Tier 1 (Major)' },
                                    { value: 'TIER_2', label: 'Tier 2 (Significant)' },
                                    { value: 'TIER_3', label: 'Tier 3 (Minor)' },
                                ]}
                                disabled={updatingTier}
                                size="xs"
                                style={{ width: 150 }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{
                                    padding: 'var(--spacing-1) var(--spacing-2)',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    backgroundColor: 'var(--color-gray-100)',
                                    color: 'var(--color-gray-700)',
                                    borderRadius: 'var(--radius-base)',
                                    fontFamily: 'var(--font-body)'
                                }}>
                                    {epic.status}
                                </span>
                                <Tooltip
                                    label={
                                        <div style={{ maxWidth: '300px' }}>
                                            <div style={{ fontWeight: 600, marginBottom: '8px' }}>How is status determined?</div>
                                            <div style={{ fontSize: '12px', lineHeight: '1.5' }}>
                                                Status is derived from launch date, GA date, and retro completion. Only Cancelled is set manually.
                                                <br /><br />
                                                <strong>Pre_Release:</strong> Before target launch date
                                                <br />
                                                <strong>Released_Cohort_1:</strong> After launch, before GA date
                                                <br />
                                                <strong>Released_GA:</strong> After GA, before all retros (30/60/90) submitted
                                                <br />
                                                <strong>Released_Retroed:</strong> After GA and all retros submitted
                                                <br />
                                                <strong>Cancelled:</strong> Set manually
                                            </div>
                                        </div>
                                    }
                                    withArrow
                                    multiline
                                >
                                    <IconInfoCircle
                                        size={14}
                                        style={{
                                            color: 'var(--color-gray-400)',
                                            cursor: 'help'
                                        }}
                                    />
                                </Tooltip>
                            </div>

                        </div>
                    </div>
                    <div className="ml-6 flex-shrink-0" style={{ alignSelf: 'center' }}>
                        <div style={{
                            display: 'flex',
                            gap: 'var(--spacing-2)',
                            alignItems: 'center'
                        }}>
                            <Button
                                size="xs"
                                variant={showFieldsSidebar ? "filled" : "outline"}
                                onClick={() => setShowFieldsSidebar(!showFieldsSidebar)}
                                styles={{
                                    root: {
                                        fontFamily: 'var(--font-body)',
                                        fontSize: 'var(--font-size-sm)'
                                    }
                                }}
                            >
                                {showFieldsSidebar ? 'Hide' : 'Show'} Aha! Fields
                            </Button>
                            {epic?.aha_url && (
                                <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => window.open(epic.aha_url, '_blank', 'noopener,noreferrer')}
                                    styles={{
                                        root: {
                                            fontFamily: 'var(--font-body)',
                                            fontSize: 'var(--font-size-sm)'
                                        }
                                    }}
                                >
                                    Show Epic in Aha!
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-6" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 'var(--spacing-6)',
                    alignItems: 'start'
                }}>
                    {(() => {
                        const targetDate = releaseDate || epic.target_launch_date;
                        let goNoGoDate: Date | null = null;
                        if (targetDate) {
                            let totalDurationDays = 0;

                            if (launchStages.length > 0) {
                                // Target release date is the beginning of Cohort 1 Live (sort_order 3)
                                // Go/No-Go date should only consider pre-launch phases (before Cohort 1 Live)
                                // This includes: GTM Access (sort_order 1) + Internal Readiness (sort_order 2)
                                totalDurationDays = launchStages
                                    .filter(stage =>
                                        stage.duration_days !== null &&
                                        stage.sort_order < 3 // Only stages before Cohort 1 Live
                                    )
                                    .reduce((sum, stage) => sum + (stage.duration_days || 0), 0);
                            }

                            if (totalDurationDays === 0) {
                                totalDurationDays = 35; // Default: GTM Access (14) + Internal Readiness (21)
                            }

                            goNoGoDate = new Date(targetDate);
                            goNoGoDate.setDate(goNoGoDate.getDate() - totalDurationDays);
                        }
                        return (
                            <>
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'var(--spacing-1)',
                                    textAlign: 'right'
                                }}>
                                    <div style={{
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-medium)',
                                        color: 'var(--color-gray-500)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        fontFamily: 'var(--font-body)'
                                    }}>Target Release Date</div>
                                    <div style={{
                                        fontSize: '17px',
                                        fontWeight: 'var(--font-weight-bold)',
                                        color: 'var(--color-gray-900)',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        {releaseDate ? new Date(releaseDate).toLocaleDateString() : epic.target_launch_date ? new Date(epic.target_launch_date).toLocaleDateString() : 'Not set'}
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'var(--spacing-1)',
                                    textAlign: 'right'
                                }}>
                                    <div style={{
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-medium)',
                                        color: 'var(--color-gray-500)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        fontFamily: 'var(--font-body)'
                                    }}>Approx Go/NoGo Date</div>
                                    <div style={{
                                        fontSize: '17px',
                                        fontWeight: 'var(--font-weight-bold)',
                                        color: 'var(--color-gray-900)',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        {goNoGoDate ? goNoGoDate.toLocaleDateString() : 'Not set'}
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'var(--spacing-1)',
                                    textAlign: 'right'
                                }}>
                                    <div style={{
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-medium)',
                                        color: 'var(--color-gray-500)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        fontFamily: 'var(--font-body)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-end',
                                        gap: 'var(--spacing-1)'
                                    }}>
                                        Readiness Score
                                        <Tooltip
                                            label={
                                                <div style={{ maxWidth: '300px' }}>
                                                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>How is this calculated?</div>
                                                    <div style={{ fontSize: '12px', lineHeight: '1.5' }}>
                                                        The readiness score measures how complete your launch preparation is. Criteria are grouped into categories (like Technical, Legal, Marketing). Within each category, each criterion gets a score: GO = 100%, CONDITIONAL = 50%, NO_GO or NOT_SET = 0%. Gate criteria (must-have items) count 3 times more than regular criteria. If a category has a signoff that's GO, all criteria in that category are treated as GO. We then average the scores across all categories (each category has equal weight). The score is capped lower if there are gate blockers or missing criteria.
                                                    </div>
                                                </div>
                                            }
                                            withArrow
                                            multiline
                                        >
                                            <IconInfoCircle
                                                size={14}
                                                style={{
                                                    color: 'var(--color-gray-400)',
                                                    cursor: 'help'
                                                }}
                                            />
                                        </Tooltip>
                                    </div>
                                    <div style={{
                                        fontSize: '17px',
                                        fontWeight: 'var(--font-weight-bold)',
                                        color: 'var(--color-gray-900)',
                                        fontFamily: 'var(--font-body)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-end',
                                        gap: 'var(--spacing-1)'
                                    }}>
                                        {matrix.length === 0 ? 'N/A' : (typeof epic.readiness_score === 'number' ? `${Math.round(epic.readiness_score * 100)}%` : 'N/A')}
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'var(--spacing-1)',
                                    textAlign: 'right'
                                }}>
                                    <div style={{
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-medium)',
                                        color: 'var(--color-gray-500)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        fontFamily: 'var(--font-body)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-end',
                                        gap: 'var(--spacing-1)'
                                    }}>
                                        <div>
                                            Readiness Status
                                            <br />
                                            <span style={{ textTransform: 'none', fontSize: '0.9em', fontWeight: 'normal' }}>aka "Are we ready to release?"</span>
                                        </div>
                                        <Tooltip
                                            label={
                                                <div style={{ maxWidth: '250px' }}>
                                                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Readiness Status</div>
                                                    <div style={{ fontSize: '12px' }}>
                                                        Answers: "Can we launch now?" Based on criteria completion, thresholds, and gate blockers. GO = ready, NO GO = not ready, Cond. GO = ready with conditions.
                                                    </div>
                                                </div>
                                            }
                                            withArrow
                                            multiline
                                        >
                                            <IconInfoCircle
                                                size={14}
                                                style={{
                                                    color: 'var(--color-gray-400)',
                                                    cursor: 'help'
                                                }}
                                            />
                                        </Tooltip>
                                    </div>
                                    <div style={{
                                        fontSize: '17px',
                                        fontWeight: 'var(--font-weight-bold)',
                                        color: 'var(--color-gray-900)',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        {matrix.length === 0 ? 'Not evaluated' : (epic.readiness_status || 'NO GO')}
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'var(--spacing-1)',
                                    textAlign: 'right'
                                }}>
                                    <div style={{
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-medium)',
                                        color: 'var(--color-gray-500)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        fontFamily: 'var(--font-body)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-end',
                                        gap: 'var(--spacing-1)'
                                    }}>
                                        Risk Level
                                        <Tooltip
                                            label={
                                                <div style={{ maxWidth: '300px' }}>
                                                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>How is this calculated?</div>
                                                    <div style={{ fontSize: '12px', lineHeight: '1.5' }}>
                                                        Risk is calculated from multiple factors that add up to a score (0-100 points). Days to launch: More points if launching soon (up to 40 points). Readiness status: NO_GO adds 30 points, CONDITIONAL adds 20 points. Readiness score below threshold: Up to 20 points based on how far below. Gate blockers: Adds 30 points if any gate criteria are NO_GO. Overdue criteria: Up to 20 points (5 points per overdue item). The final risk level is LOW, MEDIUM, or HIGH based on the total score. A GO epic can still be HIGH risk if launching soon.
                                                    </div>
                                                </div>
                                            }
                                            withArrow
                                            multiline
                                        >
                                            <IconInfoCircle
                                                size={14}
                                                style={{
                                                    color: 'var(--color-gray-400)',
                                                    cursor: 'help'
                                                }}
                                            />
                                        </Tooltip>
                                    </div>
                                    <div style={{
                                        fontSize: '17px',
                                        fontWeight: 'var(--font-weight-bold)',
                                        color: epic.risk_level === 'HIGH' ? '#dc2626' : epic.risk_level === 'MEDIUM' ? '#f97316' : '#16a34a',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        {epic.risk_level || 'LOW'}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>

                <div style={{ marginTop: 'var(--spacing-8)', marginBottom: 0 }}>
                    <EpicDetailTabs
                        activeTab={activeTab}
                        onTabChange={(value) => setActiveTab(value)}
                    />
                </div>

                <Tabs
                    value={activeTab}
                    onChange={(value) => setActiveTab(value || 'readiness')}
                    className="mb-8"
                    variant="pills"
                    styles={{
                        list: {
                            display: 'none'
                        }
                    }}
                >
                    <Tabs.List style={{ display: 'none' }}>
                        <Tabs.Tab value="readiness">Readiness</Tabs.Tab>
                        <Tabs.Tab value="decisions">Decisions</Tabs.Tab>
                        <Tabs.Tab value="adoption">Success Config</Tabs.Tab>
                        <Tabs.Tab value="scorecard">Scorecard</Tabs.Tab>
                        <Tabs.Tab value="retro">Retro</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="readiness" pt={0} style={{ marginTop: 0, paddingTop: 0 }}>
                        <div style={{
                            borderLeft: '1px solid var(--color-gray-900)',
                            borderRight: '1px solid var(--color-gray-900)',
                            borderBottom: '1px solid var(--color-gray-900)',
                            borderTop: 'none',
                            borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                            padding: 0,
                            marginTop: 0,
                            position: 'relative',
                            zIndex: 1
                        }}>
                            <div className="flex justify-between items-center mb-4" style={{ paddingTop: 'var(--spacing-4)', paddingLeft: 'var(--spacing-4)' }}>
                                {matrix.length > 0 && (
                                    <>
                                        {showFilters ? (
                                            <Group gap="xs">
                                                <Badge
                                                    variant={criterionFilter === 'all' ? 'filled' : 'outline'}
                                                    style={{
                                                        cursor: 'pointer',
                                                        fontFamily: 'var(--font-body)',
                                                        fontSize: 'var(--font-size-sm)'
                                                    }}
                                                    onClick={() => setCriterionFilter('all')}
                                                >
                                                    All
                                                </Badge>
                                                <Badge
                                                    variant={criterionFilter === 'overdue' ? 'filled' : 'outline'}
                                                    color="red"
                                                    style={{
                                                        cursor: 'pointer',
                                                        fontFamily: 'var(--font-body)',
                                                        fontSize: 'var(--font-size-sm)'
                                                    }}
                                                    onClick={() => setCriterionFilter('overdue')}
                                                >
                                                    Criterion Overdue
                                                </Badge>
                                                <Badge
                                                    variant={criterionFilter === 'too_soon' ? 'filled' : 'outline'}
                                                    color="orange"
                                                    style={{
                                                        cursor: 'pointer',
                                                        fontFamily: 'var(--font-body)',
                                                        fontSize: 'var(--font-size-sm)'
                                                    }}
                                                    onClick={() => setCriterionFilter('too_soon')}
                                                >
                                                    Criterion Due Soon
                                                </Badge>
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    onClick={() => setShowFilters(false)}
                                                >
                                                    Hide Filters
                                                </Button>
                                            </Group>
                                        ) : (
                                            <Button
                                                size="xs"
                                                variant="subtle"
                                                onClick={() => setShowFilters(true)}
                                            >
                                                Show Filters
                                            </Button>
                                        )}
                                    </>
                                )}
                            </div>
                            {matrix.length === 0 ? (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 flex items-center justify-between gap-4">
                                    <div>
                                        No criteria configured. Add criteria in <Link href="/admin/settings" className="text-yellow-800 underline hover:text-yellow-900">Admin → Settings</Link>.
                                    </div>
                                    {instantiationFailed && (
                                        <Button size="xs" variant="outline" onClick={retryInstantiate} loading={instantiating} className="border-yellow-600 text-yellow-800 hover:bg-yellow-100">
                                            Retry populate criteria
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {(() => {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const fourteenDaysFromNow = new Date(today);
                                        fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

                                        // Memoization cache for filter calculations
                                        const filterDueDateCache = new Map<number, string | null>();

                                        // Use pre-calculated values for filtering (optimization: reuse pre-calculated maps)
                                        const calculateDueDateForFilter = (item: any): string | null => {
                                            if (!item.criterion?.rating_timing || launchStages.length === 0) {
                                                return item.condition_due_date || null;
                                            }

                                            const targetDate = releaseDate || (epic ? epic.target_launch_date : null);
                                            if (!targetDate) {
                                                return item.condition_due_date || null;
                                            }

                                            const ratingTimingId = item.criterion.rating_timing;

                                            // Check cache first
                                            if (filterDueDateCache.has(ratingTimingId)) {
                                                return filterDueDateCache.get(ratingTimingId)!;
                                            }

                                            // Use pre-calculated values instead of recalculating
                                            const daysBefore = stageDaysBeforeLaunch.get(ratingTimingId);
                                            const daysAfter = stageDaysAfterLaunch.get(ratingTimingId);

                                            if (daysBefore === undefined && daysAfter === undefined) {
                                                filterDueDateCache.set(ratingTimingId, null);
                                                return item.condition_due_date || null;
                                            }

                                            const dueDate = new Date(targetDate);

                                            if (daysBefore !== undefined) {
                                                dueDate.setDate(dueDate.getDate() - daysBefore);
                                            } else if (daysAfter !== undefined) {
                                                dueDate.setDate(dueDate.getDate() + daysAfter);
                                            }

                                            const result = dueDate.toISOString().split('T')[0];
                                            filterDueDateCache.set(ratingTimingId, result);
                                            return result;
                                        };

                                        const filteredMatrix = matrix.filter((item: any) => {
                                            if (criterionFilter === 'all') return true;

                                            // Get due date - use stored or calculate if needed
                                            const dueDate = item.condition_due_date || calculateDueDateForFilter(item);
                                            if (!dueDate) {
                                                return false;
                                            }

                                            const due = new Date(dueDate);
                                            due.setHours(0, 0, 0, 0);

                                            if (criterionFilter === 'overdue') {
                                                // Show items that are overdue AND not completed
                                                const isOverdue = due.getTime() < today.getTime();
                                                const status = item.status || 'NOT_SET';
                                                const isIncomplete = status === 'NOT_SET' || status === 'CONDITIONAL';
                                                return isOverdue && isIncomplete;
                                            } else if (criterionFilter === 'too_soon') {
                                                // Show items due within 14 days AND not completed
                                                const isDueSoon = due.getTime() >= today.getTime() && due.getTime() <= fourteenDaysFromNow.getTime();
                                                const status = item.status || 'NOT_SET';
                                                const isIncomplete = status === 'NOT_SET' || status === 'CONDITIONAL';
                                                return isDueSoon && isIncomplete;
                                            }

                                            return true;
                                        });

                                        const suggestedItems = isEnabled(FEATURE_AI_PRUNING, featureFlags)
                                            ? matrix.filter(m => m.ai_prune_suggested).map(m => ({
                                                id: m.id,
                                                label: m.criterion?.label || 'Unknown',
                                                reason: m.ai_prune_reason || 'AI suggestion'
                                            }))
                                            : [];

                                        return (
                                            <>
                                                <AIPruneReviewBanner
                                                    epicId={epic.id}
                                                    suggestedItems={suggestedItems}
                                                    onActionComplete={loadData}
                                                />
                                                <Matrix epicId={epic.id} epicName={epic.name} epicStatus={epic.status} items={filteredMatrix} onUpdate={loadData} epic={epic} showNotApplicable={isEnabled(FEATURE_NOT_APPLICABLE, featureFlags)} />
                                            </>
                                        );
                                    })()}
                                </>
                            )}
                        </div>
                    </Tabs.Panel>

                    <Tabs.Panel value="decisions" pt="md">
                        {/* Lazy load decisions only when decisions tab is active */}
                        {activeTab === 'decisions' && (
                            <DecisionList
                                epicId={epic.id}
                                refreshTrigger={refreshDecisions}
                                onRefresh={() => setRefreshDecisions(prev => prev + 1)}
                            />
                        )}
                    </Tabs.Panel>

                    <Tabs.Panel value="adoption" pt="md">
                        {/* HEART Metrics Dashboard - AI-powered success metrics */}
                        {activeTab === 'adoption' && (
                            <Stack gap="xl">
                                <HeartDashboard
                                    epicId={epic.id}
                                    epicName={epic.name}
                                />
                                
                                {/* Legacy Success Config - for backward compatibility */}
                                {successConfig && (
                                    <SuccessConfigSection
                                        epicId={epic.id}
                                        epicName={epic.name}
                                        epicTier={epic.tier}
                                        config={successConfig}
                                        metrics={successMetrics}
                                        isAdmin={isAdmin}
                                        onRefresh={fetchSuccessData}
                                        epicOwnerId={epic.owner_id}
                                        pmOwner={pmOwner}
                                    />
                                )}
                            </Stack>
                        )}
                    </Tabs.Panel>

                    <Tabs.Panel value="scorecard" pt="md">
                        {/* Lazy load scorecard only when tab is active */}
                        {activeTab === 'scorecard' && (
                            <ScorecardPageContent epicId={epic.id} />
                        )}
                    </Tabs.Panel>

                    <Tabs.Panel value="retro" pt="md">
                        {/* Lazy load retro only when tab is active */}
                        {activeTab === 'retro' && (
                            <RetroPageContent epicId={epic.id} />
                        )}
                    </Tabs.Panel>
                </Tabs>

            </div>
            {showFieldsSidebar && epic && <EpicFieldsSidebar epic={epic} ahaFieldsToLoad={epicDetailCache.getSettings()?.aha_fields_to_load ?? undefined} />}
        </div>
    );
}

