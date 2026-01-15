"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserAvatar } from './UserAvatar';
import { EpicSearch } from './EpicSearch';
import { useEpicScope } from '@/lib/contexts/EpicScopeContext';
import { SegmentedControl } from '@mantine/core';
import { canRolesPerform } from '@/lib/permissions';
import type { CapabilityId } from '@/lib/permissions';

interface HeaderProps {
    email?: string | null;
    role?: string | null;
    imageUrl?: string | null;
}

export function Header({ email, role, imageUrl }: HeaderProps) {
    const pathname = usePathname();
    const { scope, setScope } = useEpicScope();
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [hasSettingsAccess, setHasSettingsAccess] = useState(false);
    const [hasMeetingsAccess, setHasMeetingsAccess] = useState(false);

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

                    const hasMeetings = canRolesPerform(roles, 'meetings.read');
                    setHasMeetingsAccess(hasMeetings);
                }
            } catch (error) {
                console.error('Failed to fetch user roles:', error);
            }
        };

        fetchUserRoles();
    }, []);

    // Hide header on setup-password page
    if (pathname?.includes('/setup-password')) {
        return null;
    }

    // Check if user has only the OTHER role (pending access)
    const hasOnlyOtherRole = !role || role === 'OTHER';

    // Primary navigation tabs
    const primaryTabs = [
        { link: '/', label: 'Home' },
        { link: '/epics', label: 'Releases' },
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
            {/* Top Navigation Bar - Dark Blue Background */}
            <header 
                style={{
                    height: 'var(--nav-height, 64px)',
                    backgroundColor: 'var(--nav-bg, #1E3A5F)',
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
                    {/* Left side: Logo and Primary Navigation Tabs */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                        {/* Logo - Purple rounded square with lightning bolt and ClearGO text */}
                        <Link 
                            href={hasOnlyOtherRole ? "/access-pending" : "/"} 
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
                                backgroundColor: 'var(--color-accent, #6B46C1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <svg
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="white"
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

                        {/* Primary Navigation Tabs - Hidden for users with only OTHER role */}
                        {!hasOnlyOtherRole && (
                            <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '100%' }}>
                                {primaryTabs.map((tab) => {
                                    const active = isActive(tab.link);
                                    return (
                                        <Link
                                            key={tab.link}
                                            href={tab.link}
                                            style={{
                                                color: active ? 'var(--nav-text, #FFFFFF)' : 'var(--color-blue-200, #BFDBFE)',
                                                fontSize: 'var(--font-size-base, 14px)',
                                                fontWeight: active ? 'var(--font-weight-bold, 700)' : 'var(--font-weight-medium, 500)',
                                                textDecoration: 'none',
                                                fontFamily: 'var(--font-body, system-ui, sans-serif)',
                                                padding: 'var(--spacing-2, 8px) var(--spacing-3, 12px)',
                                                borderRadius: 'var(--radius-base, 6px)',
                                                backgroundColor: active ? 'var(--color-accent-bg, rgba(107, 70, 193, 0.15))' : 'transparent',
                                                borderBottom: active ? '2px solid var(--color-accent, #6B46C1)' : '2px solid transparent',
                                                transition: 'var(--transition-base, 0.2s ease)',
                                                height: 'fit-content',
                                                display: 'flex',
                                                alignItems: 'center'
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
                                        </Link>
                                    );
                                })}
                            </nav>
                        )}
                    </div>

                    {/* Right side: Scope Toggle, Search and User Avatar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        {/* Scope Toggle - Only show for users with proper roles */}
                        {!hasOnlyOtherRole && (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <SegmentedControl
                                    value={scope}
                                    onChange={(value) => setScope(value as 'all' | 'my')}
                                    data={[
                                        { label: 'All scope', value: 'all' },
                                        { label: 'My scope', value: 'my' },
                                    ]}
                                    size="sm"
                                    styles={{
                                        root: {
                                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                        },
                                        indicator: {
                                            backgroundColor: 'var(--color-accent, #6B46C1)',
                                        },
                                        label: {
                                            color: 'var(--nav-text, #FFFFFF)',
                                            fontSize: 'var(--font-size-sm, 12px)',
                                            fontWeight: 'var(--font-weight-medium, 500)',
                                            padding: '4px 12px',
                                        },
                                    }}
                                />
                            </div>
                        )}
                        {/* Epic Search - Hidden for users with only OTHER role */}
                        {!hasOnlyOtherRole && (
                            <div style={{
                                position: 'relative',
                                width: '280px'
                            }}>
                                <EpicSearch fetchEpics={true} className="header-search" />
                            </div>
                        )}

                        {/* User Avatar */}
                        <UserAvatar email={email} role={role} imageUrl={imageUrl} />
                    </div>
                </div>
            </header>
        </>
    );
}
