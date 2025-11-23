import { getSession } from "@/lib/auth";
import { resolveRole } from "@/lib/roles";

export default async function HomePage() {
  const session = await getSession();
  const email = session?.email || null;
  const role = email ? await resolveRole(email) : null;
  return (
    <main className="centered">
      <h1>Launch Readiness Console</h1>
      {email ? (
        <>
          <p>Signed in as {email}{role ? ` — role: ${role}` : ""}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <a href="/admin/criteria">Criteria Admin</a>
            <form action="/api/auth/signout" method="post">
              <button type="submit">Sign out</button>
            </form>
          </div>
        </>
      ) : (
        <p>
          You are not signed in. <a href="/login">Sign in</a>
        </p>
      )}
    </main>
  );
}
