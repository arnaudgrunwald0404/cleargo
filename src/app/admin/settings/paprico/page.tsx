"use client";

import { Tabs, Text } from "@mantine/core";
import PapricoAgendaView from "@/components/admin/paprico/PapricoAgendaView";
import PapricoGatingCriteriaSettings from "@/components/admin/paprico/PapricoGatingCriteriaSettings";

export default function PapricoPage() {
    return (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
            <div className="mb-4">
                <Text fw={700} size="lg">PaPriCo</Text>
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
    );
}
