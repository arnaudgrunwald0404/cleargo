"use client";
import { Avatar, Text, Group } from "@mantine/core";

interface UserDisplayProps {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    name?: string | null; // Fallback if firstName/lastName not available
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    showEmail?: boolean; // Show email as secondary text
}

const getInitials = (email: string, firstName?: string | null, lastName?: string | null): string => {
    if (firstName && lastName) {
        return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    if (firstName) {
        return firstName.substring(0, 2).toUpperCase();
    }
    if (lastName) {
        return lastName.substring(0, 2).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
};

const getAvatarColor = (email: string): string => {
    const colors = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'indigo'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
        hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

export function UserDisplay({ 
    email, 
    firstName, 
    lastName, 
    avatarUrl, 
    name,
    size = "sm",
    showEmail = false 
}: UserDisplayProps) {
    if (!email) {
        return <Text size={size} c="dimmed">Unknown</Text>;
    }

    const displayName = name || (firstName && lastName ? `${firstName} ${lastName}`.trim() : firstName || lastName || email);
    const avatarSize = size === "xs" ? 20 : size === "sm" ? 24 : size === "md" ? 32 : size === "lg" ? 40 : 48;

    return (
        <Group gap="xs">
            <Avatar
                src={avatarUrl || undefined}
                alt={email}
                radius="xl"
                size={avatarSize}
                color={getAvatarColor(email)}
            >
                {getInitials(email, firstName, lastName)}
            </Avatar>
            <div>
                <Text size={size} fw={500}>
                    {displayName}
                </Text>
                {showEmail && displayName !== email && (
                    <Text size="xs" c="dimmed">
                        {email}
                    </Text>
                )}
            </div>
        </Group>
    );
}


