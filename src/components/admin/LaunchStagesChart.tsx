'use client';

import { Box } from '@mantine/core';
import { useState } from 'react';

interface LaunchStage {
  id: number;
  name: string;
  sort_order: number;
  duration_days: number | null;
  details?: string | null;
}

interface LaunchStagesChartProps {
  stages: LaunchStage[];
}

interface TimelineMilestone {
  stage: LaunchStage;
  position: number; // Position on timeline (0-100%)
  dateOffset: number; // Days from launch date
  isReleaseDate?: boolean; // Is this the release launch date (Cohort 1 Live start)
}

export function LaunchStagesChart({ stages }: LaunchStagesChartProps) {
  const [launchDate] = useState<Date>(new Date()); // Default to today, could be made configurable
  const [releaseLaunchDate] = useState<Date | null>(null); // Could be fetched from release_schedule

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

  // Sort stages by sort_order
  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

  // Find Cohort 1 Live stage
  const cohort1Stage = sortedStages.find((s) => s.name.toLowerCase().includes('cohort 1'));

  // Calculate milestones
  const milestones: TimelineMilestone[] = [];
  let cumulativeDays = 0;

  sortedStages.forEach((stage) => {
    if (stage.duration_days !== null && stage.duration_days > 0) {
      milestones.push({
        stage,
        position: 0, // Will calculate based on dates
        dateOffset: cumulativeDays,
        isReleaseDate: stage.name.toLowerCase().includes('cohort 1') && cohort1Stage === stage,
      });
      cumulativeDays += stage.duration_days;
    } else {
      // For stages without duration (like GA), place at the end
      milestones.push({
        stage,
        position: 0,
        dateOffset: cumulativeDays,
        isReleaseDate: false,
      });
    }
  });

  // Calculate total timeline span
  const totalDays = cumulativeDays;
  const timelineWidth = 1000;
  const timelineHeight = 280;
  const padding = 60;
  const timelineY = timelineHeight / 2;

  // Calculate positions for milestones
  milestones.forEach((milestone, index) => {
    if (milestone.stage.duration_days !== null && milestone.stage.duration_days > 0) {
      milestone.position =
        ((milestone.dateOffset + milestone.stage.duration_days) / totalDays) * 100;
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
        .filter(
          (m) => m.stage.sort_order < cohort1Stage.sort_order && m.stage.duration_days !== null
        )
        .reduce((sum, m) => sum + (m.stage.duration_days || 0), 0);
      return getMilestoneDate(releaseOffset);
    }
    return null;
  };

  const actualReleaseDate = releaseLaunchDate || calculateReleaseLaunchDate();

  if (sortedStages.length === 0) {
    return (
      <Box className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
        No launch stages to display
      </Box>
    );
  }

  return (
    <Box className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Launch Stages Timeline</h3>
      <Box className="overflow-x-auto -mx-2">
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
                  .filter(
                    (m) =>
                      m.stage.sort_order < cohort1Stage.sort_order && m.stage.duration_days !== null
                  )
                  .reduce((sum, m) => sum + (m.stage.duration_days || 0), 0);
                const releaseX =
                  padding + (releaseOffset / totalDays) * (timelineWidth - padding * 2);

                return (
                  <>
                    {/* Orange dotted line marker - similar to Go/No-Go */}
                    <line
                      x1={releaseX}
                      y1={timelineY - 20}
                      x2={releaseX}
                      y2={timelineY + 70}
                      stroke="#F59E0B"
                      strokeWidth="2.5"
                      strokeDasharray="5 4"
                      opacity="1"
                    />
                    {/* Release Launch Date label with background */}
                    <rect
                      x={releaseX - 75}
                      y={timelineY + 58}
                      width="150"
                      height="18"
                      fill="white"
                      rx="3"
                      opacity="1"
                    />
                    <text
                      x={releaseX}
                      y={timelineY + 80}
                      textAnchor="middle"
                      fontSize="16"
                      fontWeight="600"
                      fill="#D97706"
                    >
                      Release Launch Date
                    </text>
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

            const stageStartX =
              padding + (milestone.dateOffset / totalDays) * (timelineWidth - padding * 2);
            const stageEndX =
              padding +
              ((milestone.dateOffset + milestone.stage.duration_days) / totalDays) *
                (timelineWidth - padding * 2);
            const stageWidth =
              (milestone.stage.duration_days / totalDays) * (timelineWidth - padding * 2);
            const stageCenterX = stageStartX + stageWidth / 2;

            // Determine if this is a phase (GTM Access, Internal Readiness) or milestone (Cohort 1 Live, GA)
            const isPhase =
              milestone.stage.name.toLowerCase().includes('gtm access') ||
              milestone.stage.name.toLowerCase().includes('internal readiness');
            const isGTMAccess = milestone.stage.name.toLowerCase().includes('gtm access');
            const isInternalReadiness = milestone.stage.name
              .toLowerCase()
              .includes('internal readiness');
            const isCohort1 = milestone.stage.name.toLowerCase().includes('cohort 1');
            const isGA =
              milestone.stage.name.toLowerCase().includes('ga') ||
              milestone.stage.name.toLowerCase().includes('cohort 2');

            // Check for overlaps and wrap text if needed
            const fontSize = 18;
            const durationFontSize = 15;
            const textWidth = estimateTextWidth(milestone.stage.name, fontSize);
            const availableWidth = Math.min(stageWidth * 0.9, 200); // Use 90% of stage width or max 200px
            const wrappedText =
              textWidth > availableWidth
                ? wrapText(milestone.stage.name, availableWidth, fontSize)
                : [milestone.stage.name];

            // Calculate if name and duration will overlap
            // SVG text y-coordinate is the baseline, text extends upward
            const lineHeight = 22; // Approximate line height for wrapped text
            const nameY = timelineY - 45;
            const durationY = timelineY - 38;
            const nameBaseline = nameY;
            const nameTop = nameBaseline - wrappedText.length * lineHeight; // Top of wrapped name text
            const durationBaseline = durationY;
            const durationTop = durationBaseline - durationFontSize; // Top of duration text
            const spacing = 5; // Minimum spacing between name bottom and duration top
            const overlapDetected = nameTop < durationTop + spacing;

            // Adjust name position upward if overlap detected
            const adjustedNameY = overlapDetected
              ? durationTop - wrappedText.length * lineHeight - spacing
              : nameY;

            return (
              <g key={milestone.stage.id}>
                {/* Phase bar (for GTM Access and Internal Readiness) */}
                {isPhase && (
                  <>
                    <rect
                      x={stageStartX}
                      y={timelineY - 24}
                      width={stageWidth}
                      height="48"
                      fill={
                        isGTMAccess
                          ? '#DBEAFE'
                          : isInternalReadiness
                            ? '#E9D5FF'
                            : milestone.isReleaseDate
                              ? '#FED7AA'
                              : '#C7D2FE'
                      }
                      opacity="0.9"
                      rx="4"
                      stroke={
                        isGTMAccess
                          ? '#2563EB'
                          : isInternalReadiness
                            ? '#9333EA'
                            : milestone.isReleaseDate
                              ? '#F59E0B'
                              : '#3B82F6'
                      }
                      strokeWidth="2.5"
                    />

                    {/* Phase label centered on bar */}
                    <text
                      x={stageCenterX}
                      y={adjustedNameY}
                      textAnchor="middle"
                      fontSize="18"
                      fontWeight="600"
                      fill="#1F2937"
                    >
                      {wrappedText.map((line, i) => (
                        <tspan key={i} x={stageCenterX} dy={i === 0 ? 0 : 20}>
                          {line}
                        </tspan>
                      ))}
                    </text>

                    {/* Duration label */}
                    <text
                      x={stageCenterX}
                      y={durationY}
                      textAnchor="middle"
                      fontSize="15"
                      fill="#6B7280"
                      fontWeight="500"
                    >
                      {milestone.stage.duration_days} days
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
                      fill={
                        isCohort1
                          ? '#D1FAE5'
                          : isGA
                            ? '#6EE7B7'
                            : milestone.isReleaseDate
                              ? '#FED7AA'
                              : '#C7D2FE'
                      }
                      opacity="0.8"
                      rx="4"
                    />

                    {/* Milestone label */}
                    <text
                      x={stageCenterX}
                      y={adjustedNameY}
                      textAnchor="middle"
                      fontSize="18"
                      fontWeight="600"
                      fill="#1F2937"
                    >
                      {wrappedText.map((line, i) => (
                        <tspan key={i} x={stageCenterX} dy={i === 0 ? 0 : 20}>
                          {line}
                        </tspan>
                      ))}
                    </text>

                    {/* Duration label */}
                    <text
                      x={stageCenterX}
                      y={durationY}
                      textAnchor="middle"
                      fontSize="15"
                      fill="#6B7280"
                      fontWeight="500"
                    >
                      {milestone.stage.duration_days} days
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {/* Go/No-Go marker in GTM Access - rendered last to appear on top */}
          {(() => {
            const gtmAccessStage = milestones.find(
              (m) =>
                m.stage.name.toLowerCase().includes('gtm access') &&
                m.stage.duration_days !== null &&
                m.stage.duration_days > 0
            );

            if (gtmAccessStage) {
              const stageStartX =
                padding + (gtmAccessStage.dateOffset / totalDays) * (timelineWidth - padding * 2);
              const stageWidth =
                (gtmAccessStage.stage.duration_days! / totalDays) * (timelineWidth - padding * 2);
              const goNoGoX = stageStartX + stageWidth / 2;

              return (
                <g>
                  {/* Vertical dotted line marker - goes through GTM Access rectangle, rendered on top */}
                  <line
                    x1={goNoGoX}
                    y1={timelineY - 24}
                    x2={goNoGoX}
                    y2={timelineY + 70}
                    stroke="#DC2626"
                    strokeWidth="2.5"
                    strokeDasharray="5 4"
                    opacity="0.85"
                  />
                  {/* Go/No-Go label with background for better visibility */}
                  <rect
                    x={goNoGoX - 35}
                    y={timelineY + 58}
                    width="70"
                    height="18"
                    fill="white"
                    rx="3"
                    opacity="1"
                  />
                  <text
                    x={goNoGoX}
                    y={timelineY + 80}
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="600"
                    fill="#DC2626"
                  >
                    Go/No-Go
                  </text>
                </g>
              );
            }
            return null;
          })()}
        </svg>
      </Box>
    </Box>
  );
}
