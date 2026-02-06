"use client";

import { useEffect, useState } from "react";
import { Button, Card, Textarea, Modal, MultiSelect, Badge, Text, Group, Stack, Title, Divider, Alert, Checkbox } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconUpload, IconBrain, IconLink, IconRefresh, IconAlertCircle, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { PurpleLoader } from "@/components/PurpleLoader";
import { canRolesPerform } from "@/lib/permissions";
import { isEnabled, FEATURE_MEETINGS } from "@/lib/flags";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";

interface Meeting {
    id: string;
    title: string;
    description?: string;
    meeting_date: string;
    duration_minutes?: number;
    epic?: { id: string; name: string };
    linked_epic?: { id: string; name: string };
    linked_epics?: Array<{ epic: { id: string; name: string } }>;
    transcript?: Array<{ id: string; transcript_text: string; uploaded_at: string }>;
    snippets?: Array<{
        id: string;
        snippet_text: string;
        criterion_id?: string;
        criterion?: { id: string; label: string; category: string };
        relevance_score: number;
    }>;
}

interface Epic {
    id: string;
    name: string;
    aha_fields?: Record<string, any> | null;
    archived?: boolean;
}

interface ReleaseGroup {
    releaseName: string;
    releaseDate: string | null;
    epics: Epic[];
}

export default function MeetingsPage() {
    const { flags: featureFlags } = useFeatureFlags();
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [transcriptModalOpen, setTranscriptModalOpen] = useState(false);
    const [transcriptText, setTranscriptText] = useState("");
    const [uploadingTranscript, setUploadingTranscript] = useState(false);
    const [extractingSnippets, setExtractingSnippets] = useState(false);
    const [linkEpicModalOpen, setLinkEpicModalOpen] = useState(false);
    const [epics, setEpics] = useState<Epic[]>([]);
    const [releaseSchedule, setReleaseSchedule] = useState<Array<{ release_name: string; launch_date: string | null }>>([]);
    const [selectedEpicIds, setSelectedEpicIds] = useState<string[]>([]);
    const [linkingEpic, setLinkingEpic] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [checkingConnection, setCheckingConnection] = useState(true);
    const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);
    const [hasAccess, setHasAccess] = useState(false);
    const [checkingRole, setCheckingRole] = useState(true);

    useEffect(() => {
        checkUserRole();
    }, []);

    useEffect(() => {
        if (hasAccess) {
            checkGoogleCalendarConnection();
            fetchMeetings();
            fetchEpics();
            fetchReleaseSchedule();
        }
    }, [hasAccess]);

    const checkUserRole = async () => {
        try {
            const res = await fetch("/api/me");
            if (res.ok) {
                const data = await res.json();
                const userData = data.user || data;
                // Handle both 'roles' array and legacy 'role' string field
                const roles = Array.isArray(userData.roles) 
                    ? userData.roles 
                    : (userData.role ? [userData.role] : []);
                // Check feature flag and meetings.read capability
                const access = isEnabled(FEATURE_MEETINGS, featureFlags) && canRolesPerform(roles, 'meetings.read');
                setHasAccess(access);
            } else {
                setHasAccess(false);
            }
        } catch (error) {
            console.error("Error checking user role:", error);
            setHasAccess(false);
        } finally {
            setCheckingRole(false);
        }
    };

    const checkGoogleCalendarConnection = async () => {
        try {
            const res = await fetch("/api/integrations/google-calendar/status");
            if (res.ok) {
                const data = await res.json();
                setIsConnected(data.connected);
            }
        } catch (error) {
            console.error("Error checking connection:", error);
        } finally {
            setCheckingConnection(false);
        }
    };

    const fetchMeetings = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/meetings");
            if (!res.ok) throw new Error("Failed to fetch meetings");
            const data = await res.json();
            setMeetings(data.meetings || []);
        } catch (error: any) {
            console.error("Error fetching meetings:", error);
            notifications.show({
                title: "Error",
                message: error.message || "Failed to fetch meetings",
                color: "red",
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchEpics = async () => {
        try {
            const res = await fetch("/api/epics");
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error("Failed to fetch epics:", res.status, errorData);
                throw new Error(errorData.error || `Failed to fetch epics: ${res.status}`);
            }
            const data = await res.json();
            // API returns epics array directly, not wrapped in { epics: [...] }
            const epicsArray = Array.isArray(data) ? data : (data.epics || []);
            console.log("Fetched epics:", epicsArray.length, epicsArray);
            if (epicsArray.length === 0) {
                console.warn("No epics returned from API");
            }
            setEpics(epicsArray);
        } catch (error: any) {
            console.error("Error fetching epics:", error);
            notifications.show({
                title: "Error",
                message: error.message || "Failed to fetch epics",
                color: "red",
            });
        }
    };

    const fetchReleaseSchedule = async () => {
        try {
            const res = await fetch("/api/releases", { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setReleaseSchedule(data || []);
            }
        } catch (error: any) {
            console.error("Error fetching release schedule:", error);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/integrations/google-calendar/sync", {
                method: "POST",
            });
            if (!res.ok) throw new Error("Failed to sync calendar");
            const data = await res.json();
            notifications.show({
                title: "Sync Complete",
                message: `Found ${data.eventsFound} check-in events, created ${data.meetingsCreated} meetings`,
                color: "green",
            });
            await fetchMeetings();
        } catch (error: any) {
            notifications.show({
                title: "Sync Failed",
                message: error.message || "Failed to sync calendar",
                color: "red",
            });
        } finally {
            setSyncing(false);
        }
    };

    const handleOpenTranscriptModal = (meeting: Meeting) => {
        setSelectedMeeting(meeting);
        const existingTranscript = meeting.transcript?.[0]?.transcript_text || "";
        setTranscriptText(existingTranscript);
        setTranscriptModalOpen(true);
    };

    const handleSaveTranscript = async () => {
        if (!selectedMeeting || !transcriptText.trim()) {
            notifications.show({
                title: "Error",
                message: "Please enter transcript text",
                color: "red",
            });
            return;
        }

        setUploadingTranscript(true);
        try {
            const res = await fetch(`/api/meetings/${selectedMeeting.id}/transcript`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcript_text: transcriptText }),
            });
            if (!res.ok) throw new Error("Failed to save transcript");
            notifications.show({
                title: "Success",
                message: "Transcript saved successfully",
                color: "green",
            });
            setTranscriptModalOpen(false);
            await fetchMeetings();
        } catch (error: any) {
            notifications.show({
                title: "Error",
                message: error.message || "Failed to save transcript",
                color: "red",
            });
        } finally {
            setUploadingTranscript(false);
        }
    };

    const handleExtractSnippets = async (meeting: Meeting) => {
        if (!meeting.transcript?.[0]?.transcript_text) {
            notifications.show({
                title: "Error",
                message: "No transcript found. Please upload a transcript first.",
                color: "red",
            });
            return;
        }

        const epicId = meeting.linked_epic?.id || meeting.epic?.id;
        if (!epicId) {
            notifications.show({
                title: "Error",
                message: "Please link this meeting to an epic first",
                color: "red",
            });
            return;
        }

        setExtractingSnippets(true);
        try {
            const res = await fetch(`/api/meetings/${meeting.id}/extract-snippets`, {
                method: "POST",
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to extract snippets");
            }
            const data = await res.json();
            notifications.show({
                title: "Success",
                message: `Extracted ${data.count} snippets from transcript`,
                color: "green",
            });
            await fetchMeetings();
        } catch (error: any) {
            notifications.show({
                title: "Error",
                message: error.message || "Failed to extract snippets",
                color: "red",
            });
        } finally {
            setExtractingSnippets(false);
        }
    };

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

    const groupEpicsByRelease = (): ReleaseGroup[] => {
        console.log("Grouping epics:", epics.length, "epics,", releaseSchedule.length, "releases");
        
        // Create a map of release names to dates from release schedule
        const releaseDateMap = new Map<string, string | null>();
        releaseSchedule.forEach(release => {
            if (release.release_name) {
                releaseDateMap.set(release.release_name, release.launch_date);
            }
        });

        // Group epics by release (exclude archived epics)
        const releaseGroupsMap = new Map<string, Epic[]>();
        const ungroupedEpics: Epic[] = [];

        epics.forEach(epic => {
            // Skip archived epics
            if (epic.archived === true) return;
            
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
        
        console.log("Release groups:", releaseGroupsMap.size, "ungrouped:", ungroupedEpics.length);

        // Convert to array and sort by release date
        const releaseGroups: ReleaseGroup[] = Array.from(releaseGroupsMap.entries()).map(([releaseName, epics]) => ({
            releaseName,
            releaseDate: releaseDateMap.get(releaseName) || null,
            epics
        }));

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

        return releaseGroups;
    };

    const handleLinkEpic = async (meeting: Meeting) => {
        setSelectedMeeting(meeting);
        
        // Fetch currently linked epics from the junction table
        try {
            const res = await fetch(`/api/meetings/${meeting.id}/epics`);
            if (res.ok) {
                const data = await res.json();
                setSelectedEpicIds(data.epic_ids || []);
            } else {
                // Fallback to legacy fields
                const currentEpicIds: string[] = [];
                if (meeting.linked_epic?.id) currentEpicIds.push(meeting.linked_epic.id);
                if (meeting.epic?.id && !currentEpicIds.includes(meeting.epic.id)) {
                    currentEpicIds.push(meeting.epic.id);
                }
                // Also check linked_epics array if available
                if (meeting.linked_epics) {
                    meeting.linked_epics.forEach((link: any) => {
                        const epicId = link.epic?.id;
                        if (epicId && !currentEpicIds.includes(epicId)) {
                            currentEpicIds.push(epicId);
                        }
                    });
                }
                setSelectedEpicIds(currentEpicIds);
            }
        } catch (error) {
            console.error("Error fetching linked epics:", error);
            // Fallback to legacy fields
            const currentEpicIds: string[] = [];
            if (meeting.linked_epic?.id) currentEpicIds.push(meeting.linked_epic.id);
            if (meeting.epic?.id && !currentEpicIds.includes(meeting.epic.id)) {
                currentEpicIds.push(meeting.epic.id);
            }
            setSelectedEpicIds(currentEpicIds);
        }
        
        setLinkEpicModalOpen(true);
    };

    const handleSaveEpicLink = async () => {
        if (!selectedMeeting) {
            notifications.show({
                title: "Error",
                message: "No meeting selected",
                color: "red",
            });
            return;
        }

        setLinkingEpic(true);
        try {
            const res = await fetch(`/api/meetings/${selectedMeeting.id}/epics`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ epic_ids: selectedEpicIds }),
            });
            if (!res.ok) throw new Error("Failed to link epics");
            notifications.show({
                title: "Success",
                message: `${selectedEpicIds.length} epic(s) linked successfully`,
                color: "green",
            });
            setLinkEpicModalOpen(false);
            await fetchMeetings();
        } catch (error: any) {
            notifications.show({
                title: "Error",
                message: error.message || "Failed to link epics",
                color: "red",
            });
        } finally {
            setLinkingEpic(false);
        }
    };

    const handleDismissMeeting = async (meetingId: string) => {
        // Optimistically remove the meeting from the UI
        const meetingToRemove = meetings.find(m => m.id === meetingId);
        setMeetings(prev => prev.filter(m => m.id !== meetingId));
        setDeletingMeetingId(meetingId);

        try {
            const res = await fetch(`/api/meetings/${meetingId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to dismiss meeting");
        } catch (error: any) {
            // Revert optimistic update on error
            if (meetingToRemove) {
                setMeetings(prev => [...prev, meetingToRemove].sort((a, b) => 
                    new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime()
                ));
            }
            notifications.show({
                title: "Error",
                message: error.message || "Failed to dismiss meeting",
                color: "red",
            });
        } finally {
            setDeletingMeetingId(null);
        }
    };

    // Check if user has access (CPO or SUPERADMIN)
    if (checkingRole) {
        return (
            <div className="pt-24 p-8 flex items-center justify-center min-h-screen">
                <PurpleLoader size="md" />
            </div>
        );
    }

    if (!hasAccess) {
        return (
            <div className="pt-24 p-8 flex items-center justify-center min-h-screen">
                <Card withBorder padding="xl" style={{ maxWidth: 600 }}>
                    <Stack gap="md" align="center">
                        <IconAlertCircle size={48} color="var(--color-error-base)" />
                        <Title order={2}>Access Denied</Title>
                        <Text c="dimmed" ta="center">
                            You do not have permission to access the Meetings section.
                        </Text>
                        <Button component={Link} href="/" variant="light">
                            Go to Home
                        </Button>
                    </Stack>
                </Card>
            </div>
        );
    }

    if (loading || checkingConnection) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <PurpleLoader size="lg" className="mb-4" />
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            <div style={{
              maxWidth: 'var(--page-container-max-width)',
              margin: '0 auto',
              paddingLeft: 'var(--page-container-padding-x)',
              paddingRight: 'var(--page-container-padding-x)',
              paddingTop: 'var(--page-container-padding-top)',
              paddingBottom: 'var(--spacing-8)'
            }}
            className="sm:px-6 lg:px-8"
            >
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-4">
                        <Title order={1} style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: 'var(--font-size-page-title)',
                            fontWeight: 'var(--font-weight-bold)',
                            color: 'var(--color-gray-900)'
                        }}>
                            Meetings
                        </Title>
                        {isConnected && (
                            <Button
                                leftSection={<IconRefresh size={18} />}
                                onClick={handleSync}
                                loading={syncing}
                                variant="outline"
                                color="blue"
                            >
                                Sync Calendar
                            </Button>
                        )}
                    </div>
                    {!isConnected && (
                        <Alert icon={<IconAlertCircle size={16} />} color="blue" className="mb-6">
                            Connect your Google Calendar in <Link href="/account" className="underline">Account Details</Link> to automatically detect check-in meetings. Meetings will be automatically linked to epics based on name matching.
                        </Alert>
                    )}
                </div>

                {meetings.length === 0 ? (
                    <Card className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                        <Text c="dimmed" size="lg" mb="md">
                            No meetings found
                        </Text>
                        {!isConnected && (
                            <Text size="sm" c="dimmed" mb="md">
                                Connect your Google Calendar in <Link href="/account" className="underline">Account Details</Link> to get started.
                            </Text>
                        )}
                        {isConnected && (
                            <Button onClick={handleSync} leftSection={<IconRefresh size={18} />} loading={syncing}>
                                Sync Calendar
                            </Button>
                        )}
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {meetings.map((meeting) => (
                            <Card key={meeting.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-start justify-between gap-4 mb-2">
                                            <Title order={3} className="text-xl font-semibold text-gray-900">
                                                {meeting.title}
                                            </Title>
                                            <Button
                                                size="xs"
                                                variant="subtle"
                                                color="red"
                                                leftSection={<IconX size={16} />}
                                                onClick={() => handleDismissMeeting(meeting.id)}
                                                loading={deletingMeetingId === meeting.id}
                                                title="Dismiss meeting"
                                            >
                                                Dismiss
                                            </Button>
                                        </div>
                                        <Group gap="xs" mb="sm">
                                            <Text size="sm" c="dimmed">
                                                {new Date(meeting.meeting_date).toLocaleDateString()} at{" "}
                                                {new Date(meeting.meeting_date).toLocaleTimeString()}
                                            </Text>
                                            {meeting.duration_minutes && (
                                                <>
                                                    <Text size="sm" c="dimmed">
                                                        •
                                                    </Text>
                                                    <Text size="sm" c="dimmed">
                                                        {meeting.duration_minutes} min
                                                    </Text>
                                                </>
                                            )}
                                        </Group>
                                        {meeting.epic && (
                                            <Badge color="blue" variant="light" mb="sm">
                                                Auto-linked: {meeting.epic.name}
                                            </Badge>
                                        )}
                                        {meeting.linked_epic && (
                                            <Badge color="green" variant="light" mb="sm">
                                                Linked: {meeting.linked_epic.name}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                <Divider my="md" />

                                <Group gap="sm" mb="md">
                                    <Button
                                        size="xs"
                                        variant="outline"
                                        leftSection={<IconUpload size={16} />}
                                        onClick={() => handleOpenTranscriptModal(meeting)}
                                    >
                                        {meeting.transcript?.[0] ? "Edit Transcript" : "Add Transcript"}
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="outline"
                                        leftSection={<IconLink size={16} />}
                                        onClick={() => handleLinkEpic(meeting)}
                                    >
                                        Link Epic
                                    </Button>
                                    {meeting.transcript?.[0] && (
                                        <Button
                                            size="xs"
                                            variant="filled"
                                            color="indigo"
                                            leftSection={<IconBrain size={16} />}
                                            onClick={() => handleExtractSnippets(meeting)}
                                            loading={extractingSnippets}
                                        >
                                            Extract Snippets
                                        </Button>
                                    )}
                                </Group>

                                {meeting.transcript?.[0] && (
                                    <div className="mb-4">
                                        <Text size="xs" fw={600} mb="xs" c="dimmed">
                                            TRANSCRIPT
                                        </Text>
                                        <Text size="sm" className="bg-gray-50 p-3 rounded border max-h-32 overflow-y-auto">
                                            {meeting.transcript[0].transcript_text.substring(0, 300)}
                                            {meeting.transcript[0].transcript_text.length > 300 && "..."}
                                        </Text>
                                    </div>
                                )}

                                {meeting.snippets && meeting.snippets.length > 0 && (
                                    <div>
                                        <Text size="xs" fw={600} mb="xs" c="dimmed">
                                            EXTRACTED SNIPPETS ({meeting.snippets.length})
                                        </Text>
                                        <div className="space-y-2">
                                            {meeting.snippets.map((snippet) => (
                                                <Card
                                                    key={snippet.id}
                                                    className="bg-indigo-50 border border-indigo-200 p-3 rounded"
                                                >
                                                    <Group justify="space-between" mb="xs">
                                                        {snippet.criterion ? (
                                                            <Badge color="indigo" size="sm">
                                                                {snippet.criterion.label}
                                                            </Badge>
                                                        ) : (
                                                            <Badge color="gray" size="sm">
                                                                General
                                                            </Badge>
                                                        )}
                                                        <Text size="xs" c="dimmed">
                                                            {(snippet.relevance_score * 100).toFixed(0)}% relevant
                                                        </Text>
                                                    </Group>
                                                    <Text size="sm">{snippet.snippet_text}</Text>
                                                    {snippet.criterion && (
                                                        <Link
                                                            href={`/epics/${meeting.linked_epic?.id || meeting.epic?.id}?criterion=${snippet.criterion.id}`}
                                                            className="text-xs text-indigo-600 hover:underline mt-2 inline-block"
                                                        >
                                                            View in Epic →
                                                        </Link>
                                                    )}
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                )}

                {/* Transcript Modal */}
                <Modal
                    opened={transcriptModalOpen}
                    onClose={() => setTranscriptModalOpen(false)}
                    title="Meeting Transcript"
                    size="xl"
                >
                    <Stack gap="md">
                        <Textarea
                            placeholder="Paste the meeting transcript here..."
                            value={transcriptText}
                            onChange={(e) => setTranscriptText(e.target.value)}
                            minRows={15}
                            autosize
                        />
                        <Group justify="flex-end">
                            <Button variant="outline" onClick={() => setTranscriptModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleSaveTranscript} loading={uploadingTranscript}>
                                Save Transcript
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                {/* Link Epic Modal */}
                <Modal
                    opened={linkEpicModalOpen}
                    onClose={() => setLinkEpicModalOpen(false)}
                    title="Link Meeting to Epics"
                    size="xl"
                >
                    <Stack gap="md">
                        {epics.length === 0 ? (
                            <Text c="dimmed" ta="center" py="xl">
                                No epics available
                            </Text>
                        ) : (
                            <div className="max-h-[600px] overflow-y-auto">
                                {groupEpicsByRelease().length === 0 ? (
                                    <Text c="dimmed" ta="center" py="xl">
                                        No epics found
                                    </Text>
                                ) : (
                                    groupEpicsByRelease().map((group, groupIndex) => (
                                        <div key={groupIndex} className="mb-8 last:mb-0">
                                            <div className="mb-2">
                                                <Text fw={600} size="lg" className="text-gray-900">
                                                    {group.releaseName}
                                                </Text>
                                                {group.releaseDate && (
                                                    <Text size="sm" c="dimmed" className="text-gray-600">
                                                        {new Date(group.releaseDate).toLocaleDateString()}
                                                    </Text>
                                                )}
                                            </div>
                                            <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                                                <table className="min-w-full divide-y divide-purple-200">
                                                    <thead className="bg-purple-100">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-8"></th>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Name</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-purple-200">
                                                        {group.epics.map((epic) => (
                                                            <tr key={epic.id} className="hover:bg-purple-50 transition-colors">
                                                                <td className="px-4 py-3">
                                                                    <Checkbox
                                                                        checked={selectedEpicIds.includes(epic.id)}
                                                                        onChange={(e) => {
                                                                            if (e.currentTarget.checked) {
                                                                                setSelectedEpicIds([...selectedEpicIds, epic.id]);
                                                                            } else {
                                                                                setSelectedEpicIds(selectedEpicIds.filter(id => id !== epic.id));
                                                                            }
                                                                        }}
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <Text className="font-medium text-gray-900">
                                                                        {epic.name}
                                                                    </Text>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                        <Group justify="space-between" mt="md">
                            <Text size="sm" c="dimmed">
                                {selectedEpicIds.length} epic{selectedEpicIds.length !== 1 ? 's' : ''} selected
                            </Text>
                            <Group>
                                <Button variant="outline" onClick={() => setLinkEpicModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleSaveEpicLink} loading={linkingEpic}>
                                    Link Epic{selectedEpicIds.length !== 1 ? 's' : ''}
                                </Button>
                            </Group>
                        </Group>
                    </Stack>
                </Modal>
            </div>
        </div>
    );
}

