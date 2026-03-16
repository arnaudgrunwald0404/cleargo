"use client";

import { Avatar, Menu, Text, Group, UnstyledButton, rem } from '@mantine/core';
import { IconLogout, IconUser } from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface UserAvatarProps {
    email?: string | null;
    role?: string | null;
    imageUrl?: string | null;
    displayName?: string | null;
    collapsed?: boolean;
}

export function UserAvatar({ email, role, imageUrl, displayName, collapsed }: UserAvatarProps) {
    const router = useRouter();
    const supabase = createClient();
    const [userEmail, setUserEmail] = useState<string | null>(email || null);
    const [userRole, setUserRole] = useState<string | null>(role || null);


    useEffect(() => {
        const fetchUserData = async () => {
            if (!email) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user?.email) {
                    setUserEmail(user.email);
                }
            }

            // Fetch user roles and check settings access
            try {
                const { fetchWithRateLimit } = await import('@/lib/fetch-with-rate-limit');
                const res = await fetchWithRateLimit('/api/me', { credentials: 'include', maxRetries: 1 });
                if (res.ok) {
                    const data = await res.json();
                    const roles = Array.isArray(data.user?.roles) 
                        ? data.user.roles 
                        : (data.user?.role ? [data.user.role] : []);
                    
                    // Always update role from API response (API is source of truth)
                    if (roles.length > 0) {
                        setUserRole(roles[0]);
                    } else if (data.user?.role) {
                        setUserRole(data.user.role);
                    }

                }
            } catch (error) {
                console.error('Failed to fetch user roles:', error);
            }
        };

        fetchUserData();
    }, [email, supabase, role]);


    const handleSignOut = async () => {
        try {
            await fetch('/auth/signout', { method: 'POST', credentials: 'include' });
        } finally {
            router.push('/login');
        }
    };

    const getInitials = (email: string) => {
        return email.substring(0, 2).toUpperCase();
    };

    // Simple random color generator based on email string
    const getColor = (email: string) => {
        const colors = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'indigo'];
        let hash = 0;
        for (let i = 0; i < email.length; i++) {
            hash = email.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    if (!userEmail) return null;

    return (
        <Menu shadow="md" width={260} position="right-end" zIndex={2000}>
            <Menu.Target>
                <UnstyledButton style={{ width: '100%' }}>
                    <Group gap={12} wrap="nowrap">
                        <Avatar
                            src={imageUrl}
                            alt={userEmail}
                            radius="xl"
                            size={32}
                            color={getColor(userEmail)}
                            style={{ flexShrink: 0 }}
                        >
                            {getInitials(userEmail)}
                        </Avatar>
                        {!collapsed && displayName && (
                            <span style={{
                                color: 'rgba(255,255,255,0.6)',
                                fontSize: 13,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                fontFamily: 'var(--font-body)',
                            }}>
                                {displayName}
                            </span>
                        )}
                    </Group>
                </UnstyledButton>
            </Menu.Target>

            <Menu.Dropdown>
                <div className="px-3 py-2 border-b border-gray-100 mb-1">
                    <Text size="sm" fw={500} className="truncate">{userEmail}</Text>
                    {userRole && (
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt={2}>
                            {userRole}
                        </Text>
                    )}
                </div>

                <Menu.Label>Account</Menu.Label>
                <Menu.Item
                    leftSection={<IconUser style={{ width: rem(14), height: rem(14) }} />}
                    onClick={() => router.push('/account')}
                >
                    Account Details
                </Menu.Item>

                <Menu.Divider />

                <Menu.Item
                    color="red"
                    leftSection={<IconLogout style={{ width: rem(14), height: rem(14) }} />}
                    onClick={handleSignOut}
                >
                    Sign out
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}
