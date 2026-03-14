"use client";

import { Avatar, Menu, Text, Group, UnstyledButton, rem } from '@mantine/core';
import { IconLogout, IconPlug, IconSettings, IconShieldCheck, IconUser, IconUsers } from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { canRolesPerform } from '@/lib/permissions';
import type { CapabilityId } from '@/lib/permissions';

interface UserAvatarProps {
    email?: string | null;
    role?: string | null;
    imageUrl?: string | null;
}

export function UserAvatar({ email, role, imageUrl }: UserAvatarProps) {
    const router = useRouter();
    const supabase = createClient();
    const [userEmail, setUserEmail] = useState<string | null>(email || null);
    const [userRole, setUserRole] = useState<string | null>(role || null);
    const [hasSettingsAccess, setHasSettingsAccess] = useState(false);

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
        <Menu shadow="md" width={260} position="bottom-end">
            <Menu.Target>
                <UnstyledButton>
                    <Group gap={7}>
                        <Avatar
                            src={imageUrl}
                            alt={userEmail}
                            radius="xl"
                            size={32}
                            color={getColor(userEmail)}
                        >
                            {getInitials(userEmail)}
                        </Avatar>
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

                {hasSettingsAccess && (
                    <Menu.Item
                        leftSection={<IconSettings style={{ width: rem(14), height: rem(14) }} />}
                        onClick={() => router.push('/admin/settings')}
                    >
                        Settings
                    </Menu.Item>
                )}

                {hasSettingsAccess && (
                    <>
                        <Menu.Divider />
                        <Menu.Label>Admin</Menu.Label>
                        <Menu.Item
                            leftSection={<IconUsers style={{ width: rem(14), height: rem(14) }} />}
                            onClick={() => router.push('/admin/settings/users/users')}
                        >
                            User Management
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<IconShieldCheck style={{ width: rem(14), height: rem(14) }} />}
                            onClick={() => router.push('/admin/settings/permissions')}
                        >
                            Permissions
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<IconPlug style={{ width: rem(14), height: rem(14) }} />}
                            onClick={() => router.push('/admin/settings/integrations/aha')}
                        >
                            Integrations
                        </Menu.Item>
                    </>
                )}

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
