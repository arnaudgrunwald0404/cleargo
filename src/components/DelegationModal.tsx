"use client";

import { useState, useEffect } from 'react';
import { Modal, Button, Group, Radio, Stack, Text, Loader, TextInput, Avatar } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';

export type DelegationType =
  | 'SINGLE_TASK'
  | 'CATEGORY_EXCLUDING_GATES'
  | 'CATEGORY_INCLUDING_GATES'
  | 'TEMPLATE_EXCLUDING_GATES'
  | 'TEMPLATE_INCLUDING_GATES';

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
  const [delegationType, setDelegationType] = useState<DelegationType>('SINGLE_TASK');
  const [newApproverEmail, setNewApproverEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Fetch users when modal opens
  useEffect(() => {
    if (opened) {
      fetchUsers();
    }
  }, [opened]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      fullName.includes(query)
    );
  });

  const handleSubmit = async () => {
    if (!selectedUser) {
      alert('Please select a user to delegate to');
      return;
    }

    setSubmitting(true);
    try {
      await onDelegate(delegationType, selectedUser.email);
      onClose();
      // Reset state
      setDelegationType('SINGLE_TASK');
      setSelectedUser(null);
      setSearchQuery('');
      setNewApproverEmail('');
    } catch (error: any) {
      alert(`Failed to delegate: ${error.message || error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getDelegationDescription = (type: DelegationType): string => {
    switch (type) {
      case 'SINGLE_TASK':
        return `Delegate only "${taskLabel}" for this epic`;
      case 'CATEGORY_EXCLUDING_GATES':
        return `Delegate all ${category} tasks (except GATE criteria) for this epic`;
      case 'CATEGORY_INCLUDING_GATES':
        return `Delegate all ${category} tasks (including GATE criteria) for this epic`;
      case 'TEMPLATE_EXCLUDING_GATES':
        return `Delegate all ${category} tasks (except GATE criteria) for ALL future epics`;
      case 'TEMPLATE_INCLUDING_GATES':
        return `Delegate all ${category} tasks (including GATE criteria) for ALL future epics`;
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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={600} size="lg">Delegate Approval Task</Text>}
      size="lg"
    >
      <Stack gap="md">
        <div>
          <Text size="sm" c="dimmed" mb={4}>Epic</Text>
          <Text fw={500}>{epicName}</Text>
        </div>

        <div>
          <Text size="sm" c="dimmed" mb={4}>Current Approver</Text>
          <Text fw={500}>{currentApproverEmail}</Text>
        </div>

        <div>
          <Text size="sm" fw={600} mb="xs">Delegation Scope</Text>
          <Radio.Group
            value={delegationType}
            onChange={(value) => setDelegationType(value as DelegationType)}
          >
            <Stack gap="xs">
              <Radio
                value="SINGLE_TASK"
                label={
                  <div>
                    <Text size="sm" fw={500}>This task only</Text>
                    <Text size="xs" c="dimmed">{getDelegationDescription('SINGLE_TASK')}</Text>
                  </div>
                }
              />
              <Radio
                value="CATEGORY_EXCLUDING_GATES"
                label={
                  <div>
                    <Text size="sm" fw={500}>All {category} tasks in this epic (excluding GATE)</Text>
                    <Text size="xs" c="dimmed">{getDelegationDescription('CATEGORY_EXCLUDING_GATES')}</Text>
                  </div>
                }
              />
              <Radio
                value="CATEGORY_INCLUDING_GATES"
                label={
                  <div>
                    <Text size="sm" fw={500}>All {category} tasks in this epic (including GATE)</Text>
                    <Text size="xs" c="dimmed">{getDelegationDescription('CATEGORY_INCLUDING_GATES')}</Text>
                  </div>
                }
              />
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

        <div>
          <Text size="sm" fw={600} mb="xs">Delegate To</Text>
          <TextInput
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            mb="sm"
          />

          {loadingUsers ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Loader size="sm" />
            </div>
          ) : (
            <div style={{ 
              maxHeight: '200px', 
              overflowY: 'auto', 
              border: '1px solid #e0e0e0', 
              borderRadius: '8px',
              padding: '4px'
            }}>
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
                        backgroundColor: selectedUser?.email === user.email ? '#f0f0ff' : 'transparent',
                        border: selectedUser?.email === user.email ? '2px solid #6366F1' : '2px solid transparent',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedUser?.email !== user.email) {
                          e.currentTarget.style.backgroundColor = '#fafafa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedUser?.email !== user.email) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
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
          )}
        </div>

        <Group justify="flex-end" mt="md">
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
      </Stack>
    </Modal>
  );
}

