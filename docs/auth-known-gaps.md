# Auth: Known Gaps

Last reviewed: 2026-08-18

Companion to `docs/supabase-security.md` (which covers Supabase *configuration*). This file
covers *application-level* auth: what is enforced, and the two gaps consciously left open.

---

## What is enforced (as of 2026-08-18)

- **Pages** — `requirePageAuth()` (`src/lib/auth/requirePageAuth.ts`) is called from a
  `layout.tsx` in every protected top-level segment. Unauthenticated requests get a 307 to
  `/login?redirect=<segment>`. Public: `/login`, `/auth/*`, `/reset-password`,
  `/setup-password`, `/logout`.
- **API routes** — each handler checks `getAuthenticatedUserEmail()`, `CRON_SECRET`,
  `X-ClearGo-Key`, or a webhook signature. Routes that read via the **service role key**
  bypass RLS entirely, so the in-route check is the only protection they have.
- **Sign-up is domain-locked** to `@clearcompany.com` (`src/app/api/auth/signup/route.ts`,
  and the magic-link route). Anything reachable by "any signed-in user" is therefore an
  internal-only exposure, not internet-facing.
- **Not enforced in `src/proxy.ts`** — Netlify builds with `NEXT_DISABLE_NETLIFY_EDGE=true`,
  so that file does not execute in production at all. Its rate limiting and CORS handling
  are inert there; only per-route `withRateLimit` runs. Never put a gate in `proxy.ts` and
  assume it ships.

### History

The gate was lost in `73c5162` (2026-02-06), which removed the `PUBLIC_ROUTES` allowlist and
login redirect from `proxy.ts`, leaving a comment saying pages would handle it — only 3 of
~58 pages ever did. Restored 2026-08-18 at the layout level. Before the restore,
`GET /api/epics` returned 74 real epics to anonymous callers, because it carried an explicit
`// AUTH DISABLED` comment and reads through the service role key.

---

## Gap 1 — No role gating on pages (accepted)

**What.** `requirePageAuth()` checks *authenticated*, not *authorized*. Any signed-in user can
load any page, including the admin UI. No admin page has a server-side role check.

**Bounded by.** Sign-up is domain-locked, so this is internal-only. Most *writes* are still
held at the API layer: 8 of 14 `/api/admin/*` routes enforce roles, as do most settings
routes. Impersonation is correctly gated by `isSuperAdmin()` and refuses to impersonate
another superadmin.

**Concrete open item.** `src/app/api/admin/audit/route.ts` checks authentication only, and
carries its own marker:

```
// TODO: Add RBAC check here to ensure user is Admin/Product Ops
```

Any signed-in user can read the audit log.

**Why the pre-Feb behavior was not restored.** The old middleware bounced users whose only
role was `OTHER` to `/access-pending`. Re-enabling that today parks **11 users** (all
`@clearcompany.com`) until someone assigns them roles. Note the legacy `app_user.role` column
shows 68 as `OTHER`, but `resolveRole()` prefers the `roles` array (`src/lib/roles.ts:41`),
so 11 is the operative number.

**To close it later:** add the RBAC check to `/api/admin/audit`; optionally add a role check
to `src/app/admin/layout.tsx`; assign roles to the 11 `OTHER`-only users *before* enabling any
`/access-pending` bounce.

---

## Gap 2 — Aha webhook signature is optional (accepted, needs Aha-side work first)

**What.** `src/app/api/integrations/aha/webhook/route.ts` verifies the HMAC signature *only
when the header is present*:

```ts
if (signature) {
    const isValid = await verifyWebhookSignature(rawBody, signature);
    if (!isValid) return new NextResponse('Unauthorized', { status: 401 });
} else {
    console.log('No webhook signature provided - skipping verification');
}
```

Omit `x-aha-signature` and verification is skipped. The endpoint is unauthenticated by design
(it is a webhook), so anyone on the internet can POST to it.

**The validator itself is fine** — `src/lib/aha/webhook-validator.ts` does HMAC-SHA256 with a
timing-safe compare. The problem is the caller, not the crypto.

**Critical context: the secret is not configured.** `app_settings.aha_webhook_secret` is empty
in production. The signature branch is therefore dead code — *every* real webhook already
takes the skip path. **Making verification mandatory today would break epic sync outright.**

**Blast radius (bounded).** The handler is upsert-only — no delete or archive events. For real
epic IDs it re-fetches authoritative data from Aha via `getEpic()`, overwriting whatever the
caller sent, so an attacker cannot rewrite a real epic's contents. A forged request *can*:

- inject arbitrary fake `TEST-*` epics — the re-fetch is skipped for IDs starting with `TEST-`
  or containing `TEST-WEBHOOK`, so the attacker's payload is used verbatim;
- force server-side Aha API calls for arbitrary epic IDs (quota burn);
- flip `aha_record_not_found` state on epics via the 404 path.

**Remediation (in order — the first two steps are outside this repo):**

1. In Aha (**Settings → Account → Integrations → your ClearGO webhook**), set a shared secret
   and confirm Aha is configured to sign requests.
2. Store the same value in `app_settings.aha_webhook_secret` (id = 1).
3. Verify a real Aha webhook now arrives *with* `x-aha-signature` and passes verification —
   check the logs for the `No webhook signature provided` line disappearing.
4. Only then change the route to reject unsigned requests: replace the `if (signature)` /
   `else` block with an unconditional verify that 401s when the header is missing.
5. Consider dropping the `TEST-` bypass, or restricting it to non-production.

Do not do step 4 before steps 1–3, or epic sync stops.
