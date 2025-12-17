'use client';

import { useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconArrowsRightLeft } from '@tabler/icons-react';
import { UserDisplay } from './UserDisplay';
import { DelegationModal, DelegationType } from './DelegationModal';

interface UserDisplayWithDelegationProps {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';

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

export function UserDisplayWithDelegation({
  email,
  firstName,
  lastName,
  avatarUrl,
  size = 'sm',
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

  return (
    <>
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <UserDisplay
          email={email}
          firstName={firstName}
          lastName={lastName}
          avatarUrl={avatarUrl}
          size={size}
        />

        {showDelegationButton && (
          <Tooltip label="Delegate this task" position="top" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setDelegationModalOpen(true);
              }}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.2s',
              }}
            >
              <IconArrowsRightLeft size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>

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
