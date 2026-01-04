"use client";

import React from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Badge,
  Button,
  Avatar,
} from '@mantine/core';
import { IconEdit, IconCheck, IconClock } from '@tabler/icons-react';
import type { EpicRetroWithSubmitter } from '@/lib/services/successMeasurementService';
import type { DayMarker, RetroOutcome } from '@/lib/success/types';

interface RetroListProps {
  epicId: string;
  retros: EpicRetroWithSubmitter[];
  onEdit: (dayMarker: DayMarker) => void;
  isAdmin: boolean;
  isPM: boolean;
}

export function RetroList({
  epicId,
  retros,
  onEdit,
  isAdmin,
  isPM,
}: RetroListProps) {
  const getOutcomeColor = (outcome: RetroOutcome | null): string => {
    if (!outcome) return 'gray';
    switch (outcome) {
      case 'YES':
        return 'green';
      case 'PARTIAL':
        return 'yellow';
      case 'NO':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getOutcomeLabel = (outcome: RetroOutcome | null): string => {
    if (!outcome) return 'Not Set';
    switch (outcome) {
      case 'YES':
        return 'Yes';
      case 'PARTIAL':
        return 'Partial';
      case 'NO':
        return 'No';
      default:
        return 'Not Set';
    }
  };

  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (email: string) => {
    const colors = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'indigo'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Create a map of retros by day marker
  const retroMap = new Map<DayMarker, EpicRetroWithSubmitter>();
  retros.forEach(retro => {
    retroMap.set(retro.day_marker, retro);
  });

  // Always show all three slots
  const dayMarkers: DayMarker[] = [30, 60, 90];

  return (
    <Stack gap="md">
      {dayMarkers.map((dayMarker) => {
        const retro = retroMap.get(dayMarker);
        const isSubmitted = retro?.status === 'SUBMITTED';
        const canEdit = (isAdmin || isPM) && (!isSubmitted || isAdmin);

        return (
          <Card key={dayMarker} withBorder padding="md">
            <Group justify="space-between" align="flex-start">
              <div style={{ flex: 1 }}>
                <Group gap="xs" mb="xs">
                  <Text fw={500} size="lg">
                    T+{dayMarker} Retrospective
                  </Text>
                  {isSubmitted ? (
                    <Badge leftSection={<IconCheck size={12} />} color="green">
                      Submitted
                    </Badge>
                  ) : (
                    <Badge leftSection={<IconClock size={12} />} color="gray">
                      Pending
                    </Badge>
                  )}
                </Group>

                {isSubmitted && retro ? (
                  <Stack gap="xs">
                    <div>
                      <Text size="sm" fw={500} mb="xs">
                        Outcome
                      </Text>
                      <Badge color={getOutcomeColor(retro.outcome)}>
                        {getOutcomeLabel(retro.outcome)}
                      </Badge>
                    </div>

                    {retro.blockers && retro.blockers.length > 0 && (
                      <div>
                        <Text size="sm" fw={500} mb="xs">
                          Blockers
                        </Text>
                        <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                          {retro.blockers.map((blocker, idx) => (
                            <li key={idx}>
                              <Text size="sm">{blocker}</Text>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {retro.submitter && (
                      <div>
                        <Text size="sm" fw={500} mb="xs">
                          Submitted By
                        </Text>
                        <Group gap="xs">
                          <Avatar
                            src={retro.submitter.avatar_url}
                            color={getAvatarColor(retro.submitter.email)}
                            radius="xl"
                            size="sm"
                          >
                            {getInitials(retro.submitter.email)}
                          </Avatar>
                          <Text size="sm">
                            {retro.submitter.first_name && retro.submitter.last_name
                              ? `${retro.submitter.first_name} ${retro.submitter.last_name}`
                              : retro.submitter.email}
                          </Text>
                          {retro.submitted_at && (
                            <Text size="xs" c="dimmed">
                              on {new Date(retro.submitted_at).toLocaleDateString()}
                            </Text>
                          )}
                        </Group>
                      </div>
                    )}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">
                    No retrospective submitted yet
                  </Text>
                )}
              </div>

              {canEdit && (
                <Button
                  variant="light"
                  leftSection={<IconEdit size={16} />}
                  onClick={() => onEdit(dayMarker)}
                >
                  {retro ? 'Edit' : 'Create'}
                </Button>
              )}
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}

