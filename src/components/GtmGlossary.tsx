'use client';

import { ActionIcon, Popover, ScrollArea, Text, Tooltip } from '@mantine/core';
import { IconHelp } from '@tabler/icons-react';

/** Single source of truth for GTM terminology shown to casual users (CLEARGO-I-11). */
export const GTM_GLOSSARY_TERMS: Array<{ term: string; definition: string }> = [
    {
        term: 'GTM Orgs',
        definition:
            'Go-To-Market organizations (Sales, CS, Support, etc.). The GTM Orgs date is when the feature is enabled in the platform for these internal orgs so they can perform launch tasks.',
    },
    {
        term: 'Internal Orgs',
        definition:
            'All internal ClearCompany organizations, not just GTM. The Internal Orgs date is when everyone internally can access the feature.',
    },
    {
        term: 'Cohort 1',
        definition:
            'The initial rollout to approximately 10–15% of the customer base. All enablement materials must be ready before this date.',
    },
    {
        term: 'Cohort 2',
        definition:
            'The second rollout wave, typically aligned to the next release train after Cohort 1.',
    },
    {
        term: 'GA (General Availability)',
        definition:
            'The feature is available to ALL customers — fully rolled out across the entire customer base.',
    },
    {
        term: 'Go/No-Go',
        definition:
            'The readiness decision made per criterion (and per release) on whether a launch can proceed. GO = ready, CONDITIONAL = ready with caveats, NO-GO = not ready.',
    },
    {
        term: 'Readiness',
        definition:
            'The percentage of launch criteria marked GO or N/A for an epic. 100% means every criterion has been signed off.',
    },
    {
        term: 'Release Train',
        definition:
            'The recurring monthly release schedule. Epics board a train; if not ready, they roll to the next one.',
    },
    {
        term: 'Retro (30/60/90)',
        definition:
            'Post-launch retrospectives at 30, 60, and 90 days after release to review success metrics and adoption.',
    },
    {
        term: 'Tier 1 / Tier 2',
        definition:
            'Launch sizing. Tier 1 = major launches with full GTM coordination. Tier 2 = significant launches with lighter-weight process. Tier 3+ items ship without a formal launch.',
    },
];

/**
 * Help icon that opens a glossary of GTM terms.
 * Place next to page titles where casual users encounter GTM jargon.
 */
export function GtmGlossary() {
    return (
        <Popover width={380} position="bottom-start" withArrow shadow="md">
            <Popover.Target>
                <Tooltip label="GTM terms glossary" withArrow>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Open GTM terms glossary"
                        size="md"
                    >
                        <IconHelp size={20} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="md">
                <Text fw={600} size="sm" mb="xs" style={{ fontFamily: 'var(--font-body)' }}>
                    GTM Terms Glossary
                </Text>
                <ScrollArea.Autosize mah={420} type="auto" offsetScrollbars>
                    {GTM_GLOSSARY_TERMS.map(({ term, definition }) => (
                        <div key={term} style={{ marginBottom: 10 }}>
                            <Text size="sm" fw={600} style={{ fontFamily: 'var(--font-body)' }}>
                                {term}
                            </Text>
                            <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-body)', lineHeight: 1.45 }}>
                                {definition}
                            </Text>
                        </div>
                    ))}
                </ScrollArea.Autosize>
            </Popover.Dropdown>
        </Popover>
    );
}
