"use client";

import { IconVideo } from "@tabler/icons-react";

interface EpicDetailTabsProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    hasTalkTrackVideo?: boolean;
}

const tabs = [
    { value: 'readiness', label: 'Readiness' },
    { value: 'talktrack', label: 'Talk Track' },
    { value: 'adoption', label: 'Success Metrics' },
    { value: 'scorecard', label: 'Scorecard' },
    { value: 'retro', label: 'Retro' },
];

export function EpicDetailTabs({ activeTab, onTabChange, hasTalkTrackVideo }: EpicDetailTabsProps) {
    return (
        <nav 
            style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 0,
                marginBottom: 0,
                paddingBottom: 0,
            }}
            aria-label="Epic detail tabs"
        >
            {tabs.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                    <button
                        key={tab.value}
                        onClick={() => onTabChange(tab.value)}
                        style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 'var(--font-size-base)',
                            fontWeight: isActive ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
                            padding: 'var(--spacing-3) var(--spacing-5)',
                            borderRadius: isActive ? 'var(--radius-base) var(--radius-base) 0 0' : 0,
                            transition: 'var(--transition-base)',
                            backgroundColor: isActive ? 'var(--color-tab-panel-bg)' : 'var(--color-platinum)',
                            border: 'none',
                            borderBottom: isActive ? 'none' : '1px solid var(--color-gray-900)',
                            borderTop: isActive ? '1px solid var(--color-gray-900)' : 'none',
                            borderLeft: isActive ? '1px solid var(--color-gray-900)' : 'none',
                            borderRight: isActive ? '1px solid var(--color-gray-900)' : 'none',
                            color: isActive ? 'var(--color-gray-900)' : 'var(--color-gray-900)',
                            boxShadow: isActive ? 'none' : 'none',
                            cursor: 'pointer',
                            position: 'relative',
                            marginBottom: '-1px',
                            zIndex: isActive ? 2 : 0,
                            whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'var(--color-gray-50)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'var(--color-platinum)';
                            }
                        }}
                        aria-selected={isActive}
                        role="tab"
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {tab.label}
                            {tab.value === 'talktrack' && hasTalkTrackVideo && (
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
                            )}
                        </span>
                        {isActive && (
                            <span
                                aria-hidden
                                style={{
                                    position: 'absolute',
                                    bottom: -1,
                                    left: 0,
                                    right: 0,
                                    height: 1,
                                    backgroundColor: 'var(--color-tab-panel-bg)',
                                }}
                            />
                        )}
                    </button>
                );
            })}
        </nav>
    );
}

