"use client";

import { IconVideo } from "@tabler/icons-react";
import { DetailTabs, type DetailTab } from "./DetailTabs";

interface EpicDetailTabsProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    hasTalkTrackVideo?: boolean;
    /** When true, show Roadmap Rewind + Confidence (feature-flagged on parent). */
    showRoadmapRewind?: boolean;
    /** When true, show the Story Brief tab (feature-flagged on parent). */
    showStoryBrief?: boolean;
}

const baseTabs = [
    { value: 'readiness', label: 'Readiness' },
    { value: 'talktrack', label: 'Talk Track' },
    { value: 'adoption', label: 'Success Metrics' },
    { value: 'scorecard', label: 'Scorecard' },
    { value: 'forecast', label: 'Forecast' },
    { value: 'retro', label: 'Retro' },
] as const;

function TalkTrackVideoBadge() {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: 'var(--color-copper)',
                flexShrink: 0,
            }}
        >
            <IconVideo size={13} stroke={2.2} style={{ color: '#fff' }} />
        </span>
    );
}

/**
 * Epic detail tab strip. The folder-tab styling lives in DetailTabs, which the
 * launch detail page shares; this component only decides which tabs an epic has.
 */
export function EpicDetailTabs({
    activeTab,
    onTabChange,
    hasTalkTrackVideo,
    showRoadmapRewind,
    showStoryBrief,
}: EpicDetailTabsProps) {
    const tabs: DetailTab[] = [
        ...baseTabs.map((t) => ({
            value: t.value,
            label: t.label,
            badge: t.value === 'talktrack' && hasTalkTrackVideo ? <TalkTrackVideoBadge /> : undefined,
        })),
        ...(showStoryBrief ? [{ value: 'storyBrief', label: 'Story Brief' }] : []),
        ...(showRoadmapRewind
            ? [
                  { value: 'rewind', label: 'Rewind' },
                  { value: 'confidence', label: 'Confidence' },
              ]
            : []),
    ];

    return (
        <DetailTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={onTabChange}
            ariaLabel="Epic detail tabs"
        />
    );
}
