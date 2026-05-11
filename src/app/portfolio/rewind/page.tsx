import { redirect } from "next/navigation";

/** Roadmap Rewind now lives under Analytics → Roadmap. */
export default function RoadmapRewindRedirectPage() {
  redirect("/analytics?section=roadmap&roadmapTab=rewind");
}
