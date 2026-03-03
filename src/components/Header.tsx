"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMediaQuery } from '@mantine/hooks';
import { Menu, Burger, Box, Badge } from '@mantine/core';
import { UserAvatar } from './UserAvatar';
import { EpicSearch } from './EpicSearch';
import { canRolesPerform } from '@/lib/permissions';
import type { CapabilityId } from '@/lib/permissions';
import { isEnabled, FEATURE_MEETINGS } from '@/lib/flags';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';

const MOBILE_BREAKPOINT = '(max-width: 768px)';

interface HeaderProps {
    email?: string | null;
    role?: string | null;
    imageUrl?: string | null;
}

export function Header({ email, role, imageUrl }: HeaderProps) {
    const pathname = usePathname();
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
    const { flags: featureFlags } = useFeatureFlags();
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [hasSettingsAccess, setHasSettingsAccess] = useState(false);
    const [hasMeetingsAccess, setHasMeetingsAccess] = useState(false);
    const [hasAnalyticsAccess, setHasAnalyticsAccess] = useState(false);
    const [unreadCommentCount, setUnreadCommentCount] = useState(0);

    // Fetch user roles and check settings access
    useEffect(() => {
        const fetchUserRoles = async () => {
            try {
                const { fetchWithRateLimit } = await import('@/lib/fetch-with-rate-limit');
                const res = await fetchWithRateLimit('/api/me', { credentials: 'include', maxRetries: 1 });
                if (res.ok) {
                    const data = await res.json();
                    const roles = Array.isArray(data.user?.roles) 
                        ? data.user.roles 
                        : (data.user?.role ? [data.user.role] : []);
                    setUserRoles(roles);

                    // Check if user has access to any settings-related capability
                    const settingsCapabilities: CapabilityId[] = [
                        'settings.read',
                        'settings.emailTemplates.read',
                        'settings.ahaFields.read',
                        'settings.webhookUrl.read',
                    ];

                    const hasAccess = settingsCapabilities.some(capability => 
                        canRolesPerform(roles, capability)
                    );
                    setHasSettingsAccess(hasAccess);

                    const hasMeetings = isEnabled(FEATURE_MEETINGS, featureFlags) && canRolesPerform(roles, 'meetings.read');
                    setHasMeetingsAccess(hasMeetings);

                    setHasAnalyticsAccess(canRolesPerform(roles, 'analytics.read'));
                }
            } catch (error) {
                console.error('Failed to fetch user roles:', error);
            }
        };

        fetchUserRoles();
    }, []);

    useEffect(() => {
        const fetchUnreadCount = async () => {
            try {
                const res = await fetchWithRateLimit('/api/comments/all?myEpicsOnly=true&unread=true', { credentials: 'include', maxRetries: 1 });
                if (res.ok) {
                    const data = await res.json();
                    setUnreadCommentCount(data.unread_count ?? 0);
                }
            } catch {
                // silently ignore
            }
        };

        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 60_000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    // Hide header on setup-password page
    if (pathname?.includes('/setup-password')) {
        return null;
    }

    // Primary navigation tabs
    const primaryTabs: Array<{ link: string; label: string; badge?: number }> = [
        { link: '/', label: 'Home' },
        { link: '/portfolio', label: 'Portfolio' },
        { link: '/epics', label: 'Releases' },
        { link: '/comments', label: 'Comments', badge: unreadCommentCount > 0 ? unreadCommentCount : undefined },
        ...(hasAnalyticsAccess ? [{ link: '/analytics', label: 'Analytics' }] : []),
        { link: '/feedback', label: 'Feedback' },
        ...(hasMeetingsAccess ? [{ link: '/meetings', label: 'Meetings' }] : []),
        ...(hasSettingsAccess ? [{ link: '/admin/settings', label: 'Settings' }] : []),
    ];

    const isActive = (path: string) => {
        if (path === '/' && pathname === '/') return true;
        if (path !== '/' && pathname?.startsWith(path)) return true;
        return false;
    };

    return (
        <>
            {/* Top Navigation Bar - Cast Iron background */}
            <header 
                style={{
                    height: 'var(--nav-height, 64px)',
                    backgroundColor: 'var(--nav-bg, #37352A)',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 'var(--z-index-ai-panel, 1000)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 var(--nav-padding-x, 24px)',
                    minHeight: 'var(--nav-height, 64px)',
                    width: '100%',
                    boxSizing: 'border-box'
                }}
            >
                <div style={{
                    maxWidth: '100%',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: '100%'
                }}>
                    {/* Left side: Logo and Primary Navigation Tabs (desktop) or Logo + Menu (mobile) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '32px' }}>
                        <Link 
                            href="/" 
                            prefetch={false}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                textDecoration: 'none'
                            }}
                        >
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: 'var(--radius-md, 8px)',
                                backgroundColor: 'var(--color-copper, #C77B3C)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <svg
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="var(--color-white, #FFFFFF)"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                </svg>
                            </div>
                            <span style={{
                                fontFamily: 'var(--font-heading, system-ui, sans-serif)',
                                fontSize: 'var(--font-size-xl, 20px)',
                                fontWeight: 'var(--font-weight-bold, 700)',
                                color: 'var(--nav-text, #FFFFFF)'
                            }}>
                                ClearGO
                            </span>
                        </Link>

                        {isMobile ? (
                            <Menu opened={menuOpen} onChange={setMenuOpen} width={280} position="bottom-start" shadow="md">
                                <Menu.Target>
                                    <Burger
                                        opened={menuOpen}
                                        onClick={() => setMenuOpen((o) => !o)}
                                        size="sm"
                                        color="var(--nav-text, #FFFFFF)"
                                        aria-label="Open navigation menu"
                                    />
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Box p="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
                                        <EpicSearch fetchEpics={true} className="header-search" />
                                    </Box>
                                    {primaryTabs.map((tab) => {
                                        const active = isActive(tab.link);
                                        return (
                                            <Menu.Item
                                                key={tab.link}
                                                component={Link}
                                                href={tab.link}
                                                prefetch={false}
                                                style={{
                                                    fontWeight: active ? 700 : 500,
                                                    backgroundColor: active ? 'var(--color-gray-100)' : undefined
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {tab.label}
                                                    {tab.badge !== undefined && tab.badge > 0 && (
                                                        <Badge size="xs" variant="filled" style={{ backgroundColor: 'var(--color-accent, #C3B497)', color: '#3a3322' }}>
                                                            {tab.badge > 99 ? '99+' : tab.badge}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </Menu.Item>
                                        );
                                    })}
                                </Menu.Dropdown>
                            </Menu>
                        ) : (
                            <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '100%' }}>
                                {primaryTabs.map((tab) => {
                                    const active = isActive(tab.link);
                                    return (
                                        <Link
                                            key={tab.link}
                                            href={tab.link}
                                            prefetch={false}
                                            style={{
                                                color: active ? 'var(--nav-text, #FFFFFF)' : 'var(--color-blue-200, #BFDBFE)',
                                                fontSize: 'var(--font-size-base, 14px)',
                                                fontWeight: active ? 'var(--font-weight-bold, 700)' : 'var(--font-weight-medium, 500)',
                                                textDecoration: 'none',
                                                fontFamily: 'var(--font-body, system-ui, sans-serif)',
                                                padding: 'var(--spacing-2, 8px) var(--spacing-3, 12px)',
                                                borderRadius: 'var(--radius-base, 6px)',
                                                backgroundColor: active ? 'var(--color-accent-bg)' : 'transparent',
                                                borderBottom: active ? '2px solid var(--color-accent, #C3B497)' : '2px solid transparent',
                                                transition: 'var(--transition-base, 0.2s ease)',
                                                height: 'fit-content',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!active) {
                                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                                                    e.currentTarget.style.color = 'var(--color-blue-100)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!active) {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                    e.currentTarget.style.color = 'var(--color-blue-200)';
                                                }
                                            }}
                                        >
                                            {tab.label}
                                            {tab.badge !== undefined && tab.badge > 0 && (
                                <Badge size="xs" variant="filled" style={{ minWidth: '20px', backgroundColor: 'var(--color-accent, #C3B497)', color: '#3a3322' }}>
                                                {tab.badge > 99 ? '99+' : tab.badge}
                                            </Badge>
                                            )}
                                        </Link>
                                    );
                                })}
                            </nav>
                        )}
                    </div>

                    {/* Right side: Search (desktop only) and User Avatar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        {!isMobile && (
                            <div style={{ position: 'relative', width: '280px' }}>
                                <EpicSearch fetchEpics={true} className="header-search" />
                            </div>
                        )}
                        <UserAvatar email={email} role={role} imageUrl={imageUrl} />
                    </div>
                </div>
            </header>
        </>
    );
}
