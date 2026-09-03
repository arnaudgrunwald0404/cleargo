"use client";

import { use } from "react";
import PapricoMeetingMode from "@/components/admin/paprico/PapricoMeetingMode";

export default function PapricoMeetingModePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <PapricoMeetingMode meetingId={id} />;
}
