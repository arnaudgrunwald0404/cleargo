"use client";

import { Box } from "@mantine/core";
import { useState } from "react";

interface ReleaseStage {
    id: number;
    name: string;
    sort_order: number;
    duration_days: number | null;
    details?: string | null;
}

/** Default stage config when used with only releaseDate (31, 14, 21, 28 days + GA) */
const DEFAULT_STAGES: ReleaseStage[] = [
    { id: 0, name: 'Product Definition Complete', sort_order: 1, duration_days: 31, details: null },
    { id: 0, name: 'GTM Access', sort_order: 2, duration_days: 14, details: null },
    { id: 0, name: 'Internal Readiness', sort_order: 3, duration_days: 21, details: null },
    { id: 0, name: 'Cohort 1 Live', sort_order: 4, duration_days: 28, details: null },
    { id: 0, name: 'GA · Cohort 2', sort_order: 5, duration_days: null, details: null },
];

interface ReleaseStagesChartProps {
    /** Release date (RELEASE · Cohort 1) — the single parameter for reuse; anchors the timeline. */
    releaseDate?: string | Date | null;
    /** Optional: custom stages from settings. When omitted, default stages (31, 14, 21, 28 days) are used. */
    stages?: ReleaseStage[];
    /** Optional: Go/No-Go date. When omitted, derived as ~1 week into GTM Access (releaseDate - 28 days). */
    goNoGoDate?: string | Date | null;
    /** When true, hide the "Release Stages Timeline" heading (e.g. for embedding under Target Release Date). */
    showHeading?: boolean;
    /** When true, render only the timeline SVG without outer box, border, or padding. */
    noContainer?: boolean;
    /** @deprecated Use releaseDate instead. When provided, anchors the timeline so Release falls on this date. */
    targetReleaseDate?: string | Date | null;
}

interface TimelineMilestone {
    stage: ReleaseStage;
    position: number; // Position on timeline (0-100%)
    dateOffset: number; // Days from launch date
    isReleaseDate?: boolean; // Is this the release launch date (Cohort 1 Live start)
}

function formatChartDate(d: string | Date | null | undefined): string {
    if (d == null) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    return isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function formatChartDateNoYear(d: string | Date | null | undefined): string {
    if (d == null) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    return isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

/** Shift all timeline displayed dates by this many days (e.g. +1 for off-by-one). */
const TIMELINE_DAY_OFFSET = 1;

function shiftDate(d: Date | string | null | undefined, days: number): Date | null {
    if (d == null) return null;
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return null;
    const out = new Date(date);
    out.setDate(out.getDate() + days);
    return out;
}

const DAYS_TO_GO_NO_GO_FROM_RELEASE = 28; // ~1 week into GTM Access (7 days into 14-day stage)

/**
 * Reusable release stages timeline. Use with a single parameter for standalone display:
 *   <ReleaseStagesChart releaseDate="2026-03-19" />
 * Optional: pass `stages` for custom durations/names, `goNoGoDate` to override derived date.
 */
export function ReleaseStagesChart({
    releaseDate: releaseDateProp,
    stages: stagesProp,
    goNoGoDate: goNoGoDateProp,
    showHeading = true,
    noContainer = false,
    targetReleaseDate,
}: ReleaseStagesChartProps) {
    const releaseDate = releaseDateProp ?? targetReleaseDate;
    const stages = stagesProp ?? DEFAULT_STAGES;
    const sortedForAnchor = [...stages].sort((a, b) => a.sort_order - b.sort_order);
    const cohort1ForAnchor = sortedForAnchor.find(s => s.name.toLowerCase().includes('cohort 1'));
    const preLaunchDays = cohort1ForAnchor
        ? sortedForAnchor
            .filter(s => s.sort_order < cohort1ForAnchor.sort_order && s.duration_days != null)
            .reduce((sum, s) => sum + (s.duration_days ?? 0), 0)
        : 0;
    const anchorDate = releaseDate
        ? (typeof releaseDate === 'string' ? new Date(releaseDate) : releaseDate)
        : null;
    const launchDate = anchorDate && preLaunchDays > 0
        ? (() => {
            const d = new Date(anchorDate);
            d.setDate(d.getDate() - preLaunchDays);
            return d;
        })()
        : new Date();
    const releaseLaunchDate = anchorDate ?? null;
    const derivedGoNoGoDate = anchorDate
        ? (() => {
            const d = new Date(anchorDate);
            d.setDate(d.getDate() - DAYS_TO_GO_NO_GO_FROM_RELEASE);
            return d;
        })()
        : null;
    const goNoGoDate = goNoGoDateProp ?? (anchorDate ? derivedGoNoGoDate : null);
    
    // Helper function to estimate text width
    const estimateTextWidth = (text: string, fontSize: number): number => {
        // Rough estimate: average character width is about 0.6 * fontSize for most fonts
        return text.length * fontSize * 0.6;
    };
    
    // Helper function to wrap text if needed
    const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const testWidth = estimateTextWidth(testLine, fontSize);
            
            if (testWidth > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines.length > 1 ? lines : [text];
    };
    
    // Sort stages by sort_order; exclude GA / Cohort 2 Live (not shown in timeline)
    const sortedStages = [...stages]
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter(s => !s.name.toLowerCase().includes('cohort 2'));
    
    // Find Cohort 1 Live stage
    const cohort1Stage = sortedStages.find(s => s.name.toLowerCase().includes('cohort 1'));
    
    // Calculate milestones
    const milestones: TimelineMilestone[] = [];
    let cumulativeDays = 0;
    
    sortedStages.forEach((stage) => {
        if (stage.duration_days !== null && stage.duration_days > 0) {
            milestones.push({
                stage,
                position: 0, // Will calculate based on dates
                dateOffset: cumulativeDays,
                isReleaseDate: stage.name.toLowerCase().includes('cohort 1') && cohort1Stage === stage
            });
            cumulativeDays += stage.duration_days;
        } else {
            // For stages without duration (like GA), place at the end
            milestones.push({
                stage,
                position: 0,
                dateOffset: cumulativeDays,
                isReleaseDate: false
            });
        }
    });
    
    // Calculate total timeline span
    const totalDays = cumulativeDays;
    const timelineWidth = 600;
    const timelineHeight = 140;
    const padding = noContainer ? 0 : 50;
    const timelineY = timelineHeight / 2;
    
    // Calculate positions for milestones
    milestones.forEach((milestone, index) => {
        if (milestone.stage.duration_days !== null && milestone.stage.duration_days > 0) {
            milestone.position = ((milestone.dateOffset + milestone.stage.duration_days) / totalDays) * 100;
        } else {
            // Place at end
            milestone.position = 100;
        }
    });
    
    // Format date helper
    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    
    // Calculate dates for milestones
    const getMilestoneDate = (offset: number) => {
        const date = new Date(launchDate);
        date.setDate(date.getDate() + offset);
        return date;
    };
    
    // Calculate release launch date (start of Cohort 1 Live)
    const calculateReleaseLaunchDate = () => {
        if (cohort1Stage && cohort1Stage.duration_days !== null) {
            // Release launch date is when Cohort 1 Live starts
            // It's after GTM Access (14 days) + Internal Readiness (21 days) = 35 days from launch
            const releaseOffset = milestones
                .filter(m => m.stage.sort_order < cohort1Stage.sort_order && m.stage.duration_days !== null)
                .reduce((sum, m) => sum + (m.stage.duration_days || 0), 0);
            return getMilestoneDate(releaseOffset);
        }
        return null;
    };
    
    const actualReleaseDate = releaseLaunchDate || calculateReleaseLaunchDate();
    
    if (sortedStages.length === 0) {
        return (
            <Box className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
                No release stages to display
            </Box>
        );
    }

    const chartContent = (
        <>
            {showHeading && <h3 className="text-lg font-semibold text-gray-900 mb-2">Release Stages Timeline</h3>}
            <Box className={`overflow-x-auto ${noContainer ? '' : '-mx-1'}`} style={noContainer ? { padding: 0, margin: 0 } : undefined}>
                <svg
                    width={timelineWidth}
                    height={timelineHeight}
                    viewBox={`0 0 ${timelineWidth} ${timelineHeight}`}
                    className="w-full"
                >
                    <defs>
                        <linearGradient id="timelineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#3B82F6" />
                            <stop offset="50%" stopColor="#8B5CF6" />
                            <stop offset="100%" stopColor="#EC4899" />
                        </linearGradient>
                        <marker
                            id="arrowhead"
                            markerWidth="10"
                            markerHeight="10"
                            refX="9"
                            refY="3"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3, 0 6" fill="#EC4899" />
                        </marker>
                    </defs>

                    {/* Main timeline line */}
                    <line
                        x1={padding}
                        y1={timelineY}
                        x2={timelineWidth - padding}
                        y2={timelineY}
                        stroke="url(#timelineGradient)"
                        strokeWidth="5"
                    />

                    {/* Release Launch Date marker (Cohort 1 Live start) */}
                    {actualReleaseDate && cohort1Stage && (
                        <g>
                            {(() => {
                                const releaseOffset = milestones
                                    .filter(m => m.stage.sort_order < cohort1Stage.sort_order && m.stage.duration_days !== null)
                                    .reduce((sum, m) => sum + (m.stage.duration_days || 0), 0);
                                const releaseX = padding + ((releaseOffset / totalDays) * (timelineWidth - padding * 2));
                                
                                const markerTop = timelineY - 28;
                                const releaseDateStr = formatChartDate(shiftDate(actualReleaseDate ?? null, TIMELINE_DAY_OFFSET));
                                return (
                                    <>
                                        {/* Orange dotted line marker - above chart, stops at top of bar */}
                                        <line
                                            x1={releaseX}
                                            y1={markerTop}
                                            x2={releaseX}
                                            y2={timelineY - 16}
                                            stroke="#F59E0B"
                                            strokeWidth="2.5"
                                            strokeDasharray="5 4"
                                            opacity="1"
                                        />
                                        <text
                                            x={releaseX}
                                            y={markerTop - (releaseDateStr ? 30 : 10)}
                                            textAnchor="middle"
                                            style={{
                                                fontFamily: 'var(--font-body)',
                                                fontSize: 'var(--font-size-xs)',
                                                fontWeight: 'var(--font-weight-medium)',
                                                fill: 'var(--color-gray-500)',
                                                letterSpacing: '0.05em'
                                            }}
                                        >
                                            RELEASE · Cohort 1
                                        </text>
                                        {releaseDateStr && (
                                            <text
                                                x={releaseX}
                                                y={markerTop - 4}
                                                textAnchor="middle"
                                                fontSize="17"
                                                fontWeight="700"
                                                fill="#000"
                                                style={{ fontFamily: 'var(--font-body)' }}
                                            >
                                                {releaseDateStr}
                                            </text>
                                        )}
                                    </>
                                );
                            })()}
                        </g>
                    )}

                    {/* Stage phases and milestones */}
                    {milestones.map((milestone, index) => {
                        if (milestone.stage.duration_days === null || milestone.stage.duration_days === 0) {
                            return null; // Skip stages without duration
                        }
                        
                        const stageStartX = padding + ((milestone.dateOffset / totalDays) * (timelineWidth - padding * 2));
                        const stageEndX = padding + (((milestone.dateOffset + milestone.stage.duration_days) / totalDays) * (timelineWidth - padding * 2));
                        const stageWidth = ((milestone.stage.duration_days / totalDays) * (timelineWidth - padding * 2));
                        const stageCenterX = stageStartX + stageWidth / 2;
                        
                        // Determine if this is a phase (GTM Access, Internal Readiness) or milestone (Cohort 1 Live, GA)
                        const isPhase = milestone.stage.name.toLowerCase().includes('gtm access') || 
                                       milestone.stage.name.toLowerCase().includes('internal readiness');
                        const isGTMAccess = milestone.stage.name.toLowerCase().includes('gtm access');
                        const isInternalReadiness = milestone.stage.name.toLowerCase().includes('internal readiness');
                        const isCohort1 = milestone.stage.name.toLowerCase().includes('cohort 1');
                        const isGA = milestone.stage.name.toLowerCase().includes('ga') || 
                                    milestone.stage.name.toLowerCase().includes('cohort 2');
                        
                        // Labels inside the bar: "Stage Name (X days)" in one string
                        const fontSize = 11;
                        const labelStr = `${milestone.stage.name} (${milestone.stage.duration_days} days)`;
                        const textWidth = estimateTextWidth(labelStr, fontSize);
                        const availableWidth = Math.min(stageWidth * 0.90, 160);
                        const wrappedText = textWidth > availableWidth ? wrapText(labelStr, availableWidth, fontSize) : [labelStr];
                        const labelY = timelineY;
                        
                        return (
                            <g key={milestone.stage.id}>
                                {/* Phase bar (for GTM Access and Internal Readiness) - same height and style as other stages */}
                                {isPhase && (
                                    <>
                                        <rect
                                            x={stageStartX}
                                            y={timelineY - 16}
                                            width={stageWidth}
                                            height="32"
                                            fill={isGTMAccess ? "#DBEAFE" : isInternalReadiness ? "#E9D5FF" : milestone.isReleaseDate ? "#FED7AA" : "#C7D2FE"}
                                            opacity="0.8"
                                        />
                                        
                                        {/* Phase label inside bar: "Name (X days)" */}
                                        <text
                                            x={stageCenterX}
                                            y={labelY}
                                            textAnchor="middle"
                                            fontSize={fontSize}
                                            fill="#1F2937"
                                        >
                                            {wrappedText.map((line, i) => (
                                                <tspan
                                                    key={i}
                                                    x={stageCenterX}
                                                    dy={i === 0 ? 0 : 12}
                                                >
                                                    {line}
                                                </tspan>
                                            ))}
                                        </text>
                                        
                                    </>
                                )}
                                
                                {/* Milestone marker (for Cohort 1 Live, GA, etc.) */}
                                {!isPhase && (
                                    <>
                                        {/* Stage duration bar background */}
                                        <rect
                                            x={stageStartX}
                                            y={timelineY - 16}
                                            width={stageWidth}
                                            height="32"
                                            fill={isCohort1 ? "#D1FAE5" : isGA ? "#6EE7B7" : milestone.isReleaseDate ? "#FED7AA" : "#C7D2FE"}
                                            opacity="0.8"
                                        />
                                        
                                        {/* Milestone label inside bar: "Name (X days)" */}
                                        <text
                                            x={stageCenterX}
                                            y={labelY}
                                            textAnchor="middle"
                                            fontSize={fontSize}
                                            fill="#1F2937"
                                        >
                                            {wrappedText.map((line, i) => (
                                                <tspan
                                                    key={i}
                                                    x={stageCenterX}
                                                    dy={i === 0 ? 0 : 12}
                                                >
                                                    {line}
                                                </tspan>
                                            ))}
                                        </text>
                                        
                                    </>
                                )}
                            </g>
                        );
                    })}

                    {/* Boundary date markers below the chart: end of Product Definition, end of GTM Access, end of Cohort 1 Live */}
                    {(() => {
                        const productDef = milestones.find(m => m.stage.name.toLowerCase().includes('product definition'));
                        const gtmAccess = milestones.find(m => m.stage.name.toLowerCase().includes('gtm access') && m.stage.duration_days != null && m.stage.duration_days > 0);
                        const cohort1 = milestones.find(m => m.stage.name.toLowerCase().includes('cohort 1') && m.stage.duration_days != null && m.stage.duration_days > 0);
                        const barBottom = timelineY + 16;
                        const dateY = barBottom + 24;
                        const lineEndY = barBottom + 10;
                        const strokeColor = '#6B7280';

                        const renderBoundaryMarker = (endOffset: number, key: string, date: Date, labelBelow?: string) => {
                            const x = padding + ((endOffset / totalDays) * (timelineWidth - padding * 2));
                            const displayDate = shiftDate(date, TIMELINE_DAY_OFFSET);
                            const dateStr = formatChartDateNoYear(displayDate);
                            const labelY = dateY + (dateStr ? 18 : 0);
                            return (
                                <g key={key}>
                                    <line x1={x} y1={barBottom} x2={x} y2={lineEndY} stroke={strokeColor} strokeWidth="2" strokeDasharray="4 3" opacity="0.9" />
                                    {dateStr && <text x={x} y={dateY} textAnchor="middle" fontSize="14" fontWeight="400" fill="#000" style={{ fontFamily: 'var(--font-body)' }}>{dateStr}</text>}
                                    {labelBelow && <text x={x} y={labelY} textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--color-gray-700)" style={{ fontFamily: 'var(--font-body)' }}>{labelBelow}</text>}
                                </g>
                            );
                        };

                        const markers: React.ReactNode[] = [];
                        markers.push(renderBoundaryMarker(0, 'timeline-start', getMilestoneDate(0)));
                        if (productDef && productDef.stage.duration_days != null) {
                            const endOffset = productDef.dateOffset + productDef.stage.duration_days;
                            markers.push(renderBoundaryMarker(endOffset, 'definition-end', getMilestoneDate(endOffset)));
                        }
                        if (gtmAccess && gtmAccess.stage.duration_days != null) {
                            const endOffset = gtmAccess.dateOffset + gtmAccess.stage.duration_days;
                            markers.push(renderBoundaryMarker(endOffset, 'gtm-end', getMilestoneDate(endOffset)));
                        }
                        if (cohort1 && cohort1.stage.duration_days != null) {
                            const endOffset = cohort1.dateOffset + cohort1.stage.duration_days;
                            markers.push(renderBoundaryMarker(endOffset, 'cohort1-end', getMilestoneDate(endOffset), 'GA · Cohort 2'));
                        }
                        if (markers.length === 0) return null;
                        return <g>{markers}</g>;
                    })()}

                    {/* Go/No-Go marker in GTM Access - rendered last to appear on top */}
                    {(() => {
                        const gtmAccessStage = milestones.find(m => 
                            m.stage.name.toLowerCase().includes('gtm access') && 
                            m.stage.duration_days !== null && 
                            m.stage.duration_days > 0
                        );
                        
                        if (gtmAccessStage) {
                            const stageStartX = padding + ((gtmAccessStage.dateOffset / totalDays) * (timelineWidth - padding * 2));
                            const stageWidth = ((gtmAccessStage.stage.duration_days! / totalDays) * (timelineWidth - padding * 2));
                            const goNoGoX = stageStartX + stageWidth / 2;
                            
                            const markerTop = timelineY - 28;
                            const goNoGoDateStr = formatChartDate(shiftDate(goNoGoDate, TIMELINE_DAY_OFFSET));
                            return (
                                <g>
                                    {/* Vertical dotted line marker - above chart, stops at top of bar */}
                                    <line
                                        x1={goNoGoX}
                                        y1={markerTop}
                                        x2={goNoGoX}
                                        y2={timelineY - 16}
                                        stroke="#DC2626"
                                        strokeWidth="2.5"
                                        strokeDasharray="5 4"
                                        opacity="0.85"
                                    />
                                    <text
                                        x={goNoGoX}
                                        y={markerTop - (goNoGoDateStr ? 30 : 10)}
                                        textAnchor="middle"
                                        style={{
                                            fontFamily: 'var(--font-body)',
                                            fontSize: 'var(--font-size-xs)',
                                            fontWeight: 'var(--font-weight-medium)',
                                            fill: 'var(--color-gray-500)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                        }}
                                    >
                                        Go/No-Go
                                    </text>
                                    {goNoGoDateStr && (
                                        <text
                                            x={goNoGoX}
                                            y={markerTop - 4}
                                            textAnchor="middle"
                                            fontSize="17"
                                            fontWeight="700"
                                            fill="#000"
                                            style={{ fontFamily: 'var(--font-body)' }}
                                        >
                                            {goNoGoDateStr}
                                        </text>
                                    )}
                                </g>
                            );
                        }
                        return null;
                    })()}
                </svg>
            </Box>
        </>
    );

    if (noContainer) {
        return <Box className="min-w-0">{chartContent}</Box>;
    }
    return (
        <Box className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {chartContent}
        </Box>
    );
}
