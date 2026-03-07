"use client";

import React, { useState, useEffect } from "react";
import { Card, Badge, Text, Textarea, Anchor, Group } from "@mantine/core";
import { IconSparkles, IconExternalLink } from "@tabler/icons-react";
import { Loader } from "@/components/hoberman";

const CLEARMAP_TALK_TRACKS_URL = "https://clearmap.netlify.app/talk_tracks";

export interface TalkTrackApiResponse {
  epicId?: string;
  epicRef?: string;
  epicName?: string | null;
  narrationId?: string | null;
  status?: string;
  talkingPoints?: string[] | null;
  baselineSections?: {
    before_state?: string;
    whats_changing?: string;
    who_cares_most?: string;
    the_visual?: string;
    how_to_turn_on?: string;
  } | null;
  keyInternalPoints?: string[] | null;
  questions?: Array< { promptKey: string; question: string; answer: string } > | null;
  videoUrl?: string | null;
  videoStatus?: string | null;
  generatedAt?: string | null;
}

function getAnswerByKey(questions: TalkTrackApiResponse["questions"], promptKey: string): string {
  if (!questions?.length) return "";
  const q = questions.find((x) => x.promptKey === promptKey);
  return q?.answer ?? "";
}

export interface TalkTrackTabProps {
  epicId: string;
  epicName: string;
  /** Display label e.g. "[APP-E-260]" */
  featureRef?: string;
  /** Aha epic reference for API and ClearMAP link, e.g. "APP-E-260" */
  epicRefForApi?: string;
}

export function TalkTrackTab({
  epicId,
  epicName,
  featureRef = "",
  epicRefForApi = "",
}: TalkTrackTabProps) {
  const [loading, setLoading] = useState(!!epicRefForApi);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TalkTrackApiResponse | null>(null);

  const [beforeState, setBeforeState] = useState("");
  const [whatsChanging, setWhatsChanging] = useState("");
  const [whoCaresMost, setWhoCaresMost] = useState("");
  const [visual, setVisual] = useState("");
  const [howToTurnOn, setHowToTurnOn] = useState("");
  const [timelineRisks, setTimelineRisks] = useState("");

  const hasContent =
    data &&
    (data.narrationId ||
      (data.talkingPoints && data.talkingPoints.length > 0) ||
      (data.baselineSections && Object.values(data.baselineSections).some(Boolean)) ||
      (data.questions && data.questions.length > 0));

  const clearMapLink = epicRefForApi
    ? `${CLEARMAP_TALK_TRACKS_URL}?epic_id=${encodeURIComponent(epicRefForApi)}`
    : CLEARMAP_TALK_TRACKS_URL;

  useEffect(() => {
    if (!epicRefForApi.trim()) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/talk-track?epic_id=${encodeURIComponent(epicRefForApi.trim())}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.status === 401) {
          setError("Invalid or expired JWT. Log into ClearMAP, open the browser console, and run the snippet in docs/TALK_TRACK_API.md to copy a fresh access_token into CLEARMAP_JWT.");
          setData(null);
          return;
        }
        if (json.error && (json.status === 503 || json.status === 400 || json.status === 404)) {
          const detail = json.detail ? ` — ${json.detail}` : json.status ? ` (${json.status})` : "";
          setError(`${json.error}${detail}`);
          setData(null);
          return;
        }
        if (json.error) {
          const detail = json.detail ? ` — ${json.detail}` : json.status ? ` (${json.status})` : "";
          setError(`${json.error}${detail}`);
          setData(null);
          return;
        }
        setData(json);
        const sections = json.baselineSections || {};
        setBeforeState(sections.before_state ?? "");
        setWhatsChanging(sections.whats_changing ?? "");
        setWhoCaresMost(sections.who_cares_most ?? "");
        setVisual(sections.the_visual ?? "");
        setHowToTurnOn(sections.how_to_turn_on ?? "");
        setTimelineRisks(getAnswerByKey(json.questions, "timeline_confidence"));
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to load talk track — ${message}`);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [epicRefForApi]);

  const talkingPoints = data?.talkingPoints ?? [];
  const questions = data?.questions ?? [];
  const targetCustomerAnswer = getAnswerByKey(questions, "target_customer");
  const strategicValueAnswer = getAnswerByKey(questions, "strategic_value");
  const competitiveAngleAnswer = getAnswerByKey(questions, "competitive_angle");
  const keyInternalPoints = data?.keyInternalPoints ?? [];
  const videoReady = data?.videoStatus === "ready" && data?.videoUrl;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" style={{ minHeight: 360 }}>
        <Loader size={48} />
      </div>
    );
  }

  if (!hasContent && !loading) {
    return (
      <Card
        withBorder
        radius="lg"
        padding="lg"
        style={{
          backgroundColor: "var(--color-white)",
          borderColor: "var(--color-gray-200)",
          maxWidth: 560,
        }}
      >
        <Text size="lg" fw={600} mb="xs" style={{ fontFamily: "var(--font-heading)" }}>
          Talk Track
        </Text>
        <Text size="sm" c="dimmed" mb="md" style={{ fontFamily: "var(--font-body)" }}>
          {epicRefForApi
            ? "No talk track content for this epic yet."
            : "Add an epic reference (e.g. APP-E-260) to load talk track data, or create content in ClearMAP."}
        </Text>
        <Anchor
          href={clearMapLink}
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Group gap={6} wrap="nowrap">
            <IconExternalLink size={14} />
            <span>Open ClearMAP Talk Tracks</span>
          </Group>
        </Anchor>
        {error && (
          <Text size="xs" c="dimmed" mt="sm" style={{ fontFamily: "var(--font-body)" }}>
            {error}
          </Text>
        )}
      </Card>
    );
  }

  return (
    <div
      className="grid gap-4 grid-cols-1 lg:grid-cols-2"
      style={{ minHeight: 560 }}
    >
      {/* Left: Talk Track (external) */}
      <div className="flex flex-col min-h-0">
        <div className="mb-2 shrink-0 flex items-center gap-2 flex-wrap">
          <Text
            size="lg"
            fw={700}
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-gray-900)" }}
          >
            Talk Track (external)
          </Text>
          <Badge size="sm" color="blue" variant="light" leftSection={<IconSparkles size={12} />}>
            AI-Based
          </Badge>
        </div>
        <Card
          withBorder
          radius="lg"
          padding="md"
          className="flex flex-col overflow-hidden flex-1 min-h-0"
          style={{
            backgroundColor: "var(--color-white)",
            borderColor: "var(--color-gray-200)",
          }}
        >
          <div className="flex-1 overflow-y-auto pr-1" style={{ minHeight: 0 }}>
          <Text size="sm" fw={600} mb="xs" style={{ fontFamily: "var(--font-heading)" }}>
            Key talking points
          </Text>
          {talkingPoints.length > 0 ? (
            <ul
              className="list-disc pl-5 space-y-1 text-sm mb-4"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-gray-700)" }}
            >
              {talkingPoints.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          ) : (
            <Text size="sm" c="dimmed" mb="md" style={{ fontFamily: "var(--font-body)" }}>
              No talking points yet.
            </Text>
          )}

          <div className="rounded-lg mb-4" style={{ backgroundColor: "var(--color-gray-100)" }}>
            <div className="px-3 py-2">
              <Text size="sm" fw={600} style={{ fontFamily: "var(--font-heading)" }}>
                Your script
              </Text>
              <Text size="xs" c="dimmed" style={{ fontFamily: "var(--font-body)" }}>
                Generated from Aha data. Edit each section as needed.
              </Text>
            </div>
          </div>

          <Text size="sm" fw={600} mb="xs" style={{ fontFamily: "var(--font-heading)" }}>
            The Before State (~30 sec)
          </Text>
          <Textarea
            minRows={2}
            maxRows={4}
            value={beforeState}
            onChange={(e) => setBeforeState(e.target.value)}
            placeholder="Describe the previous state..."
            styles={{
              input: {
                fontFamily: "var(--font-body)",
                fontSize: "var(--font-size-sm)",
                border: "none",
                borderImage: "none",
              },
            }}
            classNames={{ input: "text-gray-700" }}
            className="mb-4"
          />

          <Text size="sm" fw={600} mb="xs" style={{ fontFamily: "var(--font-heading)" }}>
            What&apos;s Changing & Why It Matters (~60 sec)
          </Text>
          <Textarea
            minRows={2}
            maxRows={4}
            value={whatsChanging}
            onChange={(e) => setWhatsChanging(e.target.value)}
            placeholder="Explain the change and impact..."
            styles={{
              input: {
                fontFamily: "var(--font-body)",
                fontSize: "var(--font-size-sm)",
                border: "none",
                borderImage: "none",
              },
            }}
            classNames={{ input: "text-gray-700" }}
            className="mb-4"
          />

          <Text size="sm" fw={600} mb="xs" style={{ fontFamily: "var(--font-heading)" }}>
            Who Cares Most (~30 sec)
          </Text>
          <Textarea
            minRows={1}
            maxRows={3}
            value={whoCaresMost}
            onChange={(e) => setWhoCaresMost(e.target.value)}
            placeholder="Target personas and use cases..."
            styles={{
              input: {
                fontFamily: "var(--font-body)",
                fontSize: "var(--font-size-sm)",
                border: "none",
                borderImage: "none",
              },
            }}
            classNames={{ input: "text-gray-700" }}
            className="mb-4"
          />

          <Text size="sm" fw={600} mb="xs" style={{ fontFamily: "var(--font-heading)" }}>
            The Visual (~30 sec)
          </Text>
          <Textarea
            minRows={2}
            maxRows={3}
            value={visual}
            onChange={(e) => setVisual(e.target.value)}
            placeholder="Describe the visual/demo..."
            styles={{
              input: {
                fontFamily: "var(--font-body)",
                fontSize: "var(--font-size-sm)",
                border: "none",
                borderImage: "none",
              },
            }}
            classNames={{ input: "text-gray-700" }}
            className="mb-4"
          />

          <Text size="sm" fw={600} mb="xs" style={{ fontFamily: "var(--font-heading)" }}>
            How to Turn It On / Buy It (~20 sec)
          </Text>
          <Textarea
            minRows={1}
            maxRows={2}
            value={howToTurnOn}
            onChange={(e) => setHowToTurnOn(e.target.value)}
            placeholder="How to enable or purchase..."
            styles={{
              input: {
                fontFamily: "var(--font-body)",
                fontSize: "var(--font-size-sm)",
                border: "none",
                borderImage: "none",
              },
            }}
            classNames={{ input: "text-gray-700" }}
            className="mb-4"
          />

          <Text size="sm" fw={600} mb="xs" style={{ fontFamily: "var(--font-heading)" }}>
            AI Presenter Video
          </Text>
          {videoReady && data?.videoUrl ? (
            <div
              className="rounded-lg border overflow-hidden bg-black"
              style={{ borderColor: "var(--color-gray-200)", minHeight: 180 }}
            >
              <video
                src={data.videoUrl}
                controls
                className="w-full"
                style={{ maxHeight: 320 }}
                preload="metadata"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          ) : (
            <div
              className="rounded-lg border flex items-center justify-center"
              style={{
                borderColor: "var(--color-gray-200)",
                backgroundColor: "rgba(34, 197, 94, 0.06)",
                minHeight: 180,
              }}
            >
              <div className="text-center text-sm text-gray-500" style={{ fontFamily: "var(--font-body)" }}>
                No video yet. Create one in{" "}
                <Anchor href={clearMapLink} target="_blank" rel="noopener noreferrer" size="sm">
                  ClearMAP
                </Anchor>
                .
              </div>
            </div>
          )}
        </div>
      </Card>
      </div>

      {/* Right: Between Us (internal ClearCo) */}
      <div className="flex flex-col min-h-0">
        <div className="mb-2 shrink-0 flex items-center gap-2 flex-wrap">
          <Text
            size="lg"
            fw={700}
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-gray-900)" }}
          >
            Between Us (internal ClearCo)
          </Text>
          <Badge size="sm" color="blue" variant="light" leftSection={<IconSparkles size={12} />}>
            AI-Based
          </Badge>
        </div>
        <Card
          withBorder
          radius="lg"
          padding="md"
          className="flex flex-col overflow-hidden flex-1 min-h-0"
          style={{
            backgroundColor: "var(--color-white)",
            borderColor: "var(--color-gray-200)",
          }}
        >
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4" style={{ minHeight: 0 }}>
            <section>
              <Text size="sm" fw={600} mb={4} style={{ fontFamily: "var(--font-heading)" }}>
                Target customer or persona
            </Text>
            <Text size="xs" c="dimmed" mb="xs" style={{ fontFamily: "var(--font-body)" }}>
              Which buyer role, company size, or industry will feel this most?
            </Text>
            {targetCustomerAnswer ? (
              <Text size="sm" style={{ fontFamily: "var(--font-body)", color: "var(--color-gray-700)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                {targetCustomerAnswer}
              </Text>
            ) : (
              <Text size="sm" c="dimmed" style={{ fontFamily: "var(--font-body)" }}>
                Not filled yet.
              </Text>
            )}
          </section>

          <section>
            <Text size="sm" fw={600} mb={4} style={{ fontFamily: "var(--font-heading)" }}>
              Strategic value for customers
            </Text>
            <Text size="xs" c="dimmed" mb="xs" style={{ fontFamily: "var(--font-body)" }}>
              Think ROI, risk reduction, competitive advantage, or time saved.
            </Text>
            {strategicValueAnswer ? (
              <Text size="sm" style={{ fontFamily: "var(--font-body)", color: "var(--color-gray-700)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                {strategicValueAnswer}
              </Text>
            ) : keyInternalPoints.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1 text-sm" style={{ fontFamily: "var(--font-body)", color: "var(--color-gray-700)" }}>
                {keyInternalPoints.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <Text size="sm" c="dimmed" style={{ fontFamily: "var(--font-body)" }}>
                Not filled yet.
              </Text>
            )}
          </section>

          <section>
            <Text size="sm" fw={600} mb={4} style={{ fontFamily: "var(--font-heading)" }}>
              Competitive angle? How does this position us vs. alternatives?
            </Text>
            <Text size="xs" c="dimmed" mb="xs" style={{ fontFamily: "var(--font-body)" }}>
              Consider Workday, BambooHR, and other competitors.
            </Text>
            {competitiveAngleAnswer ? (
              <Text size="sm" style={{ fontFamily: "var(--font-body)", color: "var(--color-gray-700)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                {competitiveAngleAnswer}
              </Text>
            ) : (
              <Text size="sm" c="dimmed" style={{ fontFamily: "var(--font-body)" }}>
                Not filled yet.
              </Text>
            )}
          </section>

          <section>
            <Text size="sm" fw={600} mb={4} style={{ fontFamily: "var(--font-heading)" }}>
              Timeline confidence and key risks
            </Text>
            <Text size="xs" c="dimmed" mb="xs" style={{ fontFamily: "var(--font-body)" }}>
              What could delay this? What are the dependencies?
            </Text>
            {timelineRisks ? (
              <Text size="sm" style={{ fontFamily: "var(--font-body)", color: "var(--color-gray-700)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                {timelineRisks}
              </Text>
            ) : (
              <Text size="sm" c="dimmed" style={{ fontFamily: "var(--font-body)" }}>
                Not filled yet.
              </Text>
            )}
          </section>

          <Text size="xs" c="dimmed" mt="md" style={{ fontFamily: "var(--font-body)" }}>
            Edit and manage talk tracks in{" "}
            <Anchor href={clearMapLink} target="_blank" rel="noopener noreferrer" size="xs">
              ClearMAP
            </Anchor>
            .
          </Text>
        </div>
      </Card>
      </div>
    </div>
  );
}
