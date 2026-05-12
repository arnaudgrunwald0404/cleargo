"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconHome,
  IconLayoutGrid,
  IconRocket,
  IconMessageCircle,
  IconChartBar,
  IconMessageReport,
  IconCalendarEvent,
  IconSettings,
  IconChevronsLeft,
  IconChevronsRight,
  IconSearch,
  IconTool,
  IconTag,
  IconClipboardList,
  IconListCheck,
  IconRoute,
} from '@tabler/icons-react';
import { UserAvatar } from './UserAvatar';
import { EpicSearch } from './EpicSearch';
import { canRolesPerform } from '@/lib/permissions';
import type { CapabilityId } from '@/lib/permissions';
import { isEnabled, FEATURE_MEETINGS, FEATURE_ROADMAP_REWIND } from '@/lib/flags';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';

const MOBILE_BREAKPOINT = '(max-width: 768px)';

interface SidebarProps {
  email?: string | null;
  role?: string | null;
  imageUrl?: string | null;
}

interface NavItem {
  link: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; stroke?: number | string }>;
  badge?: number;
}

export function Sidebar({ email, role, imageUrl }: SidebarProps) {
  const pathname = usePathname();
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const { flags: featureFlags } = useFeatureFlags();
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [hasSettingsAccess, setHasSettingsAccess] = useState(false);
  const [hasMeetingsAccess, setHasMeetingsAccess] = useState(false);
  const [hasAnalyticsAccess, setHasAnalyticsAccess] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [unreadCommentCount, setUnreadCommentCount] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const unreadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync collapsed state to body for CSS
  useEffect(() => {
    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
      document.documentElement.style.setProperty('--sidebar-width', '68px');
    } else {
      document.body.classList.remove('sidebar-collapsed');
      document.documentElement.style.setProperty('--sidebar-width', '240px');
    }
  }, [collapsed]);

  // Fetch user roles and check access
  useEffect(() => {
    const fetchUserRoles = async () => {
      try {
        const res = await fetchWithRateLimit('/api/me', { credentials: 'include', maxRetries: 1 });
        if (res.ok) {
          const data = await res.json();
          const roles = Array.isArray(data.user?.roles)
            ? data.user.roles
            : (data.user?.role ? [data.user.role] : []);
          setUserRoles(roles);

          const settingsCapabilities: CapabilityId[] = [
            'settings.read',
            'settings.emailTemplates.read',
            'settings.ahaFields.read',
            'settings.webhookUrl.read',
          ];
          setHasSettingsAccess(settingsCapabilities.some(cap => canRolesPerform(roles, cap)));
          setHasMeetingsAccess(isEnabled(FEATURE_MEETINGS, featureFlags) && canRolesPerform(roles, 'meetings.read'));
          setHasAnalyticsAccess(canRolesPerform(roles, 'analytics.read'));

          // Get display name (first + last)
          const profile = data.user;
          const firstName = profile?.first_name || '';
          const lastName = profile?.last_name || '';
          const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
          if (fullName) setDisplayName(fullName);
          else if (profile?.name) setDisplayName(profile.name);
        }
      } catch (error) {
        console.error('Failed to fetch user roles:', error);
      }
    };
    fetchUserRoles();
  }, [featureFlags]);

  // Fetch unread comment count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const res = await fetchWithRateLimit('/api/comments/all?myEpicsOnly=true&unread=true', { credentials: 'include', maxRetries: 1 });
        if (res.status === 401) {
          if (unreadIntervalRef.current) {
            clearInterval(unreadIntervalRef.current);
            unreadIntervalRef.current = null;
          }
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setUnreadCommentCount(data.unread_count ?? 0);
        }
      } catch { /* silently ignore */ }
    };
    fetchUnreadCount();
    unreadIntervalRef.current = setInterval(fetchUnreadCount, 60_000);
    return () => {
      if (unreadIntervalRef.current) {
        clearInterval(unreadIntervalRef.current);
        unreadIntervalRef.current = null;
      }
    };
  }, []);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (pathname?.includes('/setup-password')) {
    return null;
  }

  // Top-level items (not in any section)
  const homeItem: NavItem = { link: '/', label: 'Home', icon: IconHome };
  const roadmapSnapshotItem: NavItem | null = isEnabled(FEATURE_ROADMAP_REWIND, featureFlags)
    ? { link: '/portfolio/snapshot', label: 'Roadmap Snapshot', icon: IconRoute }
    : null;

  // Releases section (visible to all)
  const releaseTabs: NavItem[] = [
    { link: '/portfolio', label: 'Portfolio', icon: IconLayoutGrid },
    { link: '/epics', label: 'Releases', icon: IconClipboardList },
    { link: '/releases/comments', label: 'Comments', icon: IconMessageCircle, badge: unreadCommentCount > 0 ? unreadCommentCount : undefined },
  ];

  const canSeeLaunches = canRolesPerform(userRoles, 'launches.view');
  const launchTabs: NavItem[] = [
    { link: '/gtm-launches', label: 'Planning', icon: IconListCheck },
    { link: '/gtm-launches/comments', label: 'Comments', icon: IconMessageCircle },
  ];

  // Common items shown below both sections
  const commonTabs: NavItem[] = [
    ...(hasAnalyticsAccess ? [{ link: '/analytics', label: 'Analytics', icon: IconChartBar }] : []),
    { link: '/feedback', label: 'Feedback', icon: IconMessageReport },
    ...(hasMeetingsAccess ? [{ link: '/meetings', label: 'Meetings', icon: IconCalendarEvent }] : []),
  ];

  const settingsItem: NavItem | null = hasSettingsAccess
    ? { link: '/admin/settings', label: 'Settings', icon: IconSettings }
    : null;

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname?.startsWith(path)) return true;
    return false;
  };

  const sidebarWidth = collapsed ? 68 : 240;

  // Mobile: thin top bar (brand + hamburger) + overlay sidebar
  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 'var(--mobile-topbar-height, 56px)',
            zIndex: 1001,
            backgroundColor: 'var(--color-cast-iron)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}
            aria-label="Open navigation"
          >
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
          <Link
            href="/"
            prefetch={false}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: 'white',
            }}
          >
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm, 4px)',
              backgroundColor: 'var(--color-copper)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span style={{
              fontFamily: 'var(--font-marcellus, serif)',
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.01em',
            }}>
              ClearGO
            </span>
          </Link>
        </div>

        {/* Overlay */}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
              zIndex: 1001,
            }}
          />
        )}

        {/* Slide-out sidebar */}
        <aside
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: 280,
            backgroundColor: 'var(--color-cast-iron)',
            zIndex: 1002,
            transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {renderSidebarContent(false)}
        </aside>
      </>
    );
  }

  // Desktop: fixed sidebar with straddling toggle button
  return (
    <>
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: sidebarWidth,
          backgroundColor: 'var(--color-cast-iron)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {renderSidebarContent(collapsed)}
      </aside>

      {/* Straddling toggle button — sits at top of sidebar, half in / half out */}
      <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} position="right" withArrow>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            position: 'fixed',
            top: 20,
            left: sidebarWidth - 14,
            zIndex: 1001,
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '2px solid var(--color-platinum)',
            backgroundColor: 'var(--color-cast-iron)',
            color: 'var(--color-platinum)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'left 0.2s ease, background-color 0.15s ease',
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-copper)';
            e.currentTarget.style.color = 'white';
            e.currentTarget.style.borderColor = 'var(--color-copper)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-cast-iron)';
            e.currentTarget.style.color = 'var(--color-platinum)';
            e.currentTarget.style.borderColor = 'var(--color-platinum)';
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <IconChevronsRight size={14} stroke={2} /> : <IconChevronsLeft size={14} stroke={2} />}
        </button>
      </Tooltip>
    </>
  );

  function renderSectionLabel(label: string, isCollapsed: boolean, Icon?: React.ComponentType<{ size?: number | string; stroke?: number | string }>, settingsHref?: string) {
    if (isCollapsed) {
      // Show a small decorative icon (not clickable) with a divider line
      return (
        <Tooltip label={label} position="right" withArrow withinPortal>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 0 4px',
            color: 'rgba(255,255,255,0.25)',
            cursor: 'default',
          }}>
            {Icon ? <Icon size={16} stroke={1.5} /> : (
              <div style={{
                height: 1,
                width: '60%',
                backgroundColor: 'rgba(255,255,255,0.08)',
              }} />
            )}
          </div>
        </Tooltip>
      );
    }
    return (
      <div style={{
        padding: '12px 12px 4px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'rgba(255,255,255,0.35)',
        fontFamily: 'var(--font-body)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {Icon && <Icon size={14} stroke={1.5} />}
        {label}
        {settingsHref && (
          <Tooltip label={`${label} settings`} position="right" withArrow withinPortal>
            <Link
              href={settingsHref}
              prefetch={false}
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                color: 'rgba(255,255,255,0.25)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)'; }}
            >
              <IconSettings size={13} stroke={1.5} />
            </Link>
          </Tooltip>
        )}
      </div>
    );
  }

  function renderNavItem(tab: NavItem, isCollapsed: boolean) {
    const active = isActive(tab.link);
    const Icon = tab.icon;
    const linkContent = (
      <Link
        key={tab.link}
        href={tab.link}
        prefetch={false}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: isCollapsed ? '10px 0' : '10px 12px',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          borderRadius: 'var(--radius-md)',
          backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
          color: active ? 'white' : 'rgba(255,255,255,0.55)',
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: active ? 600 : 400,
          fontFamily: 'var(--font-body)',
          transition: 'all 0.15s ease',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
          }
        }}
      >
        <Icon size={20} stroke={1.5} />
        {!isCollapsed && (
          <>
            <span style={{ flex: 1 }}>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <Badge
                size="xs"
                variant="filled"
                style={{
                  backgroundColor: 'var(--color-copper)',
                  color: 'white',
                  minWidth: 20,
                  height: 18,
                  fontSize: 11,
                }}
              >
                {tab.badge > 99 ? '99+' : tab.badge}
              </Badge>
            )}
          </>
        )}
        {isCollapsed && tab.badge !== undefined && tab.badge > 0 && (
          <div style={{
            position: 'absolute',
            top: 6,
            right: 10,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: 'var(--color-copper)',
          }} />
        )}
      </Link>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={tab.link} label={tab.label} position="right" withArrow>
          {linkContent}
        </Tooltip>
      );
    }
    return linkContent;
  }

  function renderSidebarContent(isCollapsed: boolean) {
    return (
      <>
        {/* Logo */}
        <div style={{
          padding: isCollapsed ? '20px 0' : '20px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          minHeight: 64,
        }}>
          <Link
            href="/"
            prefetch={false}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-copper)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            {!isCollapsed && (
              <span style={{
                fontFamily: 'var(--font-marcellus, serif)',
                fontSize: 20,
                fontWeight: 700,
                color: 'white',
                whiteSpace: 'nowrap',
              }}>
                ClearGO
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav style={{
          flex: 1,
          padding: isCollapsed ? '12px 8px' : '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
        }}>
          {/* Search — click to expand into text input */}
          {searchOpen && !isCollapsed ? (
            <div style={{ padding: '0 0 4px', position: 'relative' }}>
              <EpicSearch
                fetchEpics={true}
                className="header-search"
                autoFocus
                onBlur={() => setSearchOpen(false)}
              />
            </div>
          ) : (
            (() => {
              const searchItem: NavItem = { link: '#', label: 'Search', icon: IconSearch };
              const searchLink = (
                <button
                  key="search"
                  onClick={() => {
                    if (isCollapsed) {
                      setCollapsed(false);
                    }
                    setSearchOpen(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: isCollapsed ? '10px 0' : '10px 12px',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'transparent',
                    color: 'rgba(255,255,255,0.55)',
                    border: 'none',
                    width: '100%',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 400,
                    fontFamily: 'var(--font-body)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                  }}
                >
                  <IconSearch size={20} stroke={1.5} />
                  {!isCollapsed && <span>Search</span>}
                </button>
              );

              if (isCollapsed) {
                return (
                  <Tooltip key="search" label="Search" position="right" withArrow>
                    {searchLink}
                  </Tooltip>
                );
              }
              return searchLink;
            })()
          )}

          {/* Home + Roadmap Snapshot (top-level, no section) */}
          {renderNavItem(homeItem, isCollapsed)}
          {roadmapSnapshotItem ? renderNavItem(roadmapSnapshotItem, isCollapsed) : null}

          {/* GTM Releases (section) */}
          <div style={{ height: '10px' }} />
          {renderSectionLabel('GTM Releases', isCollapsed, IconTag)}
          {releaseTabs.map((tab) => renderNavItem(tab, isCollapsed))}

          {/* Launches section (admins & PMMs only) */}
          {canSeeLaunches && (
            <>
              <div style={{ height: '10px' }} />
              {renderSectionLabel('GTM Launches', isCollapsed, IconRocket)}
              {launchTabs.map((tab) => renderNavItem(tab, isCollapsed))}
            </>
          )}

          {/* Tools section */}
          <div style={{ height: '10px' }} />
          {renderSectionLabel('Tools', isCollapsed, IconTool)}
          {[...commonTabs, ...(settingsItem ? [settingsItem] : [])].map((tab) => renderNavItem(tab, isCollapsed))}

        </nav>

        {/* Bottom section: User */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: isCollapsed ? '12px 8px' : '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>

          {/* User avatar row */}
          <div style={{
            padding: isCollapsed ? '10px 0' : '10px 12px',
            display: 'flex',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
          }}>
            <UserAvatar
              email={email}
              role={role}
              imageUrl={imageUrl}
              displayName={displayName || email?.split('@')[0] || ''}
              collapsed={isCollapsed}
            />
          </div>

        </div>
      </>
    );
  }
}
