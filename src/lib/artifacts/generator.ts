/**
 * One drafting pipeline for all five artifacts.
 *
 * The shape is taken from src/lib/story-brief/generator.ts, which works: gather
 * grounded facts, call the model with a schema, then re-check the output
 * server-side rather than trusting the model's self-report. The difference is
 * that everything artifact-specific comes from the registry, so adding a sixth
 * document is a registry entry and a prompt, not a second pipeline.
 *
 * `generateObject` is imported dynamically for the same reason the epic version
 * does it: jsdom lacks TransformStream, which the AI SDK needs at import time,
 * and the pure functions in this module must stay unit-testable.
 */
import { resolveModelChain, runWithModelFallback } from '@/lib/ai/resolve-model';
import type { ArtifactType } from '@/types/artifacts';
import { getArtifactDefinition } from './registry';
import { buildArtifactPrompt, GROUNDING_RULES } from './prompts';
import {
    assembleLaunchContext,
    renderLaunchFacts,
    buildReferenceText,
    renderHarvestForPrompt,
    type LaunchArtifactContext,
} from './context';
import { postProcessGrounding, collectOpenFlags } from './grounding';
import type { RawFlag } from './flags';

export interface GenerateArtifactInput {
    launchId: string;
    artifactType: ArtifactType;
    /** Pasted PM notes or a call transcript — the richest source for anything Aha/Jira cannot cover. */
    sourceNotes?: string;
    /** Text of the approved upstream document, read back from its Google Doc. */
    upstreamText?: string | null;
    /** Answers the owner already gave in Slack, so a settled question is not re-asked. */
    answeredFlagsBlock?: string;
    /** Why the owner sent the last draft back. */
    changeRequestNote?: string | null;
}

export interface GenerateArtifactResult {
    context: LaunchArtifactContext;
    output: Record<string, unknown>;
    /** Ungrounded claims, ready for syncArtifactFlags. */
    flags: RawFlag[];
}

export async function generateArtifact(
    input: GenerateArtifactInput
): Promise<GenerateArtifactResult> {
    const def = getArtifactDefinition(input.artifactType);

    // The whole chain, not just the best one: an exhausted Anthropic quota used
    // to take drafting down while a working Gemini key sat unused beside it.
    const candidates = resolveModelChain();

    const { generateObject } = await import('ai');
    const context = await assembleLaunchContext(input.launchId);

    const upstreamLabel = def.dependsOn ? getArtifactDefinition(def.dependsOn).label : null;
    const prompt = assemblePrompt({
        def_label: def.label,
        instructions: buildArtifactPrompt(input.artifactType, {
            launchName: context.launch.name,
            tier: context.launch.tier ?? 'not set',
            upstreamText: input.upstreamText ?? null,
            upstreamLabel: input.upstreamText ? upstreamLabel : null,
        }),
        facts: renderLaunchFacts(context),
        harvest: renderHarvestForPrompt(context.harvest),
        upstreamLabel,
        upstreamText: input.upstreamText ?? null,
        sourceNotes: input.sourceNotes,
        answeredFlagsBlock: input.answeredFlagsBlock,
        changeRequestNote: input.changeRequestNote ?? null,
    });

    const { object } = await runWithModelFallback(candidates, (model) =>
        generateObject({
            model,
            schema: def.schema,
            prompt,
        })
    );

    const referenceText = buildReferenceText(context, [
        input.sourceNotes,
        input.upstreamText,
        input.answeredFlagsBlock,
    ]);

    const grounded = postProcessGrounding(object as Record<string, unknown>, def.claimSections, {
        referenceText,
        ahaAvailable: context.rollup.aha_available,
        jiraAvailable: context.rollup.jira_available,
        gapDetected: context.rollup.gap_detected,
    });

    return {
        context,
        output: grounded,
        flags: collectOpenFlags(grounded, def.claimSections),
    };
}

interface AssemblePromptInput {
    def_label: string;
    instructions: string;
    facts: string;
    harvest: string | null;
    upstreamLabel: string | null;
    upstreamText: string | null;
    sourceNotes?: string;
    answeredFlagsBlock?: string;
    changeRequestNote: string | null;
}

/**
 * Assemble the full prompt. Exported for testing — this is the piece where a
 * missing section silently degrades draft quality, and it is worth asserting
 * that owner answers and change requests actually reach the model.
 */
export function assemblePrompt(input: AssemblePromptInput): string {
    const blocks: string[] = [
        `You are drafting the ${input.def_label} for a ClearCompany product launch.`,
        '',
        '## Grounding facts (the ONLY source-system facts you may cite)',
        input.facts,
        '',
        '## What ClearGO already knows (cite as "epic_comment" or "meeting_transcript")',
        input.harvest || '(nothing recorded in ClearGO for these epics)',
    ];

    if (input.upstreamText && input.upstreamLabel) {
        blocks.push(
            '',
            `## The ratified ${input.upstreamLabel} (cite as "upstream_artifact" — QUOTE it, never restate it)`,
            // Cap so one long upstream document cannot crowd out the facts.
            input.upstreamText.slice(0, 20_000)
        );
    }

    if (input.answeredFlagsBlock?.trim()) {
        blocks.push(
            '',
            '## Questions the owner has already answered (treat as fact — do NOT ask again)',
            input.answeredFlagsBlock.trim()
        );
    }

    blocks.push(
        '',
        '## Notes / call transcript from the owner',
        input.sourceNotes?.trim() ||
            '(none provided — use the facts and history above, and flag in open_flags anything you still cannot support)'
    );

    if (input.changeRequestNote?.trim()) {
        blocks.push(
            '',
            '## The owner rejected the previous draft. Address this specifically:',
            input.changeRequestNote.trim()
        );
    }

    blocks.push('', '## Instructions', input.instructions, '', GROUNDING_RULES);

    return blocks.join('\n');
}
