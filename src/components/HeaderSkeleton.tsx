"use client";

import { useMediaQuery } from '@mantine/hooks';

const MOBILE_BREAKPOINT = '(max-width: 768px)';

export function HeaderSkeleton() {
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

    return (
        <>
            {/* Top Navigation Bar Skeleton - Cast Iron background */}
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
                    {/* Left side: Logo and Navigation Tabs skeleton */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '32px' }}>
                        {/* Logo skeleton */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            {/* Logo icon skeleton */}
                            <div 
                                className="bg-gray-400 rounded animate-pulse"
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: 'var(--radius-md, 8px)',
                                    opacity: 0.6
                                }}
                            />
                            {/* Logo text skeleton */}
                            <div 
                                className="bg-gray-400 rounded animate-pulse"
                                style={{
                                    width: '100px',
                                    height: '20px',
                                    opacity: 0.6
                                }}
                            />
                        </div>

                        {/* Navigation tabs skeleton (desktop) or burger menu skeleton (mobile) */}
                        {isMobile ? (
                            /* Mobile: Burger menu skeleton */
                            <div 
                                className="bg-gray-400 rounded animate-pulse"
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    opacity: 0.6
                                }}
                            />
                        ) : (
                            /* Desktop: Navigation tabs skeleton */
                            <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '100%' }}>
                                {[70, 80, 70, 80, 70].map((width, index) => (
                                    <div
                                        key={index}
                                        className="bg-gray-400 rounded animate-pulse"
                                        style={{
                                            width: `${width}px`,
                                            height: '32px',
                                            opacity: 0.6,
                                            borderRadius: 'var(--radius-base, 6px)'
                                        }}
                                    />
                                ))}
                            </nav>
                        )}
                    </div>

                    {/* Right side: Search (desktop only) and User Avatar skeleton */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        {!isMobile && (
                            /* Desktop: Search bar skeleton */
                            <div 
                                className="bg-gray-400 rounded animate-pulse"
                                style={{
                                    width: '280px',
                                    height: '36px',
                                    opacity: 0.6,
                                    borderRadius: 'var(--radius-base, 6px)'
                                }}
                            />
                        )}
                        {/* User Avatar skeleton */}
                        <div 
                            className="bg-gray-400 rounded-full animate-pulse"
                            style={{
                                width: '32px',
                                height: '32px',
                                opacity: 0.6
                            }}
                        />
                    </div>
                </div>
            </header>
        </>
    );
}
