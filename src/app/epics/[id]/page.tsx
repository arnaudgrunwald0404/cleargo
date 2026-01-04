"use client";
import { useEffect, useState, useRef } from "react";
import { Epic } from "@/types/epics";
import Link from "next/link";
import { useParams } from "next/navigation";
import Matrix from "@/components/Matrix";
import { FeedbackSection } from "@/components/FeedbackSection";
import { createClient } from "@/lib/supabase/client";
import { Button, Select, Avatar, Group, Badge, Tabs, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconUsers } from "@tabler/icons-react";
import SnapshotModal from "@/components/SnapshotModal";
import SnapshotList from "@/components/SnapshotList";
import EpicFieldsSidebar from "@/components/EpicFieldsSidebar";
import { fetchWithRateLimit, batchFetchWithRateLimit } from "@/lib/fetch-with-rate-limit";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function EpicDetailPage() {
    const params = useParams();
    const id = params?.id as string | undefined;
    
    if (!id) {
        return <div className="pt-24 p-8">Invalid epic ID</div>;
    }

    const [epic, setEpic] = useState<Epic | null>(null);
    const [matrix, setMatrix] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
    const [refreshSnapshots, setRefreshSnapshots] = useState(0);
    const [updatingTier, setUpdatingTier] = useState(false);
    const [updatingRiskLevel, setUpdatingRiskLevel] = useState(false);
    const [pmOwner, setPmOwner] = useState<{name?: string; email?: string; avatar_url?: string} | null>(null);
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

    async function loadData() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:70',message:'loadData called',data:{inProgress:loadDataInProgressRef.current,timeSinceLastCall:Date.now()-lastLoadDataRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,D'})}).catch(()=>{});
        // #endregion
        // Prevent multiple simultaneous calls
        if (loadDataInProgressRef.current) {
            console.warn('loadData already in progress, skipping duplicate call');
            return;
        }
        
        // Debounce rapid successive calls (min 500ms between calls)
        const now = Date.now();
        const timeSinceLastCall = now - lastLoadDataRef.current;
        if (timeSinceLastCall < 500) {
            console.warn(`loadData called too soon (${timeSinceLastCall}ms ago), debouncing`);
            if (loadDataTimeoutRef.current) {
                clearTimeout(loadDataTimeoutRef.current);
            }
            loadDataTimeoutRef.current = setTimeout(() => {
                loadData();
            }, 500 - timeSinceLastCall);
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

            // PARALLEL FETCH: Fetch epic, settings, criteria, matrix, launch stages, and release schedule simultaneously
            // This dramatically reduces load time
            const [
                epicRes,
                settingsRes,
                criteriaRes,
                matrixQuery,
                launchStagesQuery,
                releaseScheduleQuery
            ] = await Promise.all([
                fetchWithRetry(`/api/epics/${id}`),
                fetchWithRetry('/api/settings'),
                fetchWithRetry('/api/criteria'),
                supabase
                    .from('epic_criterion_status')
                    .select(`
                        *,
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
                    .order('sort_order', { ascending: true }),
                // Release schedule will be fetched conditionally after we get epic data
                Promise.resolve({ data: null, error: null })
            ]);

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

            // Process settings once (used for both threshold and pod mapping)
            let settings: any = {};
            let settingsMapping: Record<string, string> = {};
            if (settingsRes.ok) {
                settings = await settingsRes.json();
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

            // Process criteria
            let allActiveCriteria: any[] = [];
            if (criteriaRes.ok) {
                const criteriaData = await criteriaRes.json();
                allActiveCriteria = (criteriaData.items || []).filter((c: any) => c.is_active === true);
            }

            // Process launch stages
            const { data: stagesData, error: stagesError } = launchStagesQuery;
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
                
                // #region agent log
                console.log('[DEBUG] Launch stages loaded', stagesData);
                console.log('[DEBUG] Pre-calculated days-before-launch', Object.fromEntries(calculatedDaysBeforeLaunch));
                console.log('[DEBUG] Pre-calculated days-after-launch', Object.fromEntries(calculatedDaysAfterLaunch));
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:251',message:'Debug log call - Launch stages loaded',data:{callCount:'tracking',stagesCount:stagesData.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                fetch('/api/debug-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:202',message:'Launch stages loaded',data:{stages:stagesData,count:stagesData.length,daysBeforeLaunch:Object.fromEntries(calculatedDaysBeforeLaunch),daysAfterLaunch:Object.fromEntries(calculatedDaysAfterLaunch)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
                // #endregion
            } else {
                // #region agent log
                console.error('[DEBUG] Launch stages error', stagesError);
                fetch('/api/debug-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:207',message:'Launch stages error',data:{error:stagesError},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
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
            const applies = (app: 'ALL'|'TIER_1_ONLY'|'TIER_1_AND_2', tier: 'TIER_1'|'TIER_2'|'TIER_3') =>
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
                // Priority: decision_owner_id (delegated) > criterion template email
                let approverEmail: string | null = null;
                
                if (item.decision_owner?.email) {
                    // Use delegated approver if available
                    approverEmail = item.decision_owner.email;
                } else {
                    // Fall back to criterion template
                    const criterionEmail = item.criterion?.decision_owner_email;
                    approverEmail = criterionEmail;
                    
                    // If it's a placeholder, resolve using pod mapping
                    if (criterionEmail === "[name of pod's product manager]" || (criterionEmail && criterionEmail.toLowerCase().includes("pod"))) {
                        if (pod) {
                            // Try exact match first
                            if (settingsMapping[pod]) {
                                approverEmail = settingsMapping[pod];
                            } else {
                                // Try case-insensitive match
                                const podLower = pod.toLowerCase();
                                const matchingKey = Object.keys(settingsMapping).find(key => key.toLowerCase() === podLower);
                                if (matchingKey && settingsMapping[matchingKey]) {
                                    approverEmail = settingsMapping[matchingKey];
                                }
                            }
                        }
                    }
                }
                
                // Only add to approverEmails if it's a real email (not a placeholder)
                if (approverEmail && approverEmail !== "[name of pod's product manager]" && approverEmail.includes("@")) {
                    approverEmails.add(approverEmail);
                }
            });
            
            // Fetch user info for all approver emails using API endpoint
            // This works even without authentication, allowing email-to-name translation
            const userInfoMap: Record<string, { first_name?: string; last_name?: string; avatar_url?: string }> = {};
            if (approverEmails.size > 0) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:493',message:'Before /api/users/by-email call for approvers',data:{approverCount:approverEmails.size,emails:Array.from(approverEmails)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                try {
                    const emailsParam = Array.from(approverEmails).join(',');
                    const userInfoRes = await fetch(`/api/users/by-email?emails=${encodeURIComponent(emailsParam)}`);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:496',message:'After /api/users/by-email call for approvers',data:{status:userInfoRes.status,ok:userInfoRes.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    if (userInfoRes.ok) {
                        const fetchedUserMap = await userInfoRes.json();
                        // Merge fetched user info into userInfoMap
                        Object.keys(fetchedUserMap).forEach(email => {
                            userInfoMap[email.toLowerCase()] = fetchedUserMap[email];
                        });
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
            
            // #region agent log
            const virtualIds = itemIds.filter((id: string) => id.startsWith('virtual-'));
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:575',message:'Before fetching comments/attachments',data:{totalItemIds:itemIds.length,virtualIdsCount:virtualIds.length,virtualIds:virtualIds.slice(0,5),allItemIds:itemIds.slice(0,10)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            if (itemIds.length > 0) {
                // Clear any existing timeout to prevent duplicate requests
                if (attachmentFetchTimeoutRef.current) {
                    clearTimeout(attachmentFetchTimeoutRef.current);
                }
                
                // Use setTimeout to defer until after initial render
                attachmentFetchTimeoutRef.current = setTimeout(() => {
                    // Filter out virtual IDs - they don't have status rows and can't have comments/attachments
                    const realItemIds = itemIds.filter((itemId: string) => !itemId.startsWith('virtual-'));
                    
                    // #region agent log
                    const virtualCommentIds = itemIds.filter((id: string) => id.startsWith('virtual-'));
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:582',message:'Fetching comments for itemIds',data:{totalIds:itemIds.length,virtualIdsCount:virtualCommentIds.length,virtualIds:virtualCommentIds.slice(0,5),realIdsCount:realItemIds.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'})}).catch(()=>{});
                    // #endregion
                    
                    // Fetch comments counts and last comment for each item using batch fetching
                    const commentUrls = realItemIds.map(
                        (itemId: string) => `/api/epics/${id}/criteria/${itemId}/comments`
                    );

                    batchFetchWithRateLimit(commentUrls, {
                        batchSize: 5,
                        batchDelay: 200,
                        maxRetries: 1,
                    }).then((results) => {
                        results.forEach(({ url, response, error }, index) => {
                            const itemId = realItemIds[index];
                            
                            if (error || !response) {
                                console.warn(`Failed to fetch comments for ${itemId}:`, error);
                                commentsData[itemId] = { count: 0 };
                                return;
                            }

                            if (response.ok) {
                                response.json().then((comments: any[]) => {
                                    const lastComment = comments && comments.length > 0 
                                        ? comments[comments.length - 1] 
                                        : null;
                                    commentsData[itemId] = {
                                        count: comments?.length || 0,
                                        lastComment: lastComment ? {
                                            comment_text: lastComment.comment_text,
                                            created_at: lastComment.created_at,
                                            created_by: lastComment.created_by,
                                        } : undefined,
                                    };
                                    // Update matrix with new comment data
                                    setMatrix(prevMatrix => prevMatrix.map((item: any) => {
                                        const commentsInfo = commentsData[item.id] || { count: 0 };
                                        return {
                                            ...item,
                                            commentCount: commentsInfo.count,
                                            lastComment: commentsInfo.lastComment,
                                        };
                                    }));
                                }).catch((e) => {
                                    console.warn(`Failed to parse comments for ${itemId}:`, e);
                                    commentsData[itemId] = { count: 0 };
                                });
                            } else {
                                commentsData[itemId] = { count: 0 };
                            }
                        });
                        
                        // Final update of matrix with all comment data
                        setMatrix(prevMatrix => prevMatrix.map((item: any) => {
                            const commentsInfo = commentsData[item.id] || { count: 0 };
                            return {
                                ...item,
                                commentCount: commentsInfo.count,
                                lastComment: commentsInfo.lastComment,
                            };
                        }));
                    });
                    
                    // Fetch attachments counts for each item with deduplication and error handling
                    // Use batch fetching with rate limit handling to avoid overwhelming the server
                    // Filter out virtual IDs - they don't have status rows and can't have attachments
                    const realAttachmentItemIds = itemIds.filter((itemId: string) => !itemId.startsWith('virtual-'));
                    
                    // #region agent log
                    const virtualAttachmentIds = itemIds.filter((id: string) => id.startsWith('virtual-'));
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:644',message:'Before filtering attachment itemIds',data:{totalItemIds:itemIds.length,virtualIdsCount:virtualAttachmentIds.length,virtualIds:virtualAttachmentIds.slice(0,5),realIdsCount:realAttachmentItemIds.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'G'})}).catch(()=>{});
                    // #endregion
                    
                    const attachmentItemIds = realAttachmentItemIds.filter((itemId: string) => {
                        // Skip if already pending or previously failed with 500
                        const requestKey = `${id}-${itemId}`;
                        if (pendingAttachmentRequestsRef.current.has(requestKey)) {
                            return false;
                        }
                        if (failedAttachmentRequestsRef.current.has(requestKey)) {
                            return false;
                        }
                        pendingAttachmentRequestsRef.current.add(requestKey);
                        return true;
                    });

                    if (attachmentItemIds.length > 0) {
                        // Build URLs for batch fetching
                        const attachmentUrls = attachmentItemIds.map(
                            (itemId: string) => `/api/epics/${id}/criteria/${itemId}/attachments`
                        );

                        // Use batch fetch with rate limit handling (processes in batches of 5)
                        batchFetchWithRateLimit(attachmentUrls, {
                            batchSize: 5,
                            batchDelay: 200,
                            maxRetries: 1,
                        }).then((results) => {
                            results.forEach(({ url, response, error }, index) => {
                                const itemId = attachmentItemIds[index];
                                const requestKey = `${id}-${itemId}`;
                                
                                // Remove from pending set
                                pendingAttachmentRequestsRef.current.delete(requestKey);
                                
                                if (error) {
                                    console.warn(`Failed to fetch attachments for ${itemId}:`, error);
                                    attachmentsData[itemId] = 0;
                                    return;
                                }

                                if (!response) {
                                    attachmentsData[itemId] = 0;
                                    return;
                                }

                                if (response.ok) {
                                    response.json().then((attachments: any[]) => {
                                        attachmentsData[itemId] = attachments?.length || 0;
                                        // Update matrix with new attachment data
                                        setMatrix(prevMatrix => prevMatrix.map((item: any) => ({
                                            ...item,
                                            attachmentCount: attachmentsData[item.id] || 0,
                                        })));
                                    }).catch((e) => {
                                        console.warn(`Failed to parse attachments for ${itemId}:`, e);
                                        attachmentsData[itemId] = 0;
                                    });
                                } else if (response.status === 500) {
                                    // Don't retry 500 errors - mark as failed
                                    failedAttachmentRequestsRef.current.add(requestKey);
                                    console.warn(`Server error (500) fetching attachments for ${itemId}, skipping retries`);
                                    attachmentsData[itemId] = 0;
                                } else {
                                    // Other errors - don't retry
                                    failedAttachmentRequestsRef.current.add(requestKey);
                                    attachmentsData[itemId] = 0;
                                }
                            });
                            
                            // Final update of matrix with all attachment data
                            setMatrix(prevMatrix => prevMatrix.map((item: any) => ({
                                ...item,
                                attachmentCount: attachmentsData[item.id] || 0,
                            })));
                        });
                    }
                }, 100); // Small delay to let initial render complete
            }
            
            const resolvedMatrix = sorted.map((item: any) => {
                // Priority: decision_owner_id (delegated) > criterion template email
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
                    approverEmail = criterionEmail;
                    
                    // If it's a placeholder, resolve using pod mapping
                    if (criterionEmail === "[name of pod's product manager]" || (criterionEmail && criterionEmail.toLowerCase().includes("pod"))) {
                        if (pod) {
                            // Try exact match first
                            if (settingsMapping[pod]) {
                                approverEmail = settingsMapping[pod];
                            } else {
                                // Try case-insensitive match
                                const podLower = pod.toLowerCase();
                                const matchingKey = Object.keys(settingsMapping).find(key => key.toLowerCase() === podLower);
                                if (matchingKey && settingsMapping[matchingKey]) {
                                    approverEmail = settingsMapping[matchingKey];
                                }
                            }
                        }
                    }
                    
                    // Get approver info from userInfoMap
                    if (approverEmail && approverEmail !== "[name of pod's product manager]") {
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
            
            // Resolve PM owner: prioritize pod mapping (source of truth), then fallback to assigned_to_user or PM criteria approver
            let pmEmail: string | null = null;
            
            // First priority: pod mapping (this is the authoritative source for PM assignment)
            // Try exact match first
            if (pod && settingsMapping[pod]) {
                pmEmail = settingsMapping[pod];
            } else if (pod) {
                // Try case-insensitive match
                const podLower = pod.toLowerCase();
                const matchingKey = Object.keys(settingsMapping).find(key => key.toLowerCase() === podLower);
                if (matchingKey) {
                    pmEmail = settingsMapping[matchingKey];
                }
            }
            
            if (pmEmail) {
                console.log('Resolved PM owner from pod mapping:', pmEmail);
            }
            
            // Second priority: assigned_to_user from AHA fields
            if (!pmEmail && ahaFields?.standard_fields?.assigned_to_user) {
                const assignedUser = ahaFields.standard_fields.assigned_to_user;
                pmEmail = assignedUser.email || null;
            }
            
            // Third priority: get it from Product Management & Documentation Foundation criteria
            if (!pmEmail) {
                const pmFoundationItems = resolvedMatrix.filter((item: any) => {
                    const category = item.criterion?.category;
                    return category && category.toLowerCase().includes('product management') && category.toLowerCase().includes('documentation');
                });
                
                if (pmFoundationItems.length > 0 && pmFoundationItems[0].approverEmail) {
                    pmEmail = pmFoundationItems[0].approverEmail;
                }
            }
            
            // Fetch PM owner info if email is available using API endpoint
            if (pmEmail) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:818',message:'Before /api/users/by-email call for PM owner',data:{pmEmail},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                // Normalize email to lowercase for consistent lookup
                const normalizedEmail = pmEmail.toLowerCase().trim();
                try {
                    const pmUserRes = await fetch(`/api/users/by-email?emails=${encodeURIComponent(normalizedEmail)}`);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'epics/[id]/page.tsx:822',message:'After /api/users/by-email call for PM owner',data:{status:pmUserRes.status,ok:pmUserRes.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
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
            } else {
                setPmOwner(null);
            }

        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
            loadDataInProgressRef.current = false;
        }
    }

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
            <div className="pt-24 p-8 flex items-center justify-center">
                <PurpleLoader size="md" />
            </div>
        );
    }
    if (error) {
        return <div className="pt-24 p-8 text-red-600">Error: {error}</div>;
    }
    if (!epic) {
        return <div className="pt-24 p-8">Epic not found</div>;
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
            <div className="flex-1 pt-16 pb-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-1">
                    <Link href="/epics" className="text-blue-600 hover:text-blue-800 hover:underline text-sm">← Back to Epics</Link>
                </div>

            <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">{epic.name}</h1>
                        <div className="flex gap-2 items-center flex-wrap">
                        {pmOwner && pmOwner.email && (
                            <Tooltip label="Product Owner" withArrow>
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded cursor-help">
                                    <IconUsers size={14} />
                                    {pmOwner.name || pmOwner.email}
                                </span>
                            </Tooltip>
                        )}
                        {(() => {
                                const ahaFields = (epic as any)?.aha_fields || {};
                                const pod = (epic as any)?.pod || ahaFields?.custom_fields?.dev_backlog_pod || null;
                                return pod ? (
                                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
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
                            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                                {epic.status}
                            </span>
                           
                        </div>
                    </div>
                    <div className="ml-6 flex-shrink-0">
                        <div className="flex gap-6 items-center">
                            {(() => {
                                const targetDate = releaseDate || epic.target_launch_date;
                                if (targetDate) {
                                    // Calculate total duration from all launch stages (excluding NULL durations)
                                    let totalDurationDays = 0;
                                    
                                    if (launchStages.length > 0) {
                                        totalDurationDays = launchStages
                                            .filter(stage => stage.duration_days !== null)
                                            .reduce((sum, stage) => sum + (stage.duration_days || 0), 0);
                                    }
                                    
                                    // Fallback to 63 days (14+21+28) if launch stages aren't loaded yet
                                    if (totalDurationDays === 0) {
                                        totalDurationDays = 63;
                                    }
                                    
                                    const goNoGoDate = new Date(targetDate);
                                    goNoGoDate.setDate(goNoGoDate.getDate() - totalDurationDays);
                                    return (
                                        <div className="text-right">
                                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Approx Go/NoGo Date</div>
                                            <div className="text-lg font-semibold text-gray-900">
                                                {goNoGoDate.toLocaleDateString()}
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                            <div className="text-right">
                                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Target Release Date</div>
                                {releaseDate ? (
                                    <div className="text-lg font-semibold text-gray-900">
                                        {new Date(releaseDate).toLocaleDateString()}
                                    </div>
                                ) : epic.target_launch_date ? (
                                    <div className="text-lg font-semibold text-gray-900">
                                        {new Date(epic.target_launch_date).toLocaleDateString()}
                                    </div>
                                ) : releaseName ? (
                                    fetchingReleaseDate ? (
                                        <div className="text-sm text-gray-500 flex items-center gap-2">
                                            <PurpleLoader size="sm" />
                                        </div>
                                    ) : (
                                        <div className="text-lg font-semibold text-gray-500">Not set</div>
                                    )
                                ) : (
                                    <div className="text-lg font-semibold text-gray-500">Not set</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-6 mt-6">
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Readiness Score</div>
                            <div className="text-2xl font-bold text-gray-900">
                                {matrix.length === 0 ? 'N/A' : (typeof epic.readiness_score === 'number' ? `${Math.round(epic.readiness_score * 100)}%` : 'N/A')}
                                {epic.readiness_score !== null && epic.readiness_score !== undefined && epic.readiness_status && (
                                    <span className="ml-2 text-sm font-normal text-gray-600">
                                        - {epic.readiness_status}
                                    </span>
                                )}
                            </div>
                            {readinessThreshold !== null && epic.tier && (
                                <div className="text-xs text-gray-500 mt-1">
                                    Threshold: <span className="font-medium">{Math.round(readinessThreshold * 100)}%</span> (Tier {epic.tier.replace('TIER_', '')})
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Readiness Status</div>
                            <div className="text-sm font-semibold text-gray-900">{matrix.length === 0 ? 'Not evaluated' : (epic.readiness_status || 'NO GO')}</div>
                        </div>
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                                Risk Level
                                <Tooltip
                                    label={
                                        <div className="text-xs">
                                            <div className="font-semibold mb-2">Risk Level Algorithm:</div>
                                            <div className="space-y-1">
                                                <div><strong>Default:</strong> LOW</div>
                                                <div><strong>&lt; 14 days to launch:</strong></div>
                                                <div className="pl-2">• HIGH if status is NO_GO or CONDITIONAL_GO</div>
                                                <div className="pl-2">• MEDIUM if status is GO but score &lt; 95%</div>
                                                <div><strong>14-30 days to launch:</strong></div>
                                                <div className="pl-2">• MEDIUM if status is NO_GO</div>
                                            </div>
                                        </div>
                                    }
                                    multiline
                                    maw={300}
                                    withArrow
                                >
                                    <IconInfoCircle size={14} className="text-gray-400 cursor-help" />
                                </Tooltip>
                            </div>
                            <Select
                                value={epic.risk_level || 'LOW'}
                                onChange={handleRiskLevelUpdate}
                                data={[
                                    { value: 'LOW', label: 'Low' },
                                    { value: 'MEDIUM', label: 'Medium' },
                                    { value: 'HIGH', label: 'High' },
                                ]}
                                disabled={updatingRiskLevel}
                                size="xs"
                                style={{ width: 120 }}
                                styles={{
                                    input: {
                                        fontSize: '0.875rem',
                                        fontWeight: '600',
                                        padding: '0.25rem 0.5rem',
                                        height: 'auto',
                                        minHeight: 'auto',
                                        color: epic.risk_level === 'HIGH' ? '#dc2626' : epic.risk_level === 'MEDIUM' ? '#f97316' : '#16a34a',
                                    }
                                }}
                            />
                        </div>
                    </div>

            <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'readiness')} className="mt-8 mb-8" variant="pills">
                <div style={{ backgroundColor: '#E7F5FF', padding: '4px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Tabs.List style={{ backgroundColor: 'transparent', padding: 0 }}>
                        <Tabs.Tab value="readiness">Readiness</Tabs.Tab>
                        <Tabs.Tab value="decisions">Decisions</Tabs.Tab>
                        <Tabs.Tab value="feedback">Feedback</Tabs.Tab>
                        <Tabs.Tab value="adoption">Adoption</Tabs.Tab>
                    </Tabs.List>
                    <div className="flex gap-2" style={{ marginLeft: 'auto', paddingRight: '4px' }}>
                        <Button 
                            size="xs" 
                            variant={showFieldsSidebar ? "filled" : "outline"}
                            onClick={() => setShowFieldsSidebar(!showFieldsSidebar)}
                        >
                            {showFieldsSidebar ? 'Hide' : 'Show'} Aha! Fields
                        </Button>
                        <Button 
                            size="xs" 
                            onClick={() => setSnapshotModalOpen(true)}
                        >
                            Take Snapshot
                        </Button>
                    </div>
                </div>

                <Tabs.Panel value="readiness" pt="md">
                    <div className="flex justify-between items-center mb-4">
                        {matrix.length > 0 && (
                            <>
                                {showFilters ? (
                                    <Group gap="xs">
                                        <Badge
                                            variant={criterionFilter === 'all' ? 'filled' : 'outline'}
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setCriterionFilter('all')}
                                        >
                                            All
                                        </Badge>
                                        <Badge
                                            variant={criterionFilter === 'overdue' ? 'filled' : 'outline'}
                                            color="red"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setCriterionFilter('overdue')}
                                        >
                                            Criterion Overdue
                                        </Badge>
                                        <Badge
                                            variant={criterionFilter === 'too_soon' ? 'filled' : 'outline'}
                                            color="orange"
                                            style={{ cursor: 'pointer' }}
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
                                
                                return <Matrix epicId={epic.id} epicName={epic.name} epicStatus={epic.status} items={filteredMatrix} onUpdate={loadData} />;
                            })()}
                        </>
                    )}
                </Tabs.Panel>

                <Tabs.Panel value="decisions" pt="md">
                    <SnapshotList epicId={epic.id} refreshTrigger={refreshSnapshots} />
                </Tabs.Panel>

                <Tabs.Panel value="feedback" pt="md">
                    <FeedbackSection epicId={epic.id} currentUserEmail={currentUserEmail} />
                </Tabs.Panel>

                <Tabs.Panel value="adoption" pt="md">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                        <p className="text-gray-600">Adoption metrics and tracking coming soon.</p>
                    </div>
                </Tabs.Panel>
            </Tabs>

            <SnapshotModal
                epicId={epic.id}
                opened={snapshotModalOpen}
                onClose={() => setSnapshotModalOpen(false)}
                onSuccess={() => setRefreshSnapshots(prev => prev + 1)}
            />

            </div>
            {showFieldsSidebar && epic && <EpicFieldsSidebar epic={epic} />}
        </div>
    );
}

