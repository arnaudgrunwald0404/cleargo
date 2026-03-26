"use client";

import React from "react";
import { Box, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { parseDateOnlyLocal, addCalendarDays, subtractCalendarDays } from "@/lib/date-utils";

interface ReleaseStage {
    id: number;
    name: string;
    sort_order: number;
    duration_days: number | null;
    details?: string | null;
    scope?: string;
    level_durations?: Record<string, { min_days: number; max_days: number }> | null;
    is_gate?: boolean;
    stage_type?: 'phase' | 'milestone';
}

const DEFAULT_STAGES: ReleaseStage[] = [
    { id: 0, name: 'Product Definition Complete', sort_order: 0, duration_days: 31, details: null, stage_type: 'milestone' },
    { id: 0, name: 'GTM Access and Prep', sort_order: 1, duration_days: 14, details: null, stage_type: 'phase' },
    { id: 0, name: 'Internal Readiness', sort_order: 2, duration_days: 21, details: null, stage_type: 'phase' },
    { id: 0, name: 'Cohort 1 Live', sort_order: 3, duration_days: 28, details: null, stage_type: 'milestone' },
    { id: 0, name: 'GA · Cohort 2', sort_order: 4, duration_days: null, details: null, stage_type: 'milestone' },
];

interface CriterionItem {
    status: string;
    notRequired?: boolean;
    criterion: {
        gate: boolean;
        rating_timing?: number | null;
        label: string;
    };
}

interface StageCriteriaSummary {
    total: number;
    go: number;
    conditional: number;
    noGo: number;
    notSet: number;
    gateTotal: number;
    gateBlocked: number;
}

/** Maps "other scope" stage id (e.g. release_schedule) to chart scope stage id (e.g. ui_rollout) so criteria with legacy ids are counted on the correct node. */
interface ReleaseStagesChartProps {
    releaseDate?: string | Date | null;
    cohort2Date?: string | Date | null;
    stages?: ReleaseStage[];
    goNoGoDate?: string | Date | null;
    showHeading?: boolean;
    noContainer?: boolean;
    targetReleaseDate?: string | Date | null;
    uiLevel?: number;
    criteriaItems?: CriterionItem[];
    stageIdBridge?: Map<number, number> | null;
}

function toDate(d: string | Date | null | undefined): Date | null {
    if (d == null) return null;
    if (typeof d === 'string') {
        const parsed = parseDateOnlyLocal(d);
        return parsed ?? (isNaN(new Date(d).getTime()) ? null : new Date(d));
    }
    return isNaN(d.getTime()) ? null : d;
}

function formatShortDate(d: Date): string {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function diffDays(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Same calendar day (ignoring time). */
function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Days from today to d; positive = in the future. */
function daysFromToday(today: Date, d: Date): number {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(0, 0, 0, 0);
    return diffDays(start, end);
}

function addBusinessDays(start: Date, days: number): Date {
    const d = new Date(start);
    let remaining = days;
    while (remaining > 0) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) remaining--;
    }
    return d;
}

function subtractBusinessDays(end: Date, days: number): Date {
    const d = new Date(end);
    let remaining = days;
    while (remaining > 0) {
        d.setDate(d.getDate() - 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) remaining--;
    }
    return d;
}

function getEffectiveDuration(stage: ReleaseStage, uiLevel: number | null | undefined): number | null {
    if (uiLevel != null && stage.level_durations && typeof stage.level_durations === 'object') {
        const d = stage.level_durations[String(uiLevel)];
        if (d && typeof d.min_days === 'number') {
            return d.min_days;
        }
    }
    return stage.duration_days;
}

function getBufferDays(stage: ReleaseStage, uiLevel: number | null | undefined): number {
    if (uiLevel != null && stage.level_durations && typeof stage.level_durations === 'object') {
        const d = stage.level_durations[String(uiLevel)];
        if (d && typeof d.min_days === 'number' && typeof d.max_days === 'number') {
            return Math.max(0, d.max_days - d.min_days);
        }
    }
    return 0;
}

function isPhaseStage(s: ReleaseStage): boolean {
    if (s.stage_type === 'phase') return true;
    if (s.stage_type === 'milestone') return false;
    const n = s.name.toLowerCase();
    return !(n.includes('product definition') || n.includes('cohort') || n.includes('ga'));
}

const PHASE_COLORS = [
    'var(--color-cast-iron)',
    'var(--color-copper)',
];

function milestoneSpanLabel(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('product definition')) return 'Product Definition Review';
    if (lower.includes('cohort 1') && !lower.includes('cohort 2')) return 'Cohort 1 Feedback';
    return `${name} (transition)`;
}

type NodeStatus = 'done' | 'active' | 'at_risk' | 'upcoming';

interface ComputedNode {
    stage: ReleaseStage;
    date: Date;
    durationDays: number;
    bufferDays: number;
    cumulativeDays: number;
    status: NodeStatus;
    isMilestone: boolean;
    criteriaSummary: StageCriteriaSummary | null;
}

function buildCriteriaSummaries(
    stages: ReleaseStage[],
    criteriaItems?: CriterionItem[],
    stageIdBridge?: Map<number, number> | null
): Map<number, StageCriteriaSummary> {
    const map = new Map<number, StageCriteriaSummary>();
    if (!criteriaItems || criteriaItems.length === 0) return map;
    const chartStageIds = new Set(stages.map(s => s.id));

    for (const item of criteriaItems) {
        if (item.notRequired) continue;
        const rawId = item.criterion.rating_timing;
        if (rawId == null) continue;

        const stageId = chartStageIds.has(rawId)
            ? rawId
            : (stageIdBridge?.get(rawId) ?? null);
        if (stageId == null || !chartStageIds.has(stageId)) continue;

        if (!map.has(stageId)) {
            map.set(stageId, { total: 0, go: 0, conditional: 0, noGo: 0, notSet: 0, gateTotal: 0, gateBlocked: 0 });
        }
        const s = map.get(stageId)!;
        s.total++;
        if (item.status === 'GO') s.go++;
        else if (item.status === 'CONDITIONAL') s.conditional++;
        else if (item.status === 'NO_GO') s.noGo++;
        else s.notSet++;

        if (item.criterion.gate) {
            s.gateTotal++;
            if (item.status === 'NO_GO' || item.status === 'NOT_SET') s.gateBlocked++;
        }
    }
    return map;
}

function useTimelineData(
    releaseDate: string | Date | null | undefined,
    stages: ReleaseStage[],
    uiLevel: number | undefined,
    criteriaItems?: CriterionItem[],
    cohort2Date?: string | Date | null,
    stageIdBridge?: Map<number, number> | null
) {
    const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);
    const anchorDate = toDate(releaseDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isTraditionalRelease = uiLevel === undefined;

    let rawNodes: { stage: ReleaseStage; date: Date; durationDays: number; bufferDays: number; cumulativeDays: number }[];

    if (isTraditionalRelease) {
        // Original logic: calendar days, preLaunchDays = only stages before Cohort 1 (e.g. 31+14+21 = 66).
        const cohort1Stage = sortedStages.find(s => s.name.toLowerCase().includes('cohort 1'));
        const preLaunchDays = cohort1Stage
            ? sortedStages
                .filter(s => s.sort_order < cohort1Stage.sort_order && (s.duration_days != null))
                .reduce((sum, s) => sum + (s.duration_days ?? 0), 0)
            : 0;
        const startDate = anchorDate && preLaunchDays > 0
            ? subtractCalendarDays(anchorDate, preLaunchDays)
            : anchorDate ?? new Date();

        let cursor = new Date(startDate);
        rawNodes = sortedStages.map(stage => {
            const dur = stage.duration_days ?? 0;
            const date = new Date(cursor);
            const node = { stage, date, durationDays: dur, bufferDays: 0, cumulativeDays: 0 };
            cursor = dur > 0 ? addCalendarDays(cursor, dur) : new Date(cursor);
            return node;
        });
    } else {
        // UI Rollout: business days, full pre-launch sum.
        const totalPreLaunchBusinessDays = sortedStages
            .filter(s => s.sort_order < (sortedStages[sortedStages.length - 1]?.sort_order ?? 0))
            .reduce((sum, s) => sum + (getEffectiveDuration(s, uiLevel) ?? 0), 0);

        const startDate = anchorDate
            ? subtractBusinessDays(anchorDate, totalPreLaunchBusinessDays)
            : new Date();

        let cursor = new Date(startDate);
        rawNodes = sortedStages.map(stage => {
            const dur = getEffectiveDuration(stage, uiLevel) ?? 0;
            const buf = getBufferDays(stage, uiLevel);
            const date = new Date(cursor);
            const node = { stage, date, durationDays: dur, bufferDays: buf, cumulativeDays: 0 };
            cursor = dur > 0 ? addBusinessDays(cursor, dur) : new Date(cursor);
            return node;
        });
    }

    const getStatus = (nodeDate: Date, nextNodeDate: Date | null, bufferDays: number): NodeStatus => {
        const targetEnd = nextNodeDate ?? nodeDate;
        const bufferEnd = bufferDays > 0 ? addBusinessDays(targetEnd, bufferDays) : targetEnd;
        if (today >= bufferEnd) return 'done';
        if (today >= targetEnd) return 'at_risk';
        if (today >= nodeDate) return 'active';
        return 'upcoming';
    };

    const summaries = buildCriteriaSummaries(stages, criteriaItems, stageIdBridge);

    let nodes: ComputedNode[] = rawNodes.map((node, i) => ({
        ...node,
        status: getStatus(node.date, i < rawNodes.length - 1 ? rawNodes[i + 1].date : null, node.bufferDays),
        isMilestone: !isPhaseStage(node.stage),
        criteriaSummary: summaries.get(node.stage.id) ?? null,
    }));

    // Cohort 2/GA: position last node at actual next release date when provided
    if (cohort2Date && nodes.length > 0) {
        const cohort2DateParsed = toDate(cohort2Date);
        if (cohort2DateParsed) {
            const last = nodes[nodes.length - 1];
            nodes = [
                ...nodes.slice(0, -1),
                { ...last, date: cohort2DateParsed, status: getStatus(cohort2DateParsed, null, last.bufferDays) },
            ];
        }
    }

    // Cohort 1 Live: position second-to-last node at the release date (anchor) so the go-live milestone shows the real date.
    // For UI Rollout (business days), the previous phase would otherwise stretch to Apr 16; use computed end in tooltip.
    // For traditional (calendar days), segment already ends near release, so no override.
    let computedEndOfPhaseBeforeCohort1: Date | null = null;
    if (anchorDate && nodes.length >= 2) {
        const cohort1Node = nodes[nodes.length - 2];
        if (!isTraditionalRelease) computedEndOfPhaseBeforeCohort1 = new Date(cohort1Node.date);
        const nextNodeDate = nodes[nodes.length - 1].date;
        nodes = [
            ...nodes.slice(0, -2),
            { ...cohort1Node, date: new Date(anchorDate), status: getStatus(anchorDate, nextNodeDate, cohort1Node.bufferDays) },
            nodes[nodes.length - 1],
        ];
    }

    const timelineStart = nodes[0]?.date ?? today;
    const timelineEnd = nodes[nodes.length - 1]?.date ?? today;
    const totalSpan = Math.max(1, diffDays(timelineStart, timelineEnd));
    const todayPctDate = Math.max(0, Math.min(100, (diffDays(timelineStart, today) / totalSpan) * 100));
    const todayIsVisible = today >= timelineStart && today <= timelineEnd;
    const todayIsBefore = today < timelineStart;
    const allDone = today > timelineEnd;

    // Position "today" by equal-width segments (slider is drawn with each segment same width, not by date span)
    let todayPct = todayPctDate;
    if (nodes.length >= 2 && todayIsVisible) {
        const n = nodes.length;
        for (let i = 0; i < n - 1; i++) {
            const segStart = nodes[i].date.getTime();
            const segEnd = nodes[i + 1].date.getTime();
            const t = today.getTime();
            if (t >= segStart && t < segEnd) {
                const segSpan = segEnd - segStart;
                const f = segSpan > 0 ? (t - segStart) / segSpan : 0;
                todayPct = ((i + f) / (n - 1)) * 100;
                break;
            }
            if (i === n - 2 && t >= segEnd) {
                todayPct = 100;
                break;
            }
        }
    } else if (allDone && nodes.length >= 2) {
        todayPct = 100;
    }

    return { nodes, today, todayPct, todayIsVisible, todayIsBefore, allDone, timelineStart, timelineEnd, totalSpan, computedEndOfPhaseBeforeCohort1 };
}

function CriteriaBadge({
    summary,
    /** Horizontal timeline: side placement avoids tooltips flipping up over the date / “in X days” row. */
    tooltipPosition = 'bottom',
}: {
    summary: StageCriteriaSummary;
    tooltipPosition?: 'left' | 'right' | 'bottom';
}) {
    const allGo = summary.go === summary.total;
    const hasGateBlocker = summary.gateBlocked > 0;

    const bg = hasGateBlocker ? 'rgba(220,38,38,0.08)' : allGo ? 'rgba(16,185,129,0.08)' : 'rgba(0,0,0,0.04)';
    const color = hasGateBlocker ? '#dc2626' : allGo ? '#10b981' : 'var(--color-gray-600)';
    const border = hasGateBlocker ? '1px solid rgba(220,38,38,0.2)' : allGo ? '1px solid rgba(16,185,129,0.2)' : '1px solid var(--color-gray-200)';

    const tooltipLines: string[] = [];
    if (summary.go > 0) tooltipLines.push(`${summary.go} GO`);
    if (summary.conditional > 0) tooltipLines.push(`${summary.conditional} Conditional`);
    if (summary.noGo > 0) tooltipLines.push(`${summary.noGo} No-Go`);
    if (summary.notSet > 0) tooltipLines.push(`${summary.notSet} Not Set`);
    if (summary.gateBlocked > 0) tooltipLines.push(`⚠ ${summary.gateBlocked} gate blocker${summary.gateBlocked > 1 ? 's' : ''}`);

    const offset =
        tooltipPosition === 'bottom'
            ? 10
            : { mainAxis: 10, crossAxis: 0 };

    return (
        <Tooltip
            label={tooltipLines.join(' · ')}
            withArrow
            position={tooltipPosition}
            offset={offset}
            multiline
            maw={280}
        >
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9, fontWeight: 600, lineHeight: 1,
                padding: '2px 5px', borderRadius: 8,
                backgroundColor: bg, color, border,
                whiteSpace: 'nowrap', cursor: 'default',
            }}>
                {summary.go}/{summary.total}
                {hasGateBlocker && (
                    <span style={{ fontSize: 8 }} title="Gate blocker">⚠</span>
                )}
            </span>
        </Tooltip>
    );
}

/** Gate = Go/No-Go checkpoint: date and stage name from a node where stage.is_gate is true. */
export type GateMarker = { date: Date; stageName: string };

/* ─── Desktop: horizontal timeline ─── */
function HorizontalTimeline({ nodes, today, todayPct, todayIsVisible, todayIsBefore, allDone, showHeading, gateMarkers, timelineStart, totalSpan, computedEndOfPhaseBeforeCohort1, uiLevel }: {
    nodes: ComputedNode[]; today: Date; todayPct: number; todayIsVisible: boolean; todayIsBefore: boolean; allDone: boolean;
    showHeading: boolean; gateMarkers: GateMarker[]; timelineStart: Date; totalSpan: number;
    computedEndOfPhaseBeforeCohort1?: Date | null;
    /** When set (UI framework rollout), hide per-phase "3–7d" buffer labels; range still drives layout math elsewhere. */
    uiLevel?: number | null;
}) {
    const n = nodes.length;
    const INSET = 4;
    const pct = (i: number) => n <= 1 ? 50 : INSET + (i / (n - 1)) * (100 - 2 * INSET);
    const dateToPct = (d: Date) => INSET + (Math.max(0, Math.min(1, diffDays(timelineStart, d) / totalSpan))) * (100 - 2 * INSET);

    const hasCriteria = nodes.some(nd => nd.criteriaSummary != null);
    /** Buffer duration labels ("3–7d") only for non–UI-framework timelines; UI rollouts use level ranges but we hide the extra row for clarity. */
    const hasBufferRow = nodes.some(nd => nd.bufferDays > 0) && uiLevel == null;
    const LABEL_AREA = 34;
    const GAP = 8;
    const TRACK_CENTER = LABEL_AREA + GAP + 5;
    const DATE_ROW_TOP = TRACK_CENTER + 12;
    const BUFFER_ROW_TOP = DATE_ROW_TOP + 14;
    const BADGE_ROW_TOP = hasBufferRow ? BUFFER_ROW_TOP + 14 : DATE_ROW_TOP + 14;
    const TRACK_H = 2;
    const PHASE_H = 6;
    const DOT_R = 4;
    const DOT_R_ACTIVE = 5;
    /** Extra bottom space so date + "in x days" / "x days ago" lines are not clipped by overflow:hidden (traditional releases). */
    const baseTrackBottomPad = 48;
    const totalHeight = hasCriteria ? BADGE_ROW_TOP + 20 : (hasBufferRow ? BUFFER_ROW_TOP + 28 : TRACK_CENTER + baseTrackBottomPad);

    let phaseColorIdx = 0;

    const nextNode = allDone ? null : nodes.find(nd => daysFromToday(today, nd.date) > 0);
    const nextDays = nextNode ? daysFromToday(today, nextNode.date) : null;

    return (
        <div style={{ fontFamily: 'var(--font-body)' }}>
            {showHeading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
                    <Tooltip label="Phase dates are back-calculated from release date using stage durations (business days), not from actual epic status." withArrow position="top">
                        <div style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-gray-900)', cursor: 'help' }} role="heading" aria-level={2}>
                            Release Timeline
                        </div>
                    </Tooltip>
                    <span style={{ fontSize: 11, color: 'var(--color-gray-500)', fontWeight: 500 }}>
                        Today: {formatShortDate(today)}
                    </span>
                </div>
            )}

            {nextNode && nextDays != null && (
                <div style={{
                    marginBottom: 12, padding: '12px 16px', borderRadius: 8,
                    background: 'linear-gradient(135deg, var(--color-gray-100) 0%, var(--color-gray-50) 100%)',
                    border: '1px solid var(--color-gray-200)',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-cast-iron)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                        {nextDays}
                    </span>
                    <span style={{ fontSize: 15, color: 'var(--color-gray-600)', fontWeight: 500, lineHeight: 1.3 }}>
                        day{nextDays !== 1 ? 's' : ''} until <strong style={{ color: 'var(--color-gray-900)', fontWeight: 600 }}>{nextNode.stage.name}</strong>
                    </span>
                </div>
            )}

            <div style={{ position: 'relative', height: totalHeight, overflow: 'hidden' }}>
                {/* Baseline track */}
                <div style={{
                    position: 'absolute', top: TRACK_CENTER - TRACK_H / 2,
                    left: `${INSET}%`, right: `${INSET}%`,
                    height: TRACK_H, backgroundColor: 'var(--color-gray-200)', borderRadius: TRACK_H,
                }} />

                {/* Phase bars: solid bar for phases, dashed for milestones. Phase label is above the bar (legible). */}
                {nodes.map((node, i) => {
                    if (i >= n - 1 || node.durationDays <= 0) return null;
                    const leftPct = pct(i);
                    const widthPct = pct(i + 1) - leftPct;
                    const color = PHASE_COLORS[phaseColorIdx++ % PHASE_COLORS.length];
                    const opacity = node.status === 'upcoming' ? 0.25 : (node.status === 'active' || node.status === 'at_risk') ? 0.7 : 0.5;
                    const isDashed = node.isMilestone;
                    const barLabel = isDashed ? milestoneSpanLabel(node.stage.name) : node.stage.name;
                    const hasBuffer = node.bufferDays > 0;
                    // When Cohort 1 is pinned to release, the previous phase (e.g. Internal Readiness) segment end is the computed end, not Apr 16
                    const segmentEndDate = (i + 1 === n - 2 && computedEndOfPhaseBeforeCohort1) ? computedEndOfPhaseBeforeCohort1 : nodes[i + 1].date;
                    const tooltipText = hasBuffer
                        ? `${barLabel}: ${formatShortDate(node.date)} – ${formatShortDate(segmentEndDate)} (${node.durationDays}–${node.durationDays + node.bufferDays}d)`
                        : `${barLabel}: ${formatShortDate(node.date)} – ${formatShortDate(segmentEndDate)} (${node.durationDays}d)`;
                    const isPhase = !node.isMilestone;

                    return (
                        <React.Fragment key={`phase-${i}`}>
                            {/* Phase name above the segment (legible, not on the bar) */}
                            {isPhase && (
                                <div style={{
                                    position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`,
                                    top: 0, height: LABEL_AREA,
                                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                                    zIndex: 5, paddingBottom: 2,
                                }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: node.status === 'active' ? 600 : 500,
                                        color: node.status === 'done' ? 'var(--color-gray-700)' : (node.status === 'active' || node.status === 'at_risk') ? 'var(--color-gray-900)' : 'var(--color-gray-600)',
                                        lineHeight: 1.2, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                                    }} title={node.stage.name}>
                                        {node.stage.name}
                                    </span>
                                </div>
                            )}
                            <Tooltip label={tooltipText} withArrow position="top">
                                <div style={{
                                    position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`,
                                    top: TRACK_CENTER - PHASE_H / 2, height: PHASE_H,
                                    backgroundColor: isDashed ? 'transparent' : color,
                                    backgroundImage: isDashed ? `repeating-linear-gradient(90deg, ${color} 0px, ${color} 6px, transparent 6px, transparent 10px)` : undefined,
                                    opacity, borderRadius: PHASE_H, zIndex: 2, cursor: 'default',
                                }} />
                            </Tooltip>
                        </React.Fragment>
                    );
                })}

                {/* Completed progress overlay */}
                {(todayIsVisible || allDone) && (() => {
                    const todayInsetPct = INSET + (todayPct / 100) * (100 - 2 * INSET);
                    return (
                        <div style={{
                            position: 'absolute', top: TRACK_CENTER - TRACK_H / 2, left: `${INSET}%`,
                            width: allDone ? `${100 - 2 * INSET}%` : `${todayInsetPct - INSET}%`,
                            height: TRACK_H, backgroundColor: 'var(--color-cast-iron)', borderRadius: TRACK_H, zIndex: 1,
                        }} />
                    );
                })()}

                {/* Go/No-Go markers: place at node boundary (same position as the node whose date = gate date) so they align with stage ends */}
                {gateMarkers.map((gate, idx) => {
                    const nodeIndex = nodes.findIndex(nd => isSameDay(nd.date, gate.date));
                    const gatePct = nodeIndex >= 0 ? pct(nodeIndex) : dateToPct(gate.date);
                    const visible = gatePct >= INSET && gatePct <= (100 - INSET);
                    return visible ? (
                        <Tooltip key={idx} label={`Go/No-Go at end of ${gate.stageName}: ${formatShortDate(gate.date)}`} withArrow position="top">
                            <div style={{
                                position: 'absolute', left: `${gatePct}%`,
                                top: TRACK_CENTER - 12, transform: 'translateX(-50%)',
                                zIndex: 11, cursor: 'default',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                            }}>
                                <span style={{
                                    fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                                    color: '#dc2626', lineHeight: 1, marginBottom: 1, whiteSpace: 'nowrap',
                                }}>Go/No-Go</span>
                                <div style={{
                                    width: 0, height: 0,
                                    borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
                                    borderTop: '5px solid #dc2626',
                                }} />
                            </div>
                        </Tooltip>
                    ) : null;
                })}

                {/* TODAY marker */}
                {todayIsVisible && (
                    <div style={{
                        position: 'absolute', left: `${INSET + (todayPct / 100) * (100 - 2 * INSET)}%`,
                        top: 0, transform: 'translateX(-50%)', zIndex: 12,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none',
                    }}>
                        <span style={{
                            fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            color: 'var(--color-copper)', lineHeight: 1, marginBottom: 2,
                        }}>today</span>
                        <div style={{ width: 1.5, height: TRACK_CENTER + 10, backgroundColor: 'var(--color-copper)', borderRadius: 1 }} />
                    </div>
                )}
                {/* TODAY marker pinned at left when before timeline */}
                {todayIsBefore && (
                    <div style={{
                        position: 'absolute', left: 0, top: TRACK_CENTER - 8,
                        zIndex: 12, pointerEvents: 'none',
                        display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                        }}>
                            <span style={{
                                fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                                color: 'var(--color-copper)', lineHeight: 1, whiteSpace: 'nowrap',
                            }}>today</span>
                            <span style={{
                                fontSize: 7, color: 'var(--color-copper)', fontWeight: 600, lineHeight: 1, marginTop: 1,
                            }}>{formatShortDate(today)}</span>
                        </div>
                        <div style={{
                            width: 0, height: 0,
                            borderTop: '4px solid transparent', borderBottom: '4px solid transparent',
                            borderLeft: '5px solid var(--color-copper)',
                        }} />
                    </div>
                )}

                {/* Nodes: milestone labels (with angled line to dot); dots/ticks; dates; criteria badges. No stage-level Go/No-Go badges. */}
                {nodes.map((node, i) => {
                    const leftPct = pct(i);
                    const isLast = i === n - 1;
                    const isAtRisk = node.status === 'at_risk';
                    const r = (node.status === 'active' || isAtRisk) ? DOT_R_ACTIVE : DOT_R;
                    const dotColor = node.status === 'done' ? 'var(--color-cast-iron)' : isAtRisk ? '#d97706' : node.status === 'active' ? 'var(--color-copper)' : 'var(--color-gray-500)';
                    const labelColor = node.status === 'done' ? 'var(--color-gray-700)' : (node.status === 'active' || isAtRisk) ? 'var(--color-gray-900)' : 'var(--color-gray-600)';
                    const dateColor = node.status === 'done' ? 'var(--color-gray-500)' : isAtRisk ? '#d97706' : node.status === 'active' ? 'var(--color-gray-600)' : 'var(--color-gray-600)';
                    const align: React.CSSProperties['textAlign'] = i === 0 ? 'left' : isLast ? 'right' : 'center';
                    const translateX = i === 0 ? '0%' : isLast ? '-100%' : '-50%';

                    return (
                        <React.Fragment key={`node-${i}`}>
                            {/* Milestones: label above with angled line to dot. Phases: label is above the bar (in phase bars section). */}
                            <div style={{
                                position: 'absolute', left: `${leftPct}%`, top: 0, height: LABEL_AREA,
                                display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
                                justifyContent: 'flex-end', transform: `translateX(${translateX})`,
                                maxWidth: `${100 / n + 4}%`, zIndex: 5, gap: 2,
                            }}>
                                {node.isMilestone && (
                                    <span style={{
                                        fontSize: 11, fontWeight: node.status === 'active' ? 600 : 500, color: labelColor,
                                        lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden', whiteSpace: 'normal', wordBreak: 'break-word', textAlign: align,
                                    }} title={node.stage.name}>
                                        {node.stage.name}
                                    </span>
                                )}
                            </div>

                            {/* Angled line from label down to dot (milestones only) */}
                            {node.isMilestone && (() => {
                                const lineH = TRACK_CENTER - LABEL_AREA + r + 2;
                                const w = 20;
                                const xTop = i === 0 ? w / 2 + 6 : i === n - 1 ? w / 2 - 6 : w / 2 + 6;
                                const xBottom = w / 2;
                                return (
                                    <svg
                                        style={{
                                            position: 'absolute',
                                            left: `${leftPct}%`,
                                            top: LABEL_AREA - 1,
                                            width: w,
                                            height: lineH,
                                            transform: 'translateX(-50%)',
                                            overflow: 'visible',
                                            zIndex: 3,
                                            pointerEvents: 'none',
                                        }}
                                        width={w}
                                        height={lineH}
                                    >
                                        <line x1={xTop} y1={0} x2={xBottom} y2={lineH} stroke="var(--color-gray-600)" strokeWidth="1" />
                                    </svg>
                                );
                            })()}
                            {/* Dot (milestone) or tick (phase) */}
                            {node.isMilestone ? (
                                <div style={{
                                    position: 'absolute', left: `${leftPct}%`, top: TRACK_CENTER - r,
                                    transform: 'translateX(-50%)', width: r * 2, height: r * 2, borderRadius: '50%',
                                    backgroundColor: dotColor, zIndex: 4,
                                    boxShadow: isAtRisk ? '0 0 0 3px rgba(217,119,6,0.2)' : node.status === 'active' ? '0 0 0 3px rgba(184,115,51,0.18)' : 'none',
                                }} />
                            ) : (
                                <div style={{
                                    position: 'absolute', left: `${leftPct}%`, top: TRACK_CENTER - 4,
                                    transform: 'translateX(-50%)', width: 1.5, height: 8,
                                    backgroundColor: node.status === 'upcoming' ? 'var(--color-gray-500)' : 'var(--color-gray-500)',
                                    borderRadius: 1, zIndex: 4,
                                }} />
                            )}

                            {/* Date below track + countdown when future */}
                            <div style={{
                                position: 'absolute', left: `${leftPct}%`, top: DATE_ROW_TOP,
                                transform: `translateX(${translateX})`, textAlign: align, zIndex: 5,
                                display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center', gap: 3,
                            }}>
                                <span style={{ fontSize: 10, color: dateColor, fontWeight: 500, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                                    {formatShortDate(node.date)}
                                </span>
                                {(() => {
                                    const days = daysFromToday(today, node.date);
                                    if (days > 0) {
                                        return (
                                            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-copper)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                                                in {days} day{days !== 1 ? 's' : ''}
                                            </span>
                                        );
                                    }
                                    if (days < 0) {
                                        return (
                                            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-gray-500)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                                                {-days} day{-days !== 1 ? 's' : ''} ago
                                            </span>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>

                            {/* Duration range below date (UI framework rollouts omit this row — level-based buffers stay in tooltips / data only) */}
                            {hasBufferRow && node.bufferDays > 0 && !isLast && (
                                <Tooltip label={`This phase: ${node.durationDays}–${node.durationDays + node.bufferDays} business days. Timeline uses the ${node.durationDays}d target.`} withArrow position="bottom">
                                    <div style={{
                                        position: 'absolute', left: `${leftPct}%`, top: BUFFER_ROW_TOP,
                                        transform: `translateX(${translateX})`, textAlign: align, zIndex: 5,
                                    }}>
                                        <span style={{
                                            fontSize: 8, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', cursor: 'default',
                                            color: node.status === 'at_risk' ? '#d97706' : 'var(--color-gray-600)',
                                        }}>
                                            {node.durationDays}–{node.durationDays + node.bufferDays}d{node.status === 'at_risk' ? ' ⚠' : ''}
                                        </span>
                                    </div>
                                </Tooltip>
                            )}

                            {/* Criteria summary badge */}
                            {node.criteriaSummary && (
                                <div style={{
                                    position: 'absolute', left: `${leftPct}%`, top: BADGE_ROW_TOP,
                                    transform: `translateX(${translateX})`, zIndex: 5,
                                    display: 'flex', justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
                                }}>
                                    <CriteriaBadge
                                        summary={node.criteriaSummary}
                                        tooltipPosition={n <= 1 ? 'bottom' : i < (n - 1) / 2 ? 'right' : 'left'}
                                    />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Mobile: vertical stacked timeline ─── */
function VerticalTimeline({ nodes, today, todayIsVisible, todayIsBefore, showHeading, gateMarkers }: {
    nodes: ComputedNode[]; today: Date; todayIsVisible: boolean; todayIsBefore: boolean; showHeading: boolean; gateMarkers: GateMarker[];
}) {
    const n = nodes.length;
    let phaseColorIdx = 0;

    const activeIdx = nodes.findIndex(nd => nd.status === 'active' || nd.status === 'at_risk');
    const todayBetween = todayIsVisible && activeIdx >= 0;
    const allDone = nodes.length > 0 && daysFromToday(today, nodes[nodes.length - 1].date) <= 0;
    const nextNode = allDone ? null : nodes.find(nd => daysFromToday(today, nd.date) > 0);
    const nextDays = nextNode ? daysFromToday(today, nextNode.date) : null;

    return (
        <div style={{ fontFamily: 'var(--font-body)' }}>
            {showHeading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-gray-900)' }} role="heading" aria-level={2}>
                        Release Timeline
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span style={{ fontSize: 11, color: 'var(--color-gray-500)', fontWeight: 500 }}>
                            Today: {formatShortDate(today)}
                        </span>
                        {gateMarkers.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                {gateMarkers.map((gate, idx) => (
                                    <span key={idx} style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>
                                        Go/No-Go (end of {gate.stageName}): {formatShortDate(gate.date)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {nextNode && nextDays != null && (
                <div style={{
                    marginBottom: 12, padding: '12px 16px', borderRadius: 8,
                    background: 'linear-gradient(135deg, var(--color-gray-100) 0%, var(--color-gray-50) 100%)',
                    border: '1px solid var(--color-gray-200)',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-cast-iron)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                        {nextDays}
                    </span>
                    <span style={{ fontSize: 15, color: 'var(--color-gray-600)', fontWeight: 500, lineHeight: 1.3 }}>
                        day{nextDays !== 1 ? 's' : ''} until <strong style={{ color: 'var(--color-gray-900)', fontWeight: 600 }}>{nextNode.stage.name}</strong>
                    </span>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingLeft: 4 }}>
                {todayIsBefore && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 0 6px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', width: 16, flexShrink: 0 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-copper)' }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-copper)' }}>
                            Today — {formatShortDate(today)}
                        </span>
                    </div>
                )}
                {nodes.map((node, i) => {
                    const isLast = i === n - 1;
                    const hasBar = !isLast && node.durationDays > 0;
                    const isAtRisk = node.status === 'at_risk';
                    const dotColor = node.status === 'done' ? 'var(--color-cast-iron)' : isAtRisk ? '#d97706' : node.status === 'active' ? 'var(--color-copper)' : 'var(--color-gray-500)';
                    const labelColor = node.status === 'done' ? 'var(--color-gray-700)' : (node.status === 'active' || isAtRisk) ? 'var(--color-gray-900)' : 'var(--color-gray-600)';
                    const dateColor = node.status === 'done' ? 'var(--color-gray-500)' : isAtRisk ? '#d97706' : node.status === 'active' ? 'var(--color-gray-600)' : 'var(--color-gray-600)';
                    const isDashedBar = hasBar && node.isMilestone;
                    const barLabel = isDashedBar ? milestoneSpanLabel(node.stage.name) : node.stage.name;

                    const phaseColor = hasBar ? PHASE_COLORS[phaseColorIdx++ % PHASE_COLORS.length] : undefined;
                    const showTodayAfter = todayBetween && (i === activeIdx);

                    return (
                        <React.Fragment key={`vnode-${i}`}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
                                    {node.isMilestone ? (
                                        <div style={{
                                            width: (node.status === 'active' || isAtRisk) ? 10 : 8,
                                            height: (node.status === 'active' || isAtRisk) ? 10 : 8,
                                            borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, marginTop: 4,
                                            boxShadow: isAtRisk ? '0 0 0 3px rgba(217,119,6,0.2)' : node.status === 'active' ? '0 0 0 3px rgba(184,115,51,0.18)' : 'none',
                                        }} />
                                    ) : (
                                        <div style={{
                                            width: 3, height: 10, borderRadius: 2, marginTop: 4, flexShrink: 0,
                                            backgroundColor: node.status === 'upcoming' ? 'var(--color-gray-500)' : 'var(--color-gray-500)',
                                        }} />
                                    )}
                                </div>

                                <div style={{ flex: 1, paddingBottom: isLast ? 0 : 4, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 13, fontWeight: node.status === 'active' ? 600 : 500, color: labelColor, lineHeight: 1.4 }}>
                                            {node.stage.name}
                                        </span>
                                        <span style={{ fontSize: 11, color: dateColor, fontWeight: 500, whiteSpace: 'nowrap' }}>
                                            {formatShortDate(node.date)}
                                        </span>
                                        {(() => {
                                            const days = daysFromToday(today, node.date);
                                            if (days > 0) {
                                                return (
                                                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-copper)', whiteSpace: 'nowrap' }}>
                                                        in {days} day{days !== 1 ? 's' : ''}
                                                    </span>
                                                );
                                            }
                                            if (days < 0) {
                                                return (
                                                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-gray-500)', whiteSpace: 'nowrap' }}>
                                                        {-days} day{-days !== 1 ? 's' : ''} ago
                                                    </span>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                        {hasBar && (() => {
                                            const hasBuffer = node.bufferDays > 0;
                                            const targetFlex = node.durationDays;
                                            const bufferFlex = hasBuffer ? node.bufferDays : 0;
                                            const barOpacity = node.status === 'upcoming' ? 0.25 : node.status === 'active' ? 0.7 : 0.5;
                                            const tooltipText = hasBuffer
                                                ? `${barLabel}: ${node.durationDays}–${node.durationDays + node.bufferDays} business days (timeline uses ${node.durationDays}d target)`
                                                : `${barLabel}: ${node.durationDays}d`;
                                            return (
                                                <Tooltip label={tooltipText} withArrow position="top">
                                                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 0 }}>
                                                        <div style={{
                                                            flex: targetFlex, height: 4, borderRadius: hasBuffer ? '4px 0 0 4px' : 4,
                                                            backgroundColor: isDashedBar ? 'transparent' : phaseColor,
                                                            backgroundImage: isDashedBar ? `repeating-linear-gradient(90deg, ${phaseColor} 0px, ${phaseColor} 4px, transparent 4px, transparent 7px)` : undefined,
                                                            opacity: barOpacity,
                                                        }} />
                                                        {hasBuffer && (
                                                            <div style={{
                                                                flex: bufferFlex, height: 3,
                                                                backgroundColor: phaseColor,
                                                                opacity: barOpacity * 0.3,
                                                                borderRadius: '0 4px 4px 0',
                                                            }} />
                                                        )}
                                                    </div>
                                                </Tooltip>
                                            );
                                        })()}
                                        {node.criteriaSummary && <CriteriaBadge summary={node.criteriaSummary} />}
                                    </div>
                                </div>
                            </div>

                            {!isLast && (
                                <div style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'center', width: 16, flexShrink: 0 }}>
                                        <div style={{
                                            width: 1.5, height: 16,
                                            backgroundColor: node.status === 'done' || node.status === 'active' || isAtRisk ? 'var(--color-gray-400)' : 'var(--color-gray-200)',
                                        }} />
                                    </div>
                                    <div style={{ flex: 1 }} />
                                </div>
                            )}

                            {showTodayAfter && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '2px 0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center', width: 16, flexShrink: 0 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-copper)' }} />
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-copper)' }}>
                                        Today — {formatShortDate(today)}
                                    </span>
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}

export function ReleaseStagesChart({
    releaseDate: releaseDateProp,
    cohort2Date,
    stages: stagesProp,
    goNoGoDate: goNoGoDateProp,
    showHeading = true,
    noContainer = false,
    targetReleaseDate,
    uiLevel,
    criteriaItems,
    stageIdBridge,
}: ReleaseStagesChartProps) {
    const isMobile = useMediaQuery("(max-width: 768px)");
    const releaseDate = releaseDateProp ?? targetReleaseDate;
    const stages = stagesProp ?? DEFAULT_STAGES;
    const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

    if (sortedStages.length === 0) {
        return (
            <Box
                className="rounded-lg p-8 text-center"
                style={{ backgroundColor: 'var(--color-gray-100)', color: 'var(--color-gray-500)', fontFamily: 'var(--font-body)' }}
            >
                No release stages to display
            </Box>
        );
    }

    const { nodes, today, todayPct, todayIsVisible, todayIsBefore, allDone, timelineStart, totalSpan, computedEndOfPhaseBeforeCohort1 } = useTimelineData(releaseDate, sortedStages, uiLevel, criteriaItems, cohort2Date, stageIdBridge);

    const gateMarkers: GateMarker[] = (() => {
        const stageNames = new Set(sortedStages.map(s => s.name.toLowerCase().trim()));
        const isUiRolloutStyle = stageNames.has('ux preview') && stageNames.has('gtm access and prep');

        if (isUiRolloutStyle) {
            const wantNames = new Set(['ux preview', 'gtm access and prep']);
            const markers: GateMarker[] = [];
            nodes.forEach((nd, i) => {
                const name = nd.stage.name.toLowerCase().trim();
                if (!wantNames.has(name)) return;
                const date = i < nodes.length - 1 ? nodes[i + 1].date : nd.date;
                markers.push({ date, stageName: nd.stage.name });
            });
            if (markers.length > 0) return markers;
        }

        const fromGates = nodes
            .map((nd, i) => nd.stage.is_gate
                ? { date: i < nodes.length - 1 ? nodes[i + 1].date : nd.date, stageName: nd.stage.name }
                : null)
            .filter((m): m is GateMarker => m != null);
        if (fromGates.length > 0) return fromGates;
        const legacyDate = toDate(goNoGoDateProp);
        return legacyDate ? [{ date: legacyDate, stageName: 'Go/No-Go' }] : [];
    })();

    const timeline = isMobile
        ? <VerticalTimeline nodes={nodes} today={today} todayIsVisible={todayIsVisible} todayIsBefore={todayIsBefore} showHeading={showHeading} gateMarkers={gateMarkers} />
        : <HorizontalTimeline nodes={nodes} today={today} todayPct={todayPct} todayIsVisible={todayIsVisible} todayIsBefore={todayIsBefore} allDone={allDone} showHeading={showHeading} gateMarkers={gateMarkers} timelineStart={timelineStart} totalSpan={totalSpan} computedEndOfPhaseBeforeCohort1={computedEndOfPhaseBeforeCohort1} uiLevel={uiLevel} />;

    if (noContainer) {
        return <Box className="min-w-0">{timeline}</Box>;
    }
    return (
        <Box
            className="rounded-xl p-5"
            style={{
                backgroundColor: 'var(--color-white)',
                border: '1px solid var(--color-gray-200)',
            }}
        >
            {timeline}
        </Box>
    );
}
