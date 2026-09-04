"use client";

import { Tabs, Text } from "@mantine/core";
import PapricoAgendaView from "@/components/admin/paprico/PapricoAgendaView";
import PapricoGatingCriteriaSettings from "@/components/admin/paprico/PapricoGatingCriteriaSettings";

export default function PapricoPrepPage() {
    return (
        <main className="min-h-screen" style={{ background: 'var(--color-platinum)' }}>
            <div
                style={{
                    maxWidth: 'var(--page-container-max-width)',
                    margin: '0 auto',
                    paddingLeft: 'var(--page-container-padding-x)',
                    paddingRight: 'var(--page-container-padding-x)',
                    paddingTop: 'var(--page-container-padding-top)',
                    paddingBottom: 'var(--spacing-8)',
                }}
                className="sm:px-6 lg:px-8"
            >
                <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
                    <div className="mb-4">
                        <Text fw={700} size="lg">PaPriCo Prep</Text>
                        <Text size="sm" c="dimmed">
                            Packaging &amp; Pricing Committee — agenda generated from open release criteria,
                            decisions tracked with owners and due dates.
                        </Text>
                    </div>
                    <Tabs defaultValue="agenda" keepMounted={false}>
                        <Tabs.List mb="md">
                            <Tabs.Tab value="agenda">Agenda</Tabs.Tab>
                            <Tabs.Tab value="settings">Settings</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="agenda">
                            <PapricoAgendaView />
                        </Tabs.Panel>
                        <Tabs.Panel value="settings">
                            <PapricoGatingCriteriaSettings />
                        </Tabs.Panel>
                    </Tabs>
                </div>
            </div>
        </main>
    );
}
