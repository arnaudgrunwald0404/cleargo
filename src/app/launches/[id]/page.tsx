"use client";
import { useEffect, useState } from "react";
import { Launch } from "@/types/launches";
import Link from "next/link";
import { useParams } from "next/navigation";
import Matrix from "@/components/Matrix";
import { createClient } from "@/lib/supabase/client";
import { Button, Select, Avatar } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import SnapshotModal from "@/components/SnapshotModal";
import SnapshotList from "@/components/SnapshotList";
import LaunchFieldsSidebar from "@/components/LaunchFieldsSidebar";

export default function LaunchDetailPage() {
    const params = useParams();
    const id = params.id as string;

    const [launch, setLaunch] = useState<Launch | null>(null);
    const [matrix, setMatrix] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
    const [refreshSnapshots, setRefreshSnapshots] = useState(0);
    const [updatingTier, setUpdatingTier] = useState(false);
    const [updatingRiskLevel, setUpdatingRiskLevel] = useState(false);
    const [pmOwner, setPmOwner] = useState<{name?: string; email?: string; avatar_url?: string} | null>(null);
    const [releaseDate, setReleaseDate] = useState<string | null>(null);
    
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

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    async function loadData() {
        try {
            // Fetch launch
            const res = await fetch(`/api/launches/${id}`);
            if (!res.ok) throw new Error("Failed to fetch launch");
            const data = await res.json();
            setLaunch(data);

            // Ensure criteria are instantiated for this launch (especially ALL criteria)
            // This will backfill any missing criteria that should apply
            try {
                await fetch(`/api/launches/${id}/instantiate-criteria`, {
                    method: 'POST',
                });
            } catch (e) {
                // Non-fatal if instantiation fails
                console.warn('Failed to instantiate criteria:', e);
            }

            // Fetch matrix
            // We can use Supabase client directly here for ease, or create an API route.
            // Let's use Supabase client for read-only (or authenticated read)
            const supabase = createClient();
            const { data: matrixData, error: matrixError } = await supabase
                .from('launch_criterion_status')
                .select(`
                    *,
                    criterion:criterion_id (
                        *,
                        decision_owner_email
                    )
                `)
                .eq('launch_id', id)
                .order('criterion(sort_order)'); // This might fail if sort_order is not on the join? 
            // Supabase join sorting syntax is tricky. Let's sort in JS.

            if (matrixError) throw matrixError;

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

            // Sort by criterion sort_order
            const sorted = deduplicated.sort((a: any, b: any) =>
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
                const { data: releaseSchedule } = await supabase
                    .from('release_schedule')
                    .select('launch_date')
                    .eq('release_name', releaseName)
                    .single();
                
                if (releaseSchedule?.launch_date) {
                    setReleaseDate(releaseSchedule.launch_date);
                } else {
                    setReleaseDate(null);
                }
            } else {
                setReleaseDate(null);
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
            
            // Fetch user info for all approver emails
            const userInfoMap: Record<string, { first_name?: string; last_name?: string; avatar_url?: string }> = {};
            if (approverEmails.size > 0) {
                const { data: users } = await supabase
                    .from('app_user')
                    .select('email, first_name, last_name, avatar_url')
                    .in('email', Array.from(approverEmails));
                
                if (users) {
                    users.forEach(user => {
                        if (user.email) {
                            userInfoMap[user.email] = {
                                first_name: user.first_name || undefined,
                                last_name: user.last_name || undefined,
                                avatar_url: user.avatar_url || undefined
                            };
                        }
                    });
                }
            }
            
            const resolvedMatrix = sorted.map((item: any) => {
                const criterionEmail = item.criterion?.decision_owner_email;
                let approverEmail = criterionEmail;
                
                // If it's a placeholder, resolve using pod mapping
                if (criterionEmail === "[name of pod's product manager]" || (criterionEmail && criterionEmail.toLowerCase().includes("pod"))) {
                    if (pod && settingsMapping[pod]) {
                        approverEmail = settingsMapping[pod];
                    }
                }
                
                return {
                    ...item,
                    approverEmail,
                    approverInfo: approverEmail ? userInfoMap[approverEmail] : null
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
            
            // Fetch PM owner info if email is available
            if (pmEmail) {
                const { data: pmUser } = await supabase
                    .from('app_user')
                    .select('first_name, last_name, email, avatar_url')
                    .eq('email', pmEmail)
                    .single();
                
                if (pmUser) {
                    setPmOwner({
                        name: pmUser.first_name || pmUser.last_name 
                            ? `${pmUser.first_name || ''} ${pmUser.last_name || ''}`.trim()
                            : undefined,
                        email: pmUser.email,
                        avatar_url: pmUser.avatar_url || undefined
                    });
                } else {
                    // If user not found in app_user, use email
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

    async function handleTierUpdate(newTier: string | null) {
        if (!newTier || !launch || newTier === launch.tier) return;

        setUpdatingTier(true);
        try {
            const res = await fetch(`/api/launches/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier: newTier }),
            });

            if (!res.ok) throw new Error('Failed to update tier');

            const updatedLaunch = await res.json();
            setLaunch(updatedLaunch);

            notifications.show({
                title: 'Tier updated',
                message: `Launch tier has been updated to ${newTier.replace('_', ' ')}`,
                color: 'green',
            });

            // Reload matrix data as tier change may affect criteria
            await loadData();
        } catch (error: any) {
            console.error(error);
            notifications.show({
                title: 'Error',
                message: error.message || 'Failed to update tier',
                color: 'red',
            });
        } finally {
            setUpdatingTier(false);
        }
    }

    async function handleRiskLevelUpdate(newRiskLevel: string | null) {
        if (!newRiskLevel || !launch || newRiskLevel === launch.risk_level) return;

        setUpdatingRiskLevel(true);
        try {
            const res = await fetch(`/api/launches/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ risk_level: newRiskLevel }),
            });

            if (!res.ok) throw new Error('Failed to update risk level');

            const updatedLaunch = await res.json();
            setLaunch(updatedLaunch);

            notifications.show({
                title: 'Risk level updated',
                message: `Launch risk level has been updated to ${newRiskLevel}`,
                color: 'green',
            });
        } catch (error: any) {
            console.error(error);
            notifications.show({
                title: 'Error',
                message: error.message || 'Failed to update risk level',
                color: 'red',
            });
        } finally {
            setUpdatingRiskLevel(false);
        }
    }

    if (loading) return <div className="pt-24 p-8">Loading...</div>;
    if (error) return <div className="pt-24 p-8 text-red-600">Error: {error}</div>;
    if (!launch) return <div className="pt-24 p-8">Launch not found</div>;

    return (
        <div className="flex">
            <div className="flex-1 pt-24 pb-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-6">
                    <Link href="/launches" className="text-blue-600 hover:text-blue-800 hover:underline">← Back to Launches</Link>
                </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-gray-900 mb-4">{launch.name}</h1>
                        <div className="flex gap-2 items-center flex-wrap">
                            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                                {(launch as any).product?.name || 'No Product'}
                            </span>
                            <Select
                                value={launch.tier}
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
                                {launch.status}
                            </span>
                        </div>
                    </div>
                    <div className="text-right ml-6 flex-shrink-0">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Target Date</div>
                        <div className="text-lg font-semibold text-gray-900 mb-4">
                            {releaseDate ? new Date(releaseDate).toLocaleDateString() : (launch.target_launch_date ? new Date(launch.target_launch_date).toLocaleDateString() : 'Not set')}
                        </div>
                        <Button 
                            size="xs" 
                            variant="outline" 
                            onClick={() => setSnapshotModalOpen(true)}
                            className="border-blue-600 text-blue-600 hover:bg-blue-50"
                        >
                            Take Snapshot
                        </Button>
                    </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                    <div className="grid grid-cols-4 gap-6">
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Readiness Score</div>
                            <div className="text-2xl font-bold text-gray-900">{launch.readiness_score ? `${Math.round(launch.readiness_score * 100)}%` : '0%'}</div>
                        </div>
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Risk Level</div>
                            <Select
                                value={launch.risk_level || 'LOW'}
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
                                        color: launch.risk_level === 'HIGH' ? '#dc2626' : launch.risk_level === 'MEDIUM' ? '#f97316' : '#16a34a',
                                    }
                                }}
                            />
                        </div>
                        <div>
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Readiness Status</div>
                            <div className="text-sm font-semibold text-gray-900">{launch.readiness_status || 'Not set'}</div>
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
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Readiness Matrix</h2>
                {matrix.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
                        No criteria found. This might be because no criteria matched the launch tier ({launch.tier}) or none are active.
                    </div>
                ) : (
                    <Matrix launchId={launch.id} items={matrix} onUpdate={loadData} />
                )}
            </div>

            <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Decision History</h2>
                <SnapshotList launchId={launch.id} refreshTrigger={refreshSnapshots} />
            </div>

            <SnapshotModal
                launchId={launch.id}
                opened={snapshotModalOpen}
                onClose={() => setSnapshotModalOpen(false)}
                onSuccess={() => setRefreshSnapshots(prev => prev + 1)}
            />
            </div>
            <LaunchFieldsSidebar launch={launch} />
        </div>
    );
}
