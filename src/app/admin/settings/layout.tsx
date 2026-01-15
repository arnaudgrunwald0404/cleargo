"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";

function SettingsLayoutContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { error } = useSettings();
    
    const isActive = (path: string) => {
        if (path === "/admin/settings" && pathname === "/admin/settings") return true;
        if (path !== "/admin/settings" && pathname?.startsWith(path)) return true;
        return false;
    };
    
    const isUsersExpanded = pathname?.startsWith("/admin/settings/users");
    const isIntegrationsExpanded = pathname?.startsWith("/admin/settings/integrations");
    const isSuccessMeasurementExpanded = pathname?.startsWith("/admin/settings/success-measurement");
    
    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
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
                    <div className="flex gap-6">
                        {/* Sidebar Navigation */}
                        <div className="w-64 flex-shrink-0 sticky top-20 self-start">
                            <nav>
                                <ul className="space-y-1">
                                    <li>
                                        <Link
                                            href="/admin/settings/users/users"
                                            className={`w-full block text-left px-4 py-2 rounded-lg transition-colors flex items-center justify-between ${
                                                isUsersExpanded
                                                    ? "bg-indigo-50 text-indigo-700 font-medium"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            <span>User Management</span>
                                            <svg
                                                className={`w-4 h-4 transition-transform ${isUsersExpanded ? "rotate-90" : ""}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </Link>
                                        {isUsersExpanded && (
                                            <ul className="ml-4 mt-1 space-y-1">
                                                <li>
                                                    <Link
                                                        href="/admin/settings/users/users"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/admin/settings/users/users")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Users
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/admin/settings/users/pm-mapping"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/admin/settings/users/pm-mapping")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        PM Mapping
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/admin/settings/users/domains"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/admin/settings/users/domains")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Domains
                                                    </Link>
                                                </li>
                                            </ul>
                                        )}
                                    </li>
                                    <li>
                                        <Link
                                            href="/admin/settings/permissions"
                                            className={`block w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                                isActive("/admin/settings/permissions")
                                                    ? "bg-indigo-50 text-indigo-700 font-medium"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            Permissions
                                        </Link>
                                    </li>
                                    <li>
                                        <Link
                                            href="/admin/settings/releases"
                                            className={`block w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                                isActive("/admin/settings/releases")
                                                    ? "bg-indigo-50 text-indigo-700 font-medium"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            Release Schedule
                                        </Link>
                                    </li>
                                    <li>
                                        <Link
                                            href="/admin/settings/launch-stages"
                                            className={`block w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                                isActive("/admin/settings/launch-stages")
                                                    ? "bg-indigo-50 text-indigo-700 font-medium"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            Launch Stages
                                        </Link>
                                    </li>
                                    <li>
                                        <Link
                                            href="/admin/settings/criteria"
                                            className={`block w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                                isActive("/admin/settings/criteria")
                                                    ? "bg-indigo-50 text-indigo-700 font-medium"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            ClearGO Criteria
                                        </Link>
                                    </li>
                                    <li>
                                        <Link
                                            href="/admin/settings/email-templates"
                                            className={`block w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                                isActive("/admin/settings/email-templates")
                                                    ? "bg-indigo-50 text-indigo-700 font-medium"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            Email Templates
                                        </Link>
                                    </li>
                                    <li>
                                        <Link
                                            href="/admin/settings/integrations/aha"
                                            className={`w-full block text-left px-4 py-2 rounded-lg transition-colors flex items-center justify-between ${
                                                isIntegrationsExpanded
                                                    ? "bg-indigo-50 text-indigo-700 font-medium"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            <span>Integrations</span>
                                            <svg
                                                className={`w-4 h-4 transition-transform ${isIntegrationsExpanded ? "rotate-90" : ""}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </Link>
                                        {isIntegrationsExpanded && (
                                            <ul className="ml-4 mt-1 space-y-1">
                                                <li>
                                                    <Link
                                                        href="/admin/settings/integrations/aha"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/admin/settings/integrations/aha")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Aha
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/admin/settings/integrations/slack"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/admin/settings/integrations/slack")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Slack
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/admin/settings/integrations/email"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/admin/settings/integrations/email")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Email
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/admin/settings/integrations/calendar"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/admin/settings/integrations/calendar")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Calendar
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/admin/settings/integrations/jira"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/admin/settings/integrations/jira")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Jira
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/admin/settings/integrations/pendo"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/admin/settings/integrations/pendo")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Pendo
                                                    </Link>
                                                </li>
                                            </ul>
                                        )}
                                    </li>
                                    <li>
                                        <Link
                                            href="/settings/success-measurement/metrics"
                                            className={`w-full block text-left px-4 py-2 rounded-lg transition-colors flex items-center justify-between ${
                                                isSuccessMeasurementExpanded
                                                    ? "bg-indigo-50 text-indigo-700 font-medium"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            <span>Success Measurement</span>
                                            <svg
                                                className={`w-4 h-4 transition-transform ${isSuccessMeasurementExpanded ? "rotate-90" : ""}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </Link>
                                        {isSuccessMeasurementExpanded && (
                                            <ul className="ml-4 mt-1 space-y-1">
                                                <li>
                                                    <Link
                                                        href="/settings/success-measurement/metrics"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/settings/success-measurement/metrics")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Metrics
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/settings/success-measurement/benchmarks"
                                                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                                                            isActive("/settings/success-measurement/benchmarks")
                                                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                : "text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        Adoption Benchmarks
                                                    </Link>
                                                </li>
                                            </ul>
                                        )}
                                    </li>
                                    <li>
                                        <Link
                                            href="/admin/settings/general"
                                            className={`block w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                                isActive("/admin/settings/general")
                                                    ? "bg-indigo-50 text-indigo-700 font-medium"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            Other Settings
                                        </Link>
                                    </li>
                                </ul>
                            </nav>
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
