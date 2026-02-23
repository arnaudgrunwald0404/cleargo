"use client";

import { useState, useEffect } from 'react';
import { Modal, Button, Group, Radio, Stack, Text, TextInput, Avatar, ScrollArea } from '@mantine/core';
import { PurpleLoader } from './PurpleLoader';
import { IconSearch } from '@tabler/icons-react';
import { getCachedUsers, setCachedUsers } from '@/lib/cache/usersCache';

export type DelegationType =
  | 'SINGLE_TASK'
  | 'TEMPLATE_SINGLE_TASK'
  | 'CATEGORY_EXCLUDING_GATES'
  | 'CATEGORY_INCLUDING_GATES'
  | 'RELEASE_CATEGORY_INCLUDING_GATES'
  | 'TEMPLATE_EXCLUDING_GATES'
  | 'TEMPLATE_INCLUDING_GATES'
  | 'POST_LAUNCH_OWNER';

interface DelegationModalProps {
  opened: boolean;
  onClose: () => void;
  epicId: string;
  epicName: string;
  taskId: string;
  taskLabel: string;
  category: string;
  isGate: boolean;
  currentApproverEmail: string;
  onDelegate: (delegationType: DelegationType, newApproverEmail: string) => Promise<void>;
}

interface User {
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

export function DelegationModal({
  opened,
  onClose,
  epicId,
  epicName,
  taskId,
  taskLabel,
  category,
  isGate,
  currentApproverEmail,
  onDelegate,
}: DelegationModalProps) {
  // For POST_LAUNCH_OWNER, set delegation type automatically
  const isPostLaunchOwner = category === 'Post-Launch' && taskLabel === 'Post-Launch Owner';
  const [delegationType, setDelegationType] = useState<DelegationType>(
    isPostLaunchOwner ? 'POST_LAUNCH_OWNER' : 'SINGLE_TASK'
  );
  const [newApproverEmail, setNewApproverEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [delegationCounts, setDelegationCounts] = useState<{
    singleTask: number;
    categoryExcludingGates: number;
    categoryIncludingGates: number;
    releaseCategoryIncludingGates?: number;
    releaseName?: string | null;
  } | null>(null);

  // Load users and delegation counts when modal opens
  useEffect(() => {
    if (opened) {
      const cachedUsers = getCachedUsers();
      if (cachedUsers && cachedUsers.length > 0) {
        setUsers(cachedUsers);
        setLoadingUsers(false);
        fetchUsers();
      } else {
        setLoadingUsers(true);
        fetchUsers();
      }
      if (!isPostLaunchOwner) {
        setDelegationCounts(null);
        fetch(`/api/epics/${epicId}/delegate/counts?category=${encodeURIComponent(category)}`, { credentials: 'include' })
          .then((res) => res.ok ? res.json() : null)
          .then((data) => data && setDelegationCounts({
            singleTask: data.singleTask ?? 1,
            categoryExcludingGates: data.categoryExcludingGates ?? 0,
            categoryIncludingGates: data.categoryIncludingGates ?? 0,
            releaseCategoryIncludingGates: data.releaseCategoryIncludingGates ?? 0,
            releaseName: data.releaseName ?? null,
          }))
          .catch(() => {});
      } else {
        setDelegationCounts(null);
      }
    } else {
      setSearchQuery('');
      setSelectedUser(null);
    }
  }, [opened, epicId, category, isPostLaunchOwner]);

  const fetchUsers = async () => {
    // Don't show loading if we already have users from cache
    const hadCachedUsers = users.length > 0;
    
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // API returns { users: [...] }, extract the users array
        const usersArray = Array.isArray(data) ? data : (data.users || []);
        const usersList = Array.isArray(usersArray) ? usersArray : [];
        setUsers(usersList);
        // Cache the users for future use
        setCachedUsers(usersList);
      } else {
        // If fetch fails but we have cached users, keep using them
        const cachedUsers = getCachedUsers();
        if (!cachedUsers || cachedUsers.length === 0) {
          setUsers([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      // If fetch fails but we have cached users, keep using them
      const cachedUsers = getCachedUsers();
      if (!cachedUsers || cachedUsers.length === 0) {
        setUsers([]);
      }
    } finally {
      // Only set loading to false if we weren't already showing cached users
      if (!hadCachedUsers) {
        setLoadingUsers(false);
      }
    }
  };

  const filteredUsers = Array.isArray(users)
    ? users
        .filter((user) => {
          const query = searchQuery.trim().toLowerCase();
          if (!query) return true;
          const email = (user.email || '').toLowerCase();
          const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
          const queryNorm = query.replace(/\s+/g, ' ').trim();
          return email.includes(queryNorm) || fullName.includes(queryNorm);
        })
        .sort((a, b) => (a.email || '').localeCompare(b.email || '', undefined, { sensitivity: 'base' }))
    : [];

  const handleSubmit = async () => {
    if (!selectedUser) {
      alert('Please select a user to delegate to');
      return;
    }

    // Close modal immediately (optimistic)
    const userToDelegate = selectedUser;
    const typeToDelegate = delegationType;
    onClose();
    
    setDelegationType(isPostLaunchOwner ? 'POST_LAUNCH_OWNER' : 'SINGLE_TASK');
    setSelectedUser(null);
    setSearchQuery('');
    setNewApproverEmail('');
    
    // Save in background
    (async () => {
      setSubmitting(true);
      try {
        await onDelegate(typeToDelegate, userToDelegate.email);
      } catch (error: any) {
        // Show error notification since modal is already closed
        const { notifications } = await import('@mantine/notifications');
        notifications.show({
          title: 'Delegation failed',
          message: error.message || 'Failed to delegate task',
          color: 'red',
          autoClose: 5000,
        });
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const getDelegationDescription = (type: DelegationType): string => {
    switch (type) {
      case 'SINGLE_TASK':
        return `Delegate only "${taskLabel}" for this epic`;
      case 'TEMPLATE_SINGLE_TASK':
        return `Delegate "${taskLabel}" for this criterion across this epic, this release's epics, and all future epics`;
      case 'CATEGORY_EXCLUDING_GATES':
        return `Delegate all ${category} tasks (except GATE criteria) for this epic`;
      case 'CATEGORY_INCLUDING_GATES':
        return `Delegate all ${category} tasks (including GATE criteria) for this epic`;
      case 'RELEASE_CATEGORY_INCLUDING_GATES':
        return `Delegate all ${category} tasks (including GATE criteria) for release ${delegationCounts?.releaseName ?? 'this release'}`;
      case 'TEMPLATE_EXCLUDING_GATES':
        return `Delegate all ${category} tasks (except GATE criteria) for ALL future epics`;
      case 'TEMPLATE_INCLUDING_GATES':
        return `Delegate all ${category} tasks (including GATE criteria) for ALL future epics`;
      case 'POST_LAUNCH_OWNER':
        return `Delegate Post-Launch Owner for this epic`;
      default:
        return `Delegate ${taskLabel} for this epic`;
    }
  };

  const getUserDisplayName = (user: User): string => {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return user.first_name || user.last_name || user.email;
  };

  const getInitials = (user: User): string => {
    if (user.first_name && user.last_name) {
      return `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();
    }
    return user.email.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (email: string): string => {
    const colors = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'indigo'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const stepBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: '#B87333',
    color: '#fff',
    fontWeight: 700,
    fontSize: '1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    marginRight: 10,
    flexShrink: 0,
  };

  const StepBadge = ({ n }: { n: 1 | 2 }) => (
    <span aria-hidden style={stepBadgeStyle}>{n}</span>
  );

  const scopeSection = selectedUser && (
    <Stack
      gap="md"
      style={{
        animation: 'delegateScopeSwoop 0.35s ease-out',
      }}
    >
      {delegationType !== 'POST_LAUNCH_OWNER' ? (
        <div>
          <Text size="lg" fw={600} mb="lg"><StepBadge n={2} />Scope</Text>
          <Radio.Group
            value={delegationType}
            onChange={(value) => setDelegationType(value as DelegationType)}
          >
            <Stack gap="xs">
              <Radio
                value="SINGLE_TASK"
                label={
                  <div>
                    <Text size="sm" fw={500}>
                      This task only
                      <Text component="span" size="sm" c="dimmed" ml={6}>
                        (1 item)
                      </Text>
                    </Text>
                    <Text size="xs" c="dimmed">{getDelegationDescription('SINGLE_TASK')}</Text>
                  </div>
                }
              />
              <Radio
                value="TEMPLATE_SINGLE_TASK"
                label={
                  <div>
                    <Text size="sm" fw={500}>This criterion for this, this release&apos;s, and all future epics</Text>
                    <Text size="xs" c="dimmed">{getDelegationDescription('TEMPLATE_SINGLE_TASK')}</Text>
                  </div>
                }
              />
              <Radio
                value="CATEGORY_EXCLUDING_GATES"
                label={
                  <div>
                    <Text size="sm" fw={500}>
                      All {category} tasks in this epic (excluding GATE)
                      {delegationCounts != null && (
                        <Text component="span" size="sm" c="dimmed" ml={6}>
                          ({delegationCounts.categoryExcludingGates} {delegationCounts.categoryExcludingGates === 1 ? 'item' : 'items'})
                        </Text>
                      )}
                    </Text>
                    <Text size="xs" c="dimmed">{getDelegationDescription('CATEGORY_EXCLUDING_GATES')}</Text>
                  </div>
                }
              />
              <Radio
                value="CATEGORY_INCLUDING_GATES"
                label={
                  <div>
                    <Text size="sm" fw={500}>
                      All {category} tasks in this epic (including GATE)
                      {delegationCounts != null && (
                        <Text component="span" size="sm" c="dimmed" ml={6}>
                          ({delegationCounts.categoryIncludingGates} {delegationCounts.categoryIncludingGates === 1 ? 'item' : 'items'})
                        </Text>
                      )}
                    </Text>
                    <Text size="xs" c="dimmed">{getDelegationDescription('CATEGORY_INCLUDING_GATES')}</Text>
                  </div>
                }
              />
              {delegationCounts?.releaseName != null && (
                <Radio
                  value="RELEASE_CATEGORY_INCLUDING_GATES"
                  label={
                    <div>
                      <Text size="sm" fw={500}>
                        All {category} tasks in this release (including GATE)
                        {delegationCounts != null && (
                          <Text component="span" size="sm" c="dimmed" ml={6}>
                            ({(delegationCounts.releaseCategoryIncludingGates ?? 0)} {(delegationCounts.releaseCategoryIncludingGates ?? 0) === 1 ? 'item' : 'items'})
                          </Text>
                        )}
                      </Text>
                      <Text size="xs" c="dimmed">{getDelegationDescription('RELEASE_CATEGORY_INCLUDING_GATES')}</Text>
                    </div>
                  }
                />
              )}
              <Radio
                value="TEMPLATE_EXCLUDING_GATES"
                label={
                  <div>
                    <Text size="sm" fw={500}>All future epics - {category} (excluding GATE)</Text>
                    <Text size="xs" c="dimmed">{getDelegationDescription('TEMPLATE_EXCLUDING_GATES')}</Text>
                  </div>
                }
              />
              <Radio
                value="TEMPLATE_INCLUDING_GATES"
                label={
                  <div>
                    <Text size="sm" fw={500}>All future epics - {category} (including GATE)</Text>
                    <Text size="xs" c="dimmed">{getDelegationDescription('TEMPLATE_INCLUDING_GATES')}</Text>
                  </div>
                }
              />
            </Stack>
          </Radio.Group>
        </div>
      ) : (
        <div>
          <Text size="sm" fw={600} mb="xs"><StepBadge n={2} />Scope</Text>
          <Text size="sm" c="dimmed">{getDelegationDescription('POST_LAUNCH_OWNER')}</Text>
        </div>
      )}
    </Stack>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={600} size="lg">Delegate Approval Task</Text>}
      size="lg"
    >
      <style>{`@keyframes delegateScopeSwoop { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <Stack gap="md">
        <div>
          <Text size="sm" c="dimmed" mb={4}>Current Accountable</Text>
          <Text fw={500}>{currentApproverEmail}</Text>
        </div>

        <div>
          <Text size="lg" fw={600} mb="lg"><StepBadge n={1} />Delegate to</Text>
          {!selectedUser ? (
            <>
              <TextInput
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                mb="sm"
              />
              {loadingUsers ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <PurpleLoader size="sm" />
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <ScrollArea
                    h={360}
                    type="scroll"
                    scrollbarSize={14}
                    styles={{
                      scrollbar: { backgroundColor: '#f1f1f1' },
                      thumb: {
                        backgroundColor: '#888 !important',
                        minHeight: 40,
                        '&:hover': { backgroundColor: '#555 !important' },
                      },
                    }}
                  >
                    <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '4px' }}>
                      {filteredUsers.length === 0 ? (
                        <Text size="sm" c="dimmed" ta="center" p="md">No users found</Text>
                      ) : (
                        <Stack gap={4}>
                          {filteredUsers.map(user => (
                            <div
                              key={user.email}
                              onClick={() => setSelectedUser(user)}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderRadius: '6px',
                                backgroundColor: 'transparent',
                                border: '2px solid transparent',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#fafafa';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <Group gap="xs">
                                <Avatar
                                  src={user.avatar_url || undefined}
                                  alt={user.email}
                                  radius="xl"
                                  size={32}
                                  color={getAvatarColor(user.email)}
                                >
                                  {getInitials(user)}
                                </Avatar>
                                <div>
                                  <Text size="sm" fw={500}>{getUserDisplayName(user)}</Text>
                                  <Text size="xs" c="dimmed">{user.email}</Text>
                                </div>
                              </Group>
                            </div>
                          ))}
                        </Stack>
                      )}
                    </div>
                  </ScrollArea>
                  {filteredUsers.length > 3 && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 14,
                        height: '30px',
                        background: 'linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.95))',
                        pointerEvents: 'none',
                        borderRadius: '0 0 8px 8px',
                      }}
                    />
                  )}
                </div>
              )}
            </>
          ) : (
            <Group gap="xs" mb="md">
              <Avatar
                src={selectedUser.avatar_url || undefined}
                alt={selectedUser.email}
                radius="xl"
                size={32}
                color={getAvatarColor(selectedUser.email)}
              >
                {getInitials(selectedUser)}
              </Avatar>
              <div>
                <Text size="sm" fw={500}>{getUserDisplayName(selectedUser)}</Text>
                <Text size="xs" c="dimmed">{selectedUser.email}</Text>
              </div>
              <Button variant="subtle" size="xs" onClick={() => setSelectedUser(null)}>
                Change
              </Button>
            </Group>
          )}
        </div>

        {scopeSection}
      </Stack>

      <Group justify="flex-end" mt="xl">
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          loading={submitting}
          disabled={!selectedUser}
        >
          Delegate
        </Button>
      </Group>
    </Modal>
  );
}

