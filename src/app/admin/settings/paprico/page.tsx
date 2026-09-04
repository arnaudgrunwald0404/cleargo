import { redirect } from "next/navigation";

// PaPriCo moved out of Admin Settings to the main nav (Tools → PaPriCo Prep).
// Keep the old URL working for bookmarks and published Slack links.
export default function LegacyPapricoSettingsPage() {
    redirect("/paprico");
}
