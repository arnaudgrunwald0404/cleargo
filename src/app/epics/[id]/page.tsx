"use client";
import { useEffect, useState } from "react";
import { Epic } from "@/types/epics";
import Link from "next/link";
import { useParams } from "next/navigation";
import Matrix from "@/components/Matrix";
import { createClient } from "@/lib/supabase/client";
import { Button, Select, Avatar, Group, Badge } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import SnapshotModal from "@/components/SnapshotModal";
import SnapshotList from "@/components/SnapshotList";
import EpicFieldsSidebar from "@/components/EpicFieldsSidebar";

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
    const [launchStages, setLaunchStages] = useState<Array<{ id: number; name: string; sort_order: number; duration_days: number | null }>>([]);
    const [instantiationFailed, setInstantiationFailed] = useState(false);
    const [instantiating, setInstantiating] = useState(false);
    const [criterionFilter, setCriterionFilter] = useState<'all' | 'overdue' | 'too_soon'>('all');
    
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
        try {
            // Fetch epic
            const res = await fetch(`/api/epics/${id}`);
            if (!res.ok) throw new Error("Failed to fetch epic");
            const data = await res.json();
            setEpic(data);

            // Ensure criteria are instantiated for this epic (especially ALL criteria)
            // This will backfill any missing criteria that should apply
            try {
                const resp = await fetch(`/api/epics/${id}/instantiate-criteria`, {
                    method: 'POST',
                });
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
            } catch (e) {
                // Non-fatal if instantiation fails
                console.warn('Failed to instantiate criteria:', e);
                setInstantiationFailed(true);
                notifications.show({
                    title: 'Could not populate criteria',
                    message: 'Network or server error. You can retry below.',
                    color: 'orange',
                });
            }

            // Fetch matrix
            // We can use Supabase client directly here for ease, or create an API route.
            // Let's use Supabase client for read-only (or authenticated read)
            const supabase = createClient();
            const { data: matrixData, error: matrixError } = await supabase
                .from('epic_criterion_status')
                .select(`
                    *,
                    criterion:criterion_id (
                        *,
                        decision_owner_email,
                        rating_timing
                    )
                `)
                .eq('epic_id', id)
                .order('criterion(sort_order)'); // This might fail if sort_order is not on the join? 
            // Supabase join sorting syntax is tricky. Let's sort in JS.

            if (matrixError) throw matrixError;

            // Fetch all ACTIVE criteria to display non-applicable ones as "Not required"
            // Use API route instead of direct Supabase query to ensure proper authentication
            let allActiveCriteria: any[] = [];
            try {
                const criteriaRes = await fetch('/api/criteria');
                if (criteriaRes.ok) {
                    const criteriaData = await criteriaRes.json();
                    // Filter to only active criteria
                    allActiveCriteria = (criteriaData.items || []).filter((c: any) => c.is_active === true);
                }
            } catch (e) {
                console.warn('Failed to fetch criteria:', e);
            }

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
            const ahaFields = (data as any).aha_fields || {};
            const podRaw = (data as any).pod || ahaFields.custom_fields?.dev_backlog_pod || null;
            const pod = podRaw ? String(podRaw).trim() : null;
            let settingsMapping: Record<string, string> = {};
            
            // Fetch settings once for all items
            try {
                const settingsRes = await fetch('/api/settings');
                if (settingsRes.ok) {
                    const settings = await settingsRes.json();
                    settingsMapping = settings.pod_product_manager_mapping || {};
                }
            } catch (e) {
                console.warn('Failed to fetch settings for pod mapping:', e);
            }
            
            // Get release name and fetch release date from release schedule
            const getReleaseName = (): string | null => {
                if (!ahaFields || typeof ahaFields !== 'object') return null;
                
                // Check standard fields
                if (ahaFields.standard_fields && typeof ahaFields.standard_fields === 'object') {
                    const standardFields = ahaFields.standard_fields;
                    const releaseName = standardFields?.aha_release_name || 
                                      standardFields?.release?.name || null;
                    if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
                        return releaseName.trim();
                    }
                }
                
                // Check custom fields
                if (ahaFields.custom_fields && typeof ahaFields.custom_fields === 'object') {
                    const customFields = ahaFields.custom_fields;
                    const releaseName = customFields?.release_target_after_pod_planning;
                    if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
                        return releaseName.trim();
                    }
                }
                
                return null;
            };
            
            const releaseName = getReleaseName();
            if (releaseName) {
                // Fetch release date from release schedule
                // Use maybeSingle() to avoid PGRST116 error when release doesn't exist
                const { data: releaseSchedule, error: releaseError } = await supabase
                    .from('release_schedule')
                    .select('launch_date')
                    .eq('release_name', releaseName)
                    .maybeSingle();
                
                if (releaseError) {
                    console.warn('Error fetching release schedule:', releaseError);
                    setReleaseDate(null);
                } else if (releaseSchedule?.launch_date) {
                    setReleaseDate(releaseSchedule.launch_date);
                } else {
                    setReleaseDate(null);
                }
            } else {
                setReleaseDate(null);
            }
            
            // Fetch launch stages to calculate Go/NoGo date
            try {
                const { data: stagesData, error: stagesError } = await supabase
                    .from('launch_stages')
                    .select('id, name, sort_order, duration_days')
                    .order('sort_order', { ascending: true });
                
                if (!stagesError && stagesData) {
                    setLaunchStages(stagesData);
                }
            } catch (e) {
                console.warn('Failed to fetch launch stages:', e);
            }
            
            // Debug logging
            if (pod) {
                console.log('Pod value:', pod);
                console.log('Pod mapping keys:', Object.keys(settingsMapping));
                console.log('Pod mapping:', settingsMapping);
                console.log('Matched PM email:', settingsMapping[pod]);
            }
            
            // Resolve PM owner: prioritize pod mapping since that's the source of truth for PM assignment
            // We'll resolve this after we've processed the matrix to also check PM criteria approvers
            
            // Get unique approver emails first
            const approverEmails = new Set<string>();
            sorted.forEach((item: any) => {
                const criterionEmail = item.criterion?.decision_owner_email;
                let approverEmail = criterionEmail;
                
                // If it's a placeholder, resolve using pod mapping
                if (criterionEmail === "[name of pod's product manager]" || (criterionEmail && criterionEmail.toLowerCase().includes("pod"))) {
                    if (pod && settingsMapping[pod]) {
                        approverEmail = settingsMapping[pod];
                    }
                }
                
                if (approverEmail) {
                    approverEmails.add(approverEmail);
                }
            });
            
            // Fetch user info for all approver emails using API endpoint
            // This works even without authentication, allowing email-to-name translation
            const userInfoMap: Record<string, { first_name?: string; last_name?: string; avatar_url?: string }> = {};
            if (approverEmails.size > 0) {
                try {
                    const emailsParam = Array.from(approverEmails).join(',');
                    const userInfoRes = await fetch(`/api/users/by-email?emails=${encodeURIComponent(emailsParam)}`);
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
            const targetDate = releaseDate || (epic ? epic.target_launch_date : null);
            const calculateDueDate = (ratingTimingId: number | null | undefined): string | null => {
                if (!targetDate || !ratingTimingId || launchStages.length === 0) {
                    return null;
                }
                
                // Find the launch stage for this criterion
                const targetStage = launchStages.find(stage => stage.id === ratingTimingId);
                if (!targetStage) {
                    return null;
                }
                
                // Sum durations of all stages that come BEFORE the target stage
                const stagesBeforeTarget = launchStages.filter(stage => 
                    stage.sort_order < targetStage.sort_order && stage.duration_days !== null
                );
                const totalDaysBefore = stagesBeforeTarget.reduce((sum, stage) => 
                    sum + (stage.duration_days || 0), 0
                );
                
                // Calculate due date: target date minus days before target stage
                const dueDate = new Date(targetDate);
                dueDate.setDate(dueDate.getDate() - totalDaysBefore);
                
                return dueDate.toISOString().split('T')[0]; // Return as YYYY-MM-DD
            };
            
            const resolvedMatrix = sorted.map((item: any) => {
                const criterionEmail = item.criterion?.decision_owner_email;
                let approverEmail = criterionEmail;
                
                // If it's a placeholder, resolve using pod mapping
                if (criterionEmail === "[name of pod's product manager]" || (criterionEmail && criterionEmail.toLowerCase().includes("pod"))) {
                    if (pod && settingsMapping[pod]) {
                        approverEmail = settingsMapping[pod];
                    }
                }
                
                // Calculate due date based on rating_timing if not already set
                const calculatedDueDate = item.condition_due_date || calculateDueDate(item.criterion?.rating_timing);
                
                return {
                    ...item,
                    approverEmail,
                    approverInfo: approverEmail ? userInfoMap[approverEmail] : null,
                    notRequired: item.notRequired === true,
                    condition_due_date: calculatedDueDate || item.condition_due_date,
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
                // Normalize email to lowercase for consistent lookup
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
            } else {
                setPmOwner(null);
            }

        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (id) loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    if (loading) {
        return <div className="pt-24 p-8">Loading...</div>;
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
            <div className="flex-1 pt-24 pb-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-6 flex justify-between items-center">
                    <Link href="/epics" className="text-blue-600 hover:text-blue-800 hover:underline">← Back to Epics</Link>
                    <Button 
                        size="xs" 
                        onClick={() => setSnapshotModalOpen(true)}
                    >
                        Take Snapshot
                    </Button>
                </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-gray-900 mb-4">{epic.name}</h1>
                        <div className="flex gap-2 items-center flex-wrap">
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
                                <div className="text-lg font-semibold text-gray-900">
                                    {releaseDate ? new Date(releaseDate).toLocaleDateString() : (epic.target_launch_date ? new Date(epic.target_launch_date).toLocaleDateString() : 'Not set')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                    <div className="grid grid-cols-4 gap-6">
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Readiness Score</div>
                            <div className="text-2xl font-bold text-gray-900">{matrix.length === 0 ? 'N/A' : (typeof epic.readiness_score === 'number' ? `${Math.round(epic.readiness_score * 100)}%` : 'N/A')}</div>
                        </div>
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Readiness Status</div>
                            <div className="text-sm font-semibold text-gray-900">{matrix.length === 0 ? 'Not evaluated' : (epic.readiness_status || 'Not set')}</div>
                        </div>
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Risk Level</div>
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
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Owner</div>
                            <div className="text-sm text-gray-900">
                                {pmOwner && pmOwner.email ? (
                                    <div className="flex items-center gap-2">
                                        <Avatar
                                            src={pmOwner.avatar_url}
                                            alt={pmOwner.email}
                                            radius="xl"
                                            size={24}
                                            color={getAvatarColor(pmOwner.email)}
                                        >
                                            {getInitials(pmOwner.email)}
                                        </Avatar>
                                        <span>{pmOwner.name || pmOwner.email}</span>
                                    </div>
                                ) : (
                                    'Unassigned'
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Readiness Matrix</h2>
                    {matrix.length > 0 && (
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
                        </Group>
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
                            
                            const filteredMatrix = matrix.filter((item: any) => {
                                if (criterionFilter === 'all') return true;
                                
                                const dueDate = item.condition_due_date;
                                if (!dueDate) return false;
                                
                                const due = new Date(dueDate);
                                due.setHours(0, 0, 0, 0);
                                
                                if (criterionFilter === 'overdue') {
                                    return due < today;
                                } else if (criterionFilter === 'too_soon') {
                                    return due >= today && due <= fourteenDaysFromNow;
                                }
                                
                                return true;
                            });
                            
                            return <Matrix epicId={epic.id} items={filteredMatrix} onUpdate={loadData} />;
                        })()}
                    </>
                )}
            </div>

            <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Decision History</h2>
                <SnapshotList epicId={epic.id} refreshTrigger={refreshSnapshots} />
            </div>

            <SnapshotModal
                epicId={epic.id}
                opened={snapshotModalOpen}
                onClose={() => setSnapshotModalOpen(false)}
                onSuccess={() => setRefreshSnapshots(prev => prev + 1)}
            />
            </div>
            <EpicFieldsSidebar epic={epic} />
        </div>
    );
}

