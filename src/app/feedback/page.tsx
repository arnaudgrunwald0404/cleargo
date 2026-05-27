import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { AHA_IDEAS_PORTAL_SSO_PATH } from "@/lib/aha/ideasPortal";

export const dynamic = "force-dynamic";

/** Legacy /feedback URLs redirect into the Aha ideas portal (same tab). Nav uses a new tab. */
export default async function FeedbackPage() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const session = await getSession();

  if (authError || (!user && !session?.email)) {
    redirect("/login?redirect=/feedback");
  }

  redirect(AHA_IDEAS_PORTAL_SSO_PATH);
}
