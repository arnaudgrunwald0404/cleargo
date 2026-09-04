import { redirect } from "next/navigation";

// PaPriCo moved out of Admin Settings to the main nav (Tools → PaPriCo Prep).
export default async function LegacyPapricoMeetingModePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/paprico/meeting/${id}`);
}
