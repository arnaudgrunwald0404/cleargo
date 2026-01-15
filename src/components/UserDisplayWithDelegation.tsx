"use client";

import { useState } from 'react';
import { ActionIcon, Tooltip, Avatar, Group, Text } from '@mantine/core';
import { IconCalendarClock } from '@tabler/icons-react';
import { DelegationModal, DelegationType } from './DelegationModal';

interface UserDisplayWithDelegationProps {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  
  // Delegation props
  epicId: string;
  epicName: string;
  taskId: string;
  taskLabel: string;
  category: string;
  isGate: boolean;
  currentUserEmail: string; // The logged-in user's email
  showDelegationButton?: boolean; // Only show if current user is the approver
  onDelegationComplete?: () => void; // Callback after successful delegation
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

export function UserDisplayWithDelegation({
  email,
  firstName,
  lastName,
  avatarUrl,
  size = "sm",
  epicId,
  epicName,
  taskId,
  taskLabel,
  category,
  isGate,
  currentUserEmail,
  showDelegationButton = false,
  onDelegationComplete,
}: UserDisplayWithDelegationProps) {
  const [delegationModalOpen, setDelegationModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleDelegate = async (delegationType: DelegationType, newApproverEmail: string) => {
    try {
      const res = await fetch(`/api/epics/${epicId}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          delegationType,
          newApproverEmail,
          taskId,
          category,
          isGate,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delegate');
      }

      // Call completion callback to refresh data
      if (onDelegationComplete) {
        onDelegationComplete();
      }
    } catch (error) {
      console.error('Delegation error:', error);
      throw error;
    }
  };

  if (!email) {
    return <Text size={size} c="dimmed">Unknown</Text>;
  }

  const displayName = (firstName && lastName ? `${firstName} ${lastName}`.trim() : firstName || lastName || email);
  const avatarSize = size === "xs" ? 20 : size === "sm" ? 24 : size === "md" ? 32 : size === "lg" ? 40 : 48;
  const iconSize = avatarSize * 0.6; // Icon should be about 60% of avatar size

  return (
    <>
      <Group 
        gap="xs"
        style={{ 
          position: 'relative',
          display: 'inline-flex',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <Avatar
            src={avatarUrl || undefined}
            alt={email}
            radius="xl"
            size={avatarSize}
            color={getAvatarColor(email)}
            style={{
              opacity: isHovered && showDelegationButton ? 0 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {getInitials(email, firstName, lastName)}
          </Avatar>
          
          {showDelegationButton && (
            <Tooltip label="Reschedule" position="top" withArrow>
              <ActionIcon
                variant="filled"
                color="gray"
                radius="xl"
                size={avatarSize}
                onClick={(e) => {
                  e.stopPropagation();
                  setDelegationModalOpen(true);
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.2s',
                  pointerEvents: isHovered ? 'auto' : 'none',
                  cursor: 'pointer',
                }}
              >
                <IconCalendarClock size={iconSize} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
        
        <div>
          <Text size={size} fw={500}>
            {displayName}
          </Text>
        </div>
      </Group>

      <DelegationModal
        opened={delegationModalOpen}
        onClose={() => setDelegationModalOpen(false)}
        epicId={epicId}
        epicName={epicName}
        taskId={taskId}
        taskLabel={taskLabel}
        category={category}
        isGate={isGate}
        currentApproverEmail={email || ''}
        onDelegate={handleDelegate}
      />
    </>
  );
}

