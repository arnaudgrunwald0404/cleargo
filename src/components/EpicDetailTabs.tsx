"use client";

interface EpicDetailTabsProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

const tabs = [
    { value: 'readiness', label: 'Readiness' },
    { value: 'decisions', label: 'Decisions' },
    { value: 'adoption', label: 'Success Config' },
    { value: 'scorecard', label: 'Scorecard' },
    { value: 'retro', label: 'Retro' },
];

export function EpicDetailTabs({ activeTab, onTabChange }: EpicDetailTabsProps) {
    return (
        <nav 
            style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 0,
                marginBottom: 0,
                borderBottom: '1px solid var(--color-gray-900)',
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
                            backgroundColor: 'var(--color-white)',
                            border: 'none',
                            borderBottom: isActive ? 'none' : '1px solid var(--color-gray-900)',
                            borderTop: isActive ? '1px solid var(--color-gray-900)' : 'none',
                            borderLeft: isActive ? '1px solid var(--color-gray-900)' : 'none',
                            borderRight: isActive ? '1px solid var(--color-gray-900)' : 'none',
                            color: isActive ? 'var(--color-accent)' : 'var(--color-gray-900)',
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
                                e.currentTarget.style.backgroundColor = 'var(--color-white)';
                            }
                        }}
                        aria-selected={isActive}
                        role="tab"
                    >
                        {tab.label}
                    </button>
                );
            })}
        </nav>
    );
}

