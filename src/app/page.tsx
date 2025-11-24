import { createClient } from "@/lib/supabase/server";
import { SignIn, SignOut } from "@/components/auth-components";
import { resolveRole } from "@/lib/roles";

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email;
  const role = email ? await resolveRole(email) : null;

  return (
    <main className="centered">
      <h1>Launch Readiness Console</h1>
      {email ? (
        <>
          <p>Signed in as {email}{role ? ` — role: ${role}` : ""}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <a href="/admin/criteria">Criteria Admin</a>
            <a href="/admin/settings">Settings</a>
            <SignOut />
          </div>
        </>
      ) : (
        <p>
          You are not signed in. <SignIn />
        </p>
      )}
    </main>
  );
}
