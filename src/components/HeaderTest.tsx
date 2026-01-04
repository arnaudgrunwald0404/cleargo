"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserAvatar } from './UserAvatar';
import { EpicSearch } from './EpicSearch';

interface HeaderTestProps {
    email?: string | null;
    role?: string | null;
    imageUrl?: string | null;
}

export function HeaderTest({ email, role, imageUrl }: HeaderTestProps) {
    const pathname = usePathname();

    // Check if user has only the OTHER role (pending access)
    const hasOnlyOtherRole = !role || role === 'OTHER';

    // Primary navigation tabs
    const primaryTabs = [
        { link: '/', label: 'Home' },
        { link: '/epics', label: 'Releases' },
        { link: '/meetings', label: 'Meetings' },
        { link: '/my-items', label: 'My Items' },
        { link: '/admin/settings', label: 'Settings' },
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
                    height: 'var(--nav-height)',
                    backgroundColor: 'var(--nav-bg)',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 'var(--z-index-ai-panel)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: `0 var(--nav-padding-x)`
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
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'var(--color-accent)',
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
                                fontFamily: 'var(--font-heading)',
                                fontSize: 'var(--font-size-xl)',
                                fontWeight: 'var(--font-weight-bold)',
                                color: 'var(--nav-text)'
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
                                                color: active ? 'var(--nav-text)' : 'var(--color-blue-200)',
                                                fontSize: 'var(--font-size-base)',
                                                fontWeight: active ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
                                                textDecoration: 'none',
                                                fontFamily: 'var(--font-body)',
                                                padding: 'var(--spacing-2) var(--spacing-3)',
                                                borderRadius: 'var(--radius-base)',
                                                backgroundColor: active ? 'var(--color-accent-bg)' : 'transparent',
                                                borderBottom: active ? `2px solid var(--color-accent)` : '2px solid transparent',
                                                transition: 'var(--transition-base)',
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

                    {/* Right side: Search and User Avatar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        {/* Epic Search */}
                        <div style={{
                            position: 'relative',
                            width: '280px'
                        }}>
                            <EpicSearch fetchEpics={true} className="header-search" />
                        </div>

                        {/* User Avatar */}
                        <UserAvatar email={email} role={role} imageUrl={imageUrl} />
                    </div>
                </div>
            </header>
        </>
    );
}

