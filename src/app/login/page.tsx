"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) setStatus("Check your email for the sign-in link.");
    else {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || "Failed to send link");
    }
  }

  return (
    <main className="centered">
      <h1>Sign in</h1>
      <form onSubmit={onSubmit}>
        <label>
          Work email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit">Send magic link</button>
      </form>
      {status && <p>{status}</p>}
    </main>
  );
}
