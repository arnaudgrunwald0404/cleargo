import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Snippet {
    snippet_text: string;
    criterion_id?: string;
    relevance_score: number;
    context_start?: number;
    context_end?: number;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get meeting and transcript
        const { data: meeting, error: meetingError } = await supabase
            .from("meeting")
            .select("*, transcript:meeting_transcript(transcript_text)")
            .eq("id", id)
            .single();

        if (meetingError || !meeting) {
            return NextResponse.json(
                { error: "Meeting not found" },
                { status: 404 }
            );
        }

        const transcript = (meeting as any).transcript?.[0]?.transcript_text;
        if (!transcript) {
            return NextResponse.json(
                { error: "No transcript found for this meeting" },
                { status: 400 }
            );
        }

        // Get epic_id (prefer linked_epic_id, fallback to epic_id)
        const epicId = (meeting as any).linked_epic_id || (meeting as any).epic_id;
        if (!epicId) {
            return NextResponse.json(
                { error: "Meeting must be linked to an epic to extract snippets" },
                { status: 400 }
            );
        }

        // Get all criteria for this epic
        const { data: criteria } = await supabase
            .from("epic_criterion_status")
            .select("criterion_id, criterion:criterion_id(id, label, category, description)")
            .eq("epic_id", epicId);

        if (!criteria || criteria.length === 0) {
            return NextResponse.json(
                { error: "No criteria found for this epic" },
                { status: 400 }
            );
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

        // Call OpenAI to extract snippets
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            return NextResponse.json(
                { error: "OpenAI API key not configured" },
                { status: 500 }
            );
        }

        // Build criteria list for prompt
        const criteriaList = criteria
            .map((c: any) => {
                const crit = c.criterion;
                return `- ${crit.label} (${crit.category}): ${crit.description || "No description"}`;
            })
            .join("\n");

        const prompt = `You are analyzing a meeting transcript to extract relevant snippets that relate to launch readiness criteria.

EPIC: ${(meeting as any).title}
MEETING DATE: ${new Date((meeting as any).meeting_date).toLocaleDateString()}

CRITERIA TO MATCH AGAINST:
${criteriaList}

TRANSCRIPT:
${transcript}

Please extract interesting snippets from the transcript that relate to any of the criteria above. For each snippet:
1. Extract a meaningful quote or summary (2-4 sentences)
2. Identify which criterion it relates to (use the criterion label)
3. Provide a relevance score from 0.0 to 1.0

Return your response as a JSON array of objects with this structure:
[
  {
    "snippet_text": "The actual quote or summary",
    "criterion_id": "uuid-of-criterion-if-matched",
    "relevance_score": 0.85,
    "context_start": 0,
    "context_end": 100
  }
]

If a snippet doesn't match a specific criterion but is still relevant to the epic, you can omit criterion_id or set it to null.
Return ONLY the JSON array, no other text.`;

        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a helpful assistant that extracts relevant snippets from meeting transcripts. Always return valid JSON arrays.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.3,
            }),
        });

        if (!openaiResponse.ok) {
            const errorData = await openaiResponse.text();
            console.error("OpenAI API error:", errorData);
            return NextResponse.json(
                { error: "Failed to extract snippets from OpenAI" },
                { status: 500 }
            );
        }

        const openaiData = await openaiResponse.json();
        const content = openaiData.choices[0]?.message?.content;

        if (!content) {
            return NextResponse.json(
                { error: "No content returned from OpenAI" },
                { status: 500 }
            );
        }

        // Parse JSON response
        let snippets: Snippet[];
        try {
            // Remove markdown code blocks if present
            const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            snippets = JSON.parse(cleanedContent);
        } catch (parseError) {
            console.error("Failed to parse OpenAI response:", content);
            return NextResponse.json(
                { error: "Failed to parse snippets from OpenAI response" },
                { status: 500 }
            );
        }

        // Map criterion labels to IDs
        const criterionMap = new Map<string, string>();
        criteria.forEach((c: any) => {
            if (c.criterion) {
                criterionMap.set(c.criterion.label.toLowerCase(), c.criterion_id);
            }
        });

        // Insert snippets into database
        const snippetsToInsert = snippets.map((snippet) => {
            // Try to find criterion_id if snippet has a criterion reference
            let criterionId = snippet.criterion_id;
            if (!criterionId && snippet.snippet_text) {
                // Try to match by label in snippet text
                for (const [label, id] of criterionMap.entries()) {
                    if (snippet.snippet_text.toLowerCase().includes(label)) {
                        criterionId = id;
                        break;
                    }
                }
            }

            return {
                meeting_id: id,
                epic_id: epicId,
                criterion_id: criterionId || null,
                snippet_text: snippet.snippet_text,
                relevance_score: snippet.relevance_score || 0.5,
                context_start: snippet.context_start || null,
                context_end: snippet.context_end || null,
                extracted_by: appUser.id,
            };
        });

        const { data: insertedSnippets, error: insertError } = await supabase
            .from("meeting_snippet")
            .insert(snippetsToInsert)
            .select();

        if (insertError) {
            console.error("Error inserting snippets:", insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        return NextResponse.json({
            snippets: insertedSnippets,
            count: insertedSnippets?.length || 0,
        });
    } catch (error: any) {
        console.error("Error in POST /api/meetings/[id]/extract-snippets:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}




