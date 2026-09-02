"use client";

import React from "react";

export interface DetailTab {
    value: string;
    label: string;
    /** Optional trailing element, e.g. a count pill or an icon badge. */
    badge?: React.ReactNode;
}

interface DetailTabsProps {
    tabs: DetailTab[];
    activeTab: string;
    onTabChange: (tab: string) => void;
    /** Accessible name for the tab strip, e.g. "Launch detail tabs". */
    ariaLabel: string;
}

/**
 * The folder-tab strip used on detail pages. Extracted from EpicDetailTabs so
 * epics and launches share one implementation rather than two copies that drift
 * apart -- the divergence between those two pages is exactly what this avoids.
 *
 * Presentational only: the parent owns which tab is active and what each panel
 * renders.
 */
export function DetailTabs({ tabs, activeTab, onTabChange, ariaLabel }: DetailTabsProps) {
    return (
        <nav
            style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 0,
                marginBottom: 0,
                paddingBottom: 0,
                // No overflow rule on purpose. Setting overflowX alone makes the
                // other axis compute from 'visible' to 'auto', and the active
                // tab's marginBottom: -1px (the overhang that merges it into the
                // panel below) makes the content a pixel taller than the nav --
                // enough to raise a vertical scrollbar on the right of the strip.
                // Clipping it with overflowY: 'hidden' would eat that overhang
                // and leave a hairline across the active tab instead.
            }}
            aria-label={ariaLabel}
            role="tablist"
        >
            {tabs.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                    <button
                        key={tab.value}
                        onClick={() => onTabChange(tab.value)}
                        style={{
                            fontFamily: "var(--font-body)",
                            fontSize: "var(--font-size-base)",
                            fontWeight: isActive
                                ? "var(--font-weight-bold)"
                                : "var(--font-weight-medium)",
                            padding: "var(--spacing-3) var(--spacing-5)",
                            borderRadius: isActive ? "var(--radius-base) var(--radius-base) 0 0" : 0,
                            transition: "var(--transition-base)",
                            backgroundColor: isActive
                                ? "var(--color-tab-panel-bg)"
                                : "var(--color-platinum)",
                            border: "none",
                            borderBottom: isActive ? "none" : "1px solid var(--color-gray-900)",
                            borderTop: isActive ? "1px solid var(--color-gray-900)" : "none",
                            borderLeft: isActive ? "1px solid var(--color-gray-900)" : "none",
                            borderRight: isActive ? "1px solid var(--color-gray-900)" : "none",
                            color: "var(--color-gray-900)",
                            cursor: "pointer",
                            position: "relative",
                            marginBottom: "-1px",
                            zIndex: isActive ? 2 : 0,
                            whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = "var(--color-gray-50)";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = "var(--color-platinum)";
                            }
                        }}
                        aria-selected={isActive}
                        role="tab"
                    >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            {tab.label}
                            {tab.badge}
                        </span>
                        {isActive && (
                            <span
                                aria-hidden
                                style={{
                                    position: "absolute",
                                    bottom: -1,
                                    left: 0,
                                    right: 0,
                                    height: 1,
                                    backgroundColor: "var(--color-tab-panel-bg)",
                                }}
                            />
                        )}
                    </button>
                );
            })}
        </nav>
    );
}

/** Count pill for a tab label, e.g. Checklist (12/60). */
export function TabCount({ children }: { children: React.ReactNode }) {
    return (
        <span
            style={{
                fontSize: "var(--font-size-sm, 12px)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-gray-500)",
            }}
        >
            {children}
        </span>
    );
}
