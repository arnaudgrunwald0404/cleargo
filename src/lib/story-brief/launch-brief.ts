/**
 * Launch-level Story Brief derivation.
 *
 * Aggregates epic-level Story Briefs into a launch-level view. The launch brief
 * is not separately authored — it is computed from its epics' briefs plus launch
 * metadata (target date, tier, channels).
 */

import type { StoryBriefContent } from '@/lib/story-brief/generator';
import type { Launch } from '@/types/launches';
import { assessCompleteness } from '@/lib/story-brief/completeness';

// ── Public types ────────────────────────────────────────────────────────────────

export interface LaunchBrief {
  /** Launch metadata */
  launch: Pick<Launch, 'id' | 'name' | 'tier' | 'target_launch_date'>;

  /** One summary per epic */
  epics: LaunchBriefEpic[];

  /** Aggregate completeness: min of all epic scores */
  overallScore: number;

  /** True when every epic brief is complete */
  isComplete: boolean;

  /** Epics with no brief at all */
  missingBriefEpicIds: string[];

  /** Epics with incomplete briefs */
  incompleteEpicIds: string[];

  /** Combined personas across all epics (deduplicated by persona name) */
  personas: Array<{ persona: string; trigger_and_need: string; lead_message: string; epic_name: string }>;

  /** Combined open decisions across all epics */
  openDecisions: Array<{
    item: string;
    owner: string;
    epic_name: string;
    gate_type: string;
    status?: string;
  }>;

  /** Combined soft commitments (deduplicated) */
  softCommitments: string[];

  /** Combined downstream deliverables chain */
  downstreamChain: string[];
}

export interface LaunchBriefEpic {
  epicId: string;
  epicName: string;
  pmOwnerEmail: string | null;
  score: number;
  complete: boolean;
  content: StoryBriefContent | null;
}

// ── Derivation ──────────────────────────────────────────────────────────────────

/**
 * Derive a launch-level Story Brief from a launch and its epic briefs.
 */
export function deriveLaunchBrief(
  launch: Pick<Launch, 'id' | 'name' | 'tier' | 'target_launch_date'>,
  epics: Array<{
    epicId: string;
    epicName: string;
    pmOwnerEmail: string | null;
    content: StoryBriefContent | null;
  }>
): LaunchBrief {
  const epicBriefs: LaunchBriefEpic[] = epics.map((e) => {
    const completeness = assessCompleteness(e.content);
    return {
      epicId: e.epicId,
      epicName: e.epicName,
      pmOwnerEmail: e.pmOwnerEmail,
      score: completeness.score,
      complete: completeness.complete,
      content: e.content,
    };
  });

  const missingBriefEpicIds = epicBriefs
    .filter((e) => e.content === null)
    .map((e) => e.epicId);

  const incompleteEpicIds = epicBriefs
    .filter((e) => e.content !== null && !e.complete)
    .map((e) => e.epicId);

  // Overall score: min of all epic scores (weakest link)
  const scores = epicBriefs.map((e) => e.score);
  const overallScore = scores.length > 0 ? Math.min(...scores) : 0;

  const isComplete =
    epicBriefs.length > 0 && epicBriefs.every((e) => e.complete);

  // Combine personas (deduplicate by persona name)
  const personaMap = new Map<string, LaunchBrief['personas'][number]>();
  for (const e of epicBriefs) {
    if (!e.content?.personas) continue;
    for (const p of e.content.personas) {
      const key = p.persona?.toLowerCase() ?? '';
      if (!personaMap.has(key)) {
        personaMap.set(key, { ...p, epic_name: e.epicName });
      }
    }
  }

  // Combine open decisions
  const openDecisions: LaunchBrief['openDecisions'] = [];
  for (const e of epicBriefs) {
    if (!e.content?.open_decisions) continue;
    for (const d of e.content.open_decisions) {
      openDecisions.push({
        item: d.item ?? '',
        owner: d.owner ?? 'Unassigned',
        epic_name: e.epicName,
        gate_type: d.gate_type ?? 'other',
        status: d.status,
      });
    }
  }

  // Combine soft commitments (deduplicate)
  const commitmentSet = new Set<string>();
  for (const e of epicBriefs) {
    if (!e.content?.soft_commitments) continue;
    for (const c of e.content.soft_commitments) {
      commitmentSet.add(c);
    }
  }

  // Combine downstream deliverables chain
  const chainSet = new Set<string>();
  for (const e of epicBriefs) {
    if (!e.content?.downstream_deliverables?.chain) continue;
    for (const item of e.content.downstream_deliverables.chain) {
      chainSet.add(item);
    }
  }

  return {
    launch,
    epics: epicBriefs,
    overallScore,
    isComplete,
    missingBriefEpicIds,
    incompleteEpicIds,
    personas: Array.from(personaMap.values()),
    openDecisions,
    softCommitments: Array.from(commitmentSet),
    downstreamChain: Array.from(chainSet),
  };
}