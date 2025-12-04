import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Google Calendar credentials not configured");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to refresh token: ${error}`);
    }

    return await response.json();
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get user ID from app_user table
        const { data: appUser } = await supabase
            .from("app_user")
            .select("id")
            .eq("email", user.email)
            .single();

        if (!appUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Get active Google Calendar integration
        const { data: integration, error: integrationError } = await supabase
            .from("google_calendar_integrations")
            .select("*")
            .eq("user_id", appUser.id)
            .eq("is_active", true)
            .single();

        if (integrationError || !integration) {
            return NextResponse.json(
                { error: "Google Calendar not connected" },
                { status: 404 }
            );
        }

        // Check if token needs refresh
        let accessToken = integration.access_token;
        const expiresAt = new Date(integration.token_expires_at);
        if (expiresAt <= new Date()) {
            // Token expired - need to refresh
            if (!integration.refresh_token) {
                return NextResponse.json(
                    { 
                        error: "Access token expired and no refresh token available. Please reconnect your Google Calendar in Account Details.",
                        requiresReauth: true
                    },
                    { status: 401 }
                );
            }

            try {
                const refreshed = await refreshAccessToken(integration.refresh_token);
                accessToken = refreshed.access_token;

                // Update token in database
                const newExpiresAt = new Date();
                newExpiresAt.setSeconds(newExpiresAt.getSeconds() + refreshed.expires_in);

                await supabase
                    .from("google_calendar_integrations")
                    .update({
                        access_token: accessToken,
                        token_expires_at: newExpiresAt.toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", integration.id);
            } catch (refreshError: any) {
                console.error("Error refreshing token:", refreshError);
                return NextResponse.json(
                    { 
                        error: "Failed to refresh access token. Please reconnect your Google Calendar in Account Details.",
                        requiresReauth: true
                    },
                    { status: 401 }
                );
            }
        }

        // Get check-in keywords from settings
        const { data: settings } = await supabase
            .from("app_settings")
            .select("check_in_keywords")
            .eq("id", 1)
            .single();

        const keywords = settings?.check_in_keywords || [
            "check-in",
            "checkin",
            "standup",
            "sync",
            "stand-up",
            "status update",
        ];

        // Fetch events from Google Calendar
        const timeMin = new Date();
        timeMin.setDate(timeMin.getDate() - 30); // Last 30 days
        const timeMax = new Date();
        timeMax.setDate(timeMax.getDate() + 30); // Next 30 days

        const calendarResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id || "primary"}/events?` +
                new URLSearchParams({
                    timeMin: timeMin.toISOString(),
                    timeMax: timeMax.toISOString(),
                    singleEvents: "true",
                    orderBy: "startTime",
                }),
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        if (!calendarResponse.ok) {
            const error = await calendarResponse.text();
            console.error("Google Calendar API error:", error);
            return NextResponse.json(
                { error: "Failed to fetch calendar events" },
                { status: 500 }
            );
        }

        const calendarData = await calendarResponse.json();
        const events = calendarData.items || [];

        // Filter events that match check-in keywords
        const checkInEvents = events.filter((event: any) => {
            const title = (event.summary || "").toLowerCase();
            const description = (event.description || "").toLowerCase();
            return keywords.some((keyword: string) => title.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase()));
        });

        // Get all epics for name matching
        const { data: epics } = await supabase.from("epic").select("id, name");

        const epicMap = new Map<string, string>();
        epics?.forEach((epic) => {
            epicMap.set(epic.name.toLowerCase(), epic.id);
        });

        // Create or update meetings
        const meetingsCreated = [];
        for (const event of checkInEvents) {
            // Try to match epic by name in event title
            let epicId: string | null = null;
            const eventTitle = (event.summary || "").toLowerCase();
            for (const [epicName, epicIdValue] of epicMap.entries()) {
                if (eventTitle.includes(epicName)) {
                    epicId = epicIdValue;
                    break;
                }
            }

            const startTime = event.start?.dateTime || event.start?.date;
            const endTime = event.end?.dateTime || event.end?.date;
            const durationMinutes = startTime && endTime
                ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
                : null;

            // Check if meeting already exists
            const { data: existing } = await supabase
                .from("meeting")
                .select("id")
                .eq("calendar_event_id", event.id)
                .single();

            if (existing) {
                // Update existing meeting
                await supabase
                    .from("meeting")
                    .update({
                        title: event.summary,
                        description: event.description,
                        meeting_date: startTime,
                        duration_minutes: durationMinutes,
                        epic_id: epicId,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", existing.id);
                meetingsCreated.push(existing.id);
            } else {
                // Create new meeting
                const { data: newMeeting } = await supabase
                    .from("meeting")
                    .insert({
                        title: event.summary,
                        description: event.description,
                        meeting_date: startTime,
                        duration_minutes: durationMinutes,
                        calendar_event_id: event.id,
                        epic_id: epicId,
                        created_by: appUser.id,
                    })
                    .select()
                    .single();

                if (newMeeting) {
                    meetingsCreated.push(newMeeting.id);
                }
            }
        }

        return NextResponse.json({
            success: true,
            eventsFound: checkInEvents.length,
            meetingsCreated: meetingsCreated.length,
            meetingIds: meetingsCreated,
        });
    } catch (error: any) {
        console.error("Error in Google Calendar sync:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

