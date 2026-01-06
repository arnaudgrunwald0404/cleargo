"use client";

import { Avatar, Menu, Text, Group, UnstyledButton, rem } from '@mantine/core';
import { IconLogout, IconSettings, IconUser } from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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

    useEffect(() => {
        if (!email) {
            const getUser = async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (user?.email) {
                    setUserEmail(user.email);
                    // In a real app we might fetch the role here too if not provided
                }
            };
            getUser();
        }
    }, [email, supabase]);


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
