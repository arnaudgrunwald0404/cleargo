# Supabase Security Configuration

## Leaked password protection (Auth)

Supabase Auth can check passwords against [HaveIBeenPwned](https://haveibeenpwned.com/) to block compromised passwords.

**Enable in the Supabase Dashboard:**

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Authentication** → **Providers** or **Authentication** → **Settings** (depending on UI).
3. Find **Password** / **Password strength and leaked password protection**.
4. Turn on **Leaked password protection**.

Reference: [Supabase password security docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Auth DB connection strategy (production)

Use **percentage-based** Auth DB connection allocation in production so that scaling the instance also scales Auth connections. In Supabase Dashboard: **Project Settings → Database** (or **Auth**), switch from a fixed connection count to percentage-based allocation. See [Supabase going into prod](https://supabase.com/docs/guides/deployment/going-into-prod).
