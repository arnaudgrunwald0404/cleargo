"use client";

import { use } from "react";
import PapricoMeetingMode from "@/components/admin/paprico/PapricoMeetingMode";

export default function PapricoMeetingModePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
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
                <PapricoMeetingMode meetingId={id} />
            </div>
        </main>
    );
}
