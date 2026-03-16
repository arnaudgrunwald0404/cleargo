// @ts-nocheck — admin test page; Mantine 8 type compat issues
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Container,
  Title,
  Text,
  Paper,
  Table,
  Badge,
  Group,
  Stack,
  NumberInput,
  Divider,
  Alert,
  Loader,
  Center,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconCalendar, IconInfoCircle, IconArrowRight } from "@tabler/icons-react";
import { fetchWithRateLimit } from "@/lib/fetch-with-rate-limit";

interface CriterionTemplate {
  id: string;
  label: string;
  phase: string | null;
  default_due_offset_days: number | null;
  default_owner_email: string | null;
  gate: boolean;
  sort_order: number;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

export default function DateCalculatorPage() {
  const [criteria, setCriteria] = useState<CriterionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchDate, setLaunchDate] = useState<Date | null>(
    // Default to 30 days from now
    addDays(new Date(), 30)
  );
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});

  useEffect(() => {
    fetchWithRateLimit("/api/launch-criteria", { maxRetries: 1 })
      .then((r) => r.json())
      .then((d) => {
        setCriteria(d.criteria || []);
      })
      .catch((e) => console.error("Failed to load launch criteria:", e))
      .finally(() => setLoading(false));
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Group criteria by phase
  const phases = useMemo(() => {
    const map = new Map<string, CriterionTemplate[]>();
    for (const c of criteria) {
      const phase = c.phase || "Unassigned";
      if (!map.has(phase)) map.set(phase, []);
      map.get(phase)!.push(c);
    }
    // Sort within each phase by sort_order
    for (const items of map.values()) {
      items.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [criteria]);

  const getEffectiveOffset = (c: CriterionTemplate): number | null => {
    if (overrides[c.id] !== undefined) return overrides[c.id];
    return c.default_due_offset_days;
  };

  const getCalculatedDate = (c: CriterionTemplate): Date | null => {
    if (!launchDate) return null;
    const offset = getEffectiveOffset(c);
    if (offset == null) return null;
    return addDays(launchDate, -offset);
  };

  const getDueDateColor = (dueDate: Date | null): string => {
    if (!dueDate) return "gray";
    const daysUntilDue = daysBetween(today, dueDate);
    if (daysUntilDue < 0) return "red"; // overdue
    if (daysUntilDue <= 7) return "orange"; // due soon
    if (daysUntilDue <= 14) return "yellow";
    return "green";
  };

  if (loading) {
    return (
      <Center h={400}>
        <Loader />
      </Center>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>Launch Date Calculator</Title>
          <Text c="dimmed" size="sm">
            Preview how due dates are calculated from the launch date and each
            criterion&apos;s offset. The offset (days before launch) is subtracted
            from the launch date to produce each task&apos;s due date.
          </Text>
        </div>

        <Paper p="md" withBorder>
          <Group align="flex-end" gap="xl">
            <DateInput
              label="Target Launch Date"
              description="Set a hypothetical launch date to preview calculated due dates"
              value={launchDate}
              onChange={(val) => setLaunchDate(val as Date | null)}
              leftSection={<IconCalendar size={16} />}
              w={280}
              clearable
            />
            {launchDate && (
              <Text size="sm" c="dimmed" pb={4}>
                {formatDate(launchDate)} &mdash;{" "}
                {daysBetween(today, launchDate)} days from today
              </Text>
            )}
          </Group>
        </Paper>

        {criteria.length === 0 && (
          <Alert icon={<IconInfoCircle size={16} />} color="blue">
            No launch criteria templates found. Create some in Settings &rarr;
            Launch Criteria first.
          </Alert>
        )}

        <Alert icon={<IconInfoCircle size={16} />} color="gray" variant="light">
          <Text size="sm">
            <strong>Formula:</strong> Due Date = Launch Date &minus; Offset Days.
            Example: Launch Date Mar 30 with offset 14 &rarr; Due Date = Mar 16.
            Override any offset in the table below to see how it affects the
            calculated date.
          </Text>
        </Alert>

        {Array.from(phases.entries()).map(([phase, items]) => (
          <Paper key={phase} withBorder>
            <Group px="md" pt="sm" pb="xs">
              <Badge variant="light" color="indigo" size="lg">
                {phase}
              </Badge>
              <Text size="xs" c="dimmed">
                {items.length} task{items.length !== 1 ? "s" : ""}
              </Text>
            </Group>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Task</Table.Th>
                  <Table.Th w={100}>Gate?</Table.Th>
                  <Table.Th w={160}>Default Offset</Table.Th>
                  <Table.Th w={140}>Override Offset</Table.Th>
                  <Table.Th w={40} />
                  <Table.Th w={200}>Calculated Due Date</Table.Th>
                  <Table.Th w={120}>Days Until Due</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((c) => {
                  const calculatedDate = getCalculatedDate(c);
                  const effectiveOffset = getEffectiveOffset(c);
                  const daysUntil = calculatedDate
                    ? daysBetween(today, calculatedDate)
                    : null;
                  const color = getDueDateColor(calculatedDate);

                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        <Text fw={500} size="sm">
                          {c.label}
                        </Text>
                        {c.default_owner_email && (
                          <Text size="xs" c="dimmed">
                            Owner: {c.default_owner_email}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {c.gate && (
                          <Badge color="red" size="xs" variant="light">
                            GATE
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {c.default_due_offset_days != null ? (
                          <Text size="sm">
                            {c.default_due_offset_days} days before
                          </Text>
                        ) : (
                          <Text size="sm" c="dimmed" fs="italic">
                            Not set
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs"
                          placeholder="Override"
                          value={
                            overrides[c.id] != null
                              ? overrides[c.id]!
                              : ""
                          }
                          onChange={(v) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [c.id]: typeof v === 'number' ? v : null,
                            }))
                          }
                          min={0}
                          max={365}
                          w={100}
                        />
                      </Table.Td>
                      <Table.Td>
                        <IconArrowRight size={16} color="gray" />
                      </Table.Td>
                      <Table.Td>
                        {calculatedDate ? (
                          <Badge color={color} variant="light" size="lg">
                            {formatDate(calculatedDate)}
                          </Badge>
                        ) : launchDate ? (
                          <Text size="sm" c="dimmed" fs="italic">
                            No offset
                          </Text>
                        ) : (
                          <Text size="sm" c="dimmed" fs="italic">
                            Set launch date
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {daysUntil != null ? (
                          <Text
                            size="sm"
                            fw={500}
                            c={
                              daysUntil < 0
                                ? "red"
                                : daysUntil <= 7
                                ? "orange"
                                : "dimmed"
                            }
                          >
                            {daysUntil < 0
                              ? `${Math.abs(daysUntil)}d overdue`
                              : daysUntil === 0
                              ? "Today"
                              : `${daysUntil}d remaining`}
                          </Text>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            {/* Phase summary */}
            {launchDate && (
              <Group px="md" py="xs" justify="flex-end">
                <Text size="xs" c="dimmed">
                  {items.filter((c) => getEffectiveOffset(c) != null).length} of{" "}
                  {items.length} tasks have calculated dates
                  {(() => {
                    const dates = items
                      .map((c) => getCalculatedDate(c))
                      .filter(Boolean) as Date[];
                    if (dates.length === 0) return "";
                    const earliest = new Date(
                      Math.min(...dates.map((d) => d.getTime()))
                    );
                    const latest = new Date(
                      Math.max(...dates.map((d) => d.getTime()))
                    );
                    return ` | Span: ${formatDate(earliest)} \u2013 ${formatDate(latest)}`;
                  })()}
                </Text>
              </Group>
            )}
          </Paper>
        ))}

        {/* Summary section */}
        {launchDate && criteria.length > 0 && (
          <>
            <Divider />
            <Paper p="md" withBorder>
              <Title order={4} mb="sm">
                Timeline Summary
              </Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Metric</Table.Th>
                    <Table.Th>Value</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>Launch Date</Table.Td>
                    <Table.Td fw={600}>{formatDate(launchDate)}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>Total Criteria</Table.Td>
                    <Table.Td>{criteria.length}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>With Due Offset</Table.Td>
                    <Table.Td>
                      {
                        criteria.filter((c) => getEffectiveOffset(c) != null)
                          .length
                      }
                    </Table.Td>
                  </Table.Tr>
                  {(() => {
                    const dates = criteria
                      .map((c) => getCalculatedDate(c))
                      .filter(Boolean) as Date[];
                    if (dates.length === 0) return null;
                    const earliest = new Date(
                      Math.min(...dates.map((d) => d.getTime()))
                    );
                    const overdue = dates.filter((d) => d < today).length;
                    return (
                      <>
                        <Table.Tr>
                          <Table.Td>Earliest Due Date</Table.Td>
                          <Table.Td>{formatDate(earliest)}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td>Tasks Due Before Today</Table.Td>
                          <Table.Td>
                            {overdue > 0 ? (
                              <Badge color="red" variant="light">
                                {overdue} overdue
                              </Badge>
                            ) : (
                              <Badge color="green" variant="light">
                                None
                              </Badge>
                            )}
                          </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td>Total Timeline Span</Table.Td>
                          <Table.Td>
                            {daysBetween(earliest, launchDate)} days (from first
                            task to launch)
                          </Table.Td>
                        </Table.Tr>
                      </>
                    );
                  })()}
                </Table.Tbody>
              </Table>
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  );
}
