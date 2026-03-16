"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useMediaQuery } from "@mantine/hooks";
import { Drawer, Button } from "@mantine/core";
import { IconMenu2 } from "@tabler/icons-react";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { useAppMode } from "@/contexts/AppModeContext";

const MOBILE_BREAKPOINT = "(max-width: 768px)";

function SettingsNav({ onNavigate }: { onNavigate?: () => void }) {
    const pathname = usePathname();
    const { appMode } = useAppMode();
    const isActive = (path: string) => {
        if (path === "/admin/settings" && pathname === "/admin/settings") return true;
        if (path !== "/admin/settings" && pathname?.startsWith(path)) return true;
        return false;
    };
    const isSuccessMeasurementExpanded = pathname?.startsWith("/admin/settings/success-measurement");
    const isNotificationsExpanded = pathname?.startsWith("/admin/settings/notifications") || pathname?.startsWith("/admin/settings/email-templates");

    const linkProps = (path: string, active: boolean) => ({
        href: path,
        onClick: onNavigate,
        className: `block w-full text-left px-4 py-2 rounded-lg transition-colors ${active ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`,
    });
    const linkPropsSm = (path: string, active: boolean) => ({
        href: path,
        onClick: onNavigate,
        className: `block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${active ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`,
    });

    return (
        <nav>
            <ul className="space-y-1">
                {/* Release-mode nav items */}
                {appMode === 'release' && (
                    <>
                        <li><Link {...linkProps("/admin/settings/releases", isActive("/admin/settings/releases"))}>Release Schedule</Link></li>
                        <li><Link {...linkProps("/admin/settings/criteria", isActive("/admin/settings/criteria"))}>Release Criteria</Link></li>
                    </>
                )}

                {/* Launch-mode nav items */}
                {appMode === 'launch' && (
                    <>
                        <li><Link {...linkProps("/admin/settings/launch-schedule", isActive("/admin/settings/launch-schedule"))}>Launch Schedule</Link></li>
                        <li><Link {...linkProps("/admin/settings/launch-criteria", isActive("/admin/settings/launch-criteria"))}>Launch Criteria</Link></li>
                    </>
                )}

                {/* Always visible: Release Stages (shared between modes) */}
                <li><Link {...linkProps("/admin/settings/release-stages", isActive("/admin/settings/release-stages"))}>Release Stages</Link></li>

                <li>
                    <Link href="/admin/settings/notifications" onClick={onNavigate} className={`w-full block text-left px-4 py-2 rounded-lg transition-colors flex items-center justify-between ${isNotificationsExpanded ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                        <span>Notifications</span>
                        <svg className={`w-4 h-4 transition-transform ${isNotificationsExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </Link>
                    {isNotificationsExpanded && (
                        <ul className="ml-4 mt-1 space-y-1">
                            <li><Link {...linkPropsSm("/admin/settings/notifications", isActive("/admin/settings/notifications"))}>Notification Settings</Link></li>
                            <li><Link {...linkPropsSm("/admin/settings/email-templates", isActive("/admin/settings/email-templates"))}>Email Templates</Link></li>
                            <li><Link {...linkPropsSm("/admin/settings/notifications/reports", isActive("/admin/settings/notifications/reports"))}>Notifications Log</Link></li>
                        </ul>
                    )}
                </li>
                {appMode === 'release' && (
                    <li>
                        <Link href="/admin/settings/success-measurement/metrics" onClick={onNavigate} className={`w-full block text-left px-4 py-2 rounded-lg transition-colors flex items-center justify-between ${isSuccessMeasurementExpanded ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                            <span>Success measurement</span>
                            <svg className={`w-4 h-4 transition-transform ${isSuccessMeasurementExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </Link>
                        {isSuccessMeasurementExpanded && (
                            <ul className="ml-4 mt-1 space-y-1">
                                <li><Link {...linkPropsSm("/admin/settings/success-measurement/metrics", isActive("/admin/settings/success-measurement/metrics"))}>Metrics</Link></li>
                                <li><Link {...linkPropsSm("/admin/settings/success-measurement/dashboards", isActive("/admin/settings/success-measurement/dashboards"))}>Dashboards</Link></li>
                                <li><Link {...linkPropsSm("/admin/settings/success-measurement/scorecards", isActive("/admin/settings/success-measurement/scorecards"))}>Scorecards</Link></li>
                            </ul>
                        )}
                    </li>
                )}
                <li><Link {...linkProps("/admin/settings/performance", isActive("/admin/settings/performance"))}>Performance</Link></li>
                <li><Link {...linkProps("/admin/settings/general", isActive("/admin/settings/general"))}>Other Settings</Link></li>
            </ul>
        </nav>
    );
}

function SettingsLayoutContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { error } = useSettings();

    useEffect(() => {
        setDrawerOpen(false);
    }, [pathname]);
    
    return (
        <main className="min-h-screen" style={{ background: 'var(--color-platinum)' }}>
                <div style={{
                    maxWidth: 'var(--page-container-max-width)',
                    margin: '0 auto',
                    paddingLeft: 'var(--page-container-padding-x)',
                    paddingRight: 'var(--page-container-padding-x)',
                    paddingTop: 'var(--page-container-padding-top)',
                    paddingBottom: 'var(--spacing-8)'
                }}
                className="sm:px-6 lg:px-8"
                >
                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                            {error}
                        </div>
                    )}
                    <div className={`flex gap-6 ${isMobile ? "flex-col" : ""}`}>
                        {/* Mobile: menu button row + drawer */}
                        {isMobile && (
                            <>
                                <div className="flex-shrink-0">
                                    <Button
                                        variant="light"
                                        leftSection={<IconMenu2 size={18} />}
                                        onClick={() => setDrawerOpen(true)}
                                        aria-label="Open settings menu"
                                    >
                                        Settings menu
                                    </Button>
                                </div>
                                <Drawer
                                    opened={drawerOpen}
                                    onClose={() => setDrawerOpen(false)}
                                    title="Settings"
                                    position="left"
                                    size="280px"
                                >
                                    <SettingsNav onNavigate={() => setDrawerOpen(false)} />
                                </Drawer>
                            </>
                        )}
                        {/* Desktop: Sidebar Navigation */}
                        <div className="hidden md:block w-64 flex-shrink-0 sticky top-20 self-start">
                            <SettingsNav />
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                            {children}
                        </div>
                    </div>
                </div>
            </main>
    );
}

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SettingsProvider>
            <SettingsLayoutContent>{children}</SettingsLayoutContent>
        </SettingsProvider>
    );
}
