# What We DO per Level (UI/UX Impact 1-5)

This doc ties the **UI Rollout Framework** Levels to the work we do in ClearGO and to the **criteria** in [criteria-import-template-fixed.csv](./criteria-import-template-fixed.csv). The epic's Level is stored in Aha as **UI/UX Impact** and synced into ClearGO so the team knows which bar they're meeting.

---

## Quick reference: Path by Level

| Level | ClearGO? | Feature gate | QA scope | Customer notification | Timeline |
|:-----:|:--------:|:------------:|----------|------------------------|----------|
| **1** | Yes | Required | Full regression + perf | Extended advance email + CSM outreach | 18-24 weeks |
| **2** | Yes | Required | Full workflow E2E | Advanced email (2-4 weeks) | 6-9 weeks |
| **3** | Yes | Recommended | E2E affected flows | Internal CS notified (Slack, FAQ, KB); KB on release; CS may notify customers | 3-6 weeks |
| **4** | No | Optional | Component + in-app | Slack #ui-rollout only | 3 weeks |
| **5** | No | Optional | Visual regression | Slack #ui-rollout only | 3 weeks |

**Levels 1-3** use the full ClearGO path (UX Preview → Internal → CS Prep → Cohort 1 → Cohort 2).  
**Levels 4-5** use the simple path: Slack post, develop/QA, deploy to all; no ClearGO tracking.

---

## What we DO for each Level (and how it maps to criteria)

The 8 criteria in the import template apply to **UI Framework** epics (ClearGO Candidate = "Yes - UI Framework"). The GO/CONDITIONAL/NO GO definitions in the CSV already reference Level (e.g. "per Level", "Level 1-2", "Level 1-3"). Below is what we **do** per Level and how each criterion’s bar differs.

### Level 1 (Major redesign)

- **Timeline:** 18-24 weeks; CS notified 18+ weeks before Cohort 1.
- **Feature gate:** Required; full cohort rollout (UX Preview → Internal → Cohort 1 → Cohort 2).
- **QA:** Full regression + performance.
- **Internal notification to CS:** 18+ weeks before Cohort 1 (Slack/channel when planning begins; FAQ and KB in CS Prep; support training and customer email draft before Cohort 1).
- **Customer comms:** Extended advance email + personal CSM outreach; strategic account outreach plan.
- **CS prep:** Slack to CS, FAQ, KB updates, support training, customer email draft, strategic account outreach plan.
- **Education:** Product Education — full onboarding (Pendo) and KB/help updates (Zendesk); accessibility reviewed; linked.
- **UX validation:** Internal product user sessions (3-5), external representative user sessions (5-8), **and** customer sessions; findings documented and applied.

**Criteria that are strictest at Level 1:**  
UX Validation Complete (customer sessions required), Feature Gate Readiness (required), In-App Education (full onboarding), Customer notification by CS executed (18+ weeks advance email + CSM outreach).

---

### Level 2 (Workflow change)

- **Timeline:** 6-9 weeks.
- **Feature gate:** Required; same cohort rollout.
- **QA:** Full workflow E2E.
- **Internal notification to CS:** At least 2-4 weeks before Cohort 1 (Slack, FAQ, KB, support training, customer email draft so CS can send advance email 2-4 weeks before).
- **Customer comms:** Advanced email 2-4 weeks before.
- **CS prep:** Slack to CS, FAQ, KB updates, support training, customer email draft (no strategic account outreach plan).
- **Education:** Product Education — guided walkthroughs (Pendo) and KB/help updates (Zendesk); accessibility reviewed; linked.
- **UX validation:** Internal product user sessions (3-5), external representative user sessions (5-8); no customer sessions required.

**Criteria that are strictest at Level 1-2:**  
Feature Gate Readiness (required for 1-2); Customer notification by CS executed (Level 2: 2-4 weeks advance email; Level 1: 18+ weeks + CSM). In-App Education: Level 2 = guided walkthroughs.

---

### Level 3 (Interaction pattern change)

- **Timeline:** 3-6 weeks.
- **Feature gate:** Recommended (not required).
- **QA:** E2E affected flows only.
- **Internal notification to CS:** Before Cohort 1 within the 3-6 week rollout (Slack, FAQ, KB in CS Prep so CS can review and decide whether to notify any customers); CS may notify their customers depending on the change (e.g. high-touch or at-risk accounts).
- **Customer comms:** KB article updates upon release (no required advance email); CS may choose to notify customers.
- **Marketing:** No required customer campaign; optional release notes or KB tie-in.
- **CS prep:** Slack to CS, FAQ, KB updates (no support training or customer email draft required).
- **Education:** Product Education — contextual guidance (Pendo) and KB/help updates (Zendesk) where applicable; accessibility reviewed; linked.
- **UX validation:** Internal product user sessions (3-5) only; no external/customer sessions required.

**Criteria that relax at Level 3:**  
Feature Gate Readiness (gate optional). Customer notification by CS executed: Level 3 = internal CS notified (Slack, FAQ, KB), KB on release, and CS may notify customers depending on the change. In-App Education: Level 3 = contextual guidance.

---

### Level 4-5 (Component/visual or copy-only)

- **Who classifies:** Product (or designee) classifies the change as Level 4 or 5 in Aha so the team follows the simple path.
- **Path:** No ClearGO. Internal notification: Slack to #ui-rollout at least 3 weeks before deploy (Engineering); then develop/QA, deploy to all.
- **ClearGO:** These epics are typically not tracked in ClearGO (no UI Framework criteria); the sidebar still shows **UI/UX Impact** so the team sees Level 4 or 5 and knows the simple path applies.
- **Opportunity:** Product Education may still update docs (KB/help) and CS may still notify customers if the team agrees it would help; there is no *required* involvement for Level 4-5.

---

## How this changes what we DO in ClearGO

1. **Show the epic’s Level**  
   The epic’s **UI/UX Impact** (Level 1-5) is synced from Aha and shown in the epic sidebar. That tells the team which bar they’re meeting so they can do the right things (e.g. Level 1 = full validation + 18+ week comms; Level 3 = lighter validation + KB on release).

2. **Same 8 criteria, level-aware definitions**  
   The criteria import template has one row per criterion. The GO/CONDITIONAL/NO GO text already encodes Level (e.g. "per Level", "Level 1-2", "Level 1-3"). We don’t change criteria by Level in the app today; we **use the epic’s Level** so reviewers know which part of the definition applies (e.g. "Customer notification by CS executed" for Level 2 = 2-4 weeks email; for Level 1 = 18+ weeks + CSM).

3. **Optional later: level applicability on criteria**  
   If we want to hide or soften criteria by Level (e.g. "Customer notification by CS executed" only for Level 1-2), we could add a **level applicability** field to criteria (e.g. "1,2" or "1,2,3") and filter or label criteria on the epic by the epic’s Level. For now, the definitions in the CSV are the single source of what’s required per Level.

---

## Summary table: Criteria vs Level

| Criterion (from template) | Level 1 | Level 2 | Level 3 |
|--------------------------|:-------:|:-------:|:-------:|
| UX Validation Complete | Full (internal + external + customer sessions) | Internal + external (5-8) | Internal only (3-5) |
| UX Preview Validated | Yes | Yes | Yes |
| Behavioral Baseline Established | Yes | Yes | Yes |
| Feature Gate Readiness | Required | Required | Optional |
| Rollback Plan Ready | Yes | Yes | Yes |
| In-App Education Deployed | Full onboarding (Pendo + KB/help) | Guided walkthroughs (Pendo + KB/help) | Contextual guidance (Pendo + KB/help) |
| Internal CS notification complete | 18+ weeks before Cohort 1 | 2-4 weeks before Cohort 1 | Before Cohort 1 (CS Prep) |
| Customer notification by CS executed | 18+ weeks email + CSM outreach | 2-4 weeks email | Internal CS notified (Slack, FAQ, KB); KB on release; CS may notify customers |

Levels 4-5 do not use these criteria in ClearGO (simple path, no ClearGO tracking).

---

## Level = Tier for UI Framework epics

For epics with ClearGO Candidate = **Yes - UI Framework**, **Level (UI/UX Impact) is mapped to Tier** when syncing from Aha. Level 1 → Tier 1, Level 2 → Tier 2, Level 3 → Tier 3. So a UI Framework epic gets the tier that matches its Level. You can use **tier-specific criteria** (TIER_1_ONLY, TIER_2_ONLY, TIER_3_ONLY) so each epic sees exactly the right checklist with definitions that match that level. For non–UI Framework epics, Tier still comes from Aha's launch_tier field.

- Use TIER_1_ONLY, TIER_2_ONLY, or TIER_3_ONLY criteria so each epic sees the exact checklist for its level.

| Concept | Meaning | Where it lives |
|--------|---------|----------------|
| **Level** (1–5) | Size of the *UI change* (major redesign → workflow → interaction → component → visual). See UI Rollout Framework (aj-context/ui-rollout). | Aha **UI/UX Impact**; synced to epic in ClearGO. |
| **Tier** (TIER_1, TIER_2, TIER_3) | *Launch importance* of the epic (which launches get which criteria). | Epic’s tier in ClearGO (from Aha or settings). |

- An epic can be **Tier 2** and **Level 1** (major redesign on a T2 launch).
- **Level** drives *what bar* you meet for each criterion (e.g. Level 1 = customer sessions; Level 3 = internal only). The definitions in the CSV are level-aware.
- **Tier** drives *which criteria appear* on the epic: `tier_applicability` ALL = show for all tiers; TIER_1_ONLY = show only for Tier 1 epics; TIER_1_AND_2 = show for T1 and T2.

**Recommendation for the 8 UI Framework criteria: Tier applicability = ALL.**

- The UI Rollout Framework applies the **same** ClearGO path (and same 8 criteria) to every UI Framework epic at Level 1, 2, or 3. The *bar* scales by Level (e.g. “UX Validation Complete” is strictest at Level 1, lighter at Level 3).
- We do **not** split criteria by tier (e.g. TIER_1_ONLY for the strictest criteria) unless you decide that only Tier 1 launches must meet the full bar. The framework does not say that; it says “Levels 1–3 map to ClearGO” and the definitions are level-aware.
- So: **ALL** = every UI Framework epic (any tier) sees all 8 criteria; the epic’s **Level** (1–3) determines which part of each definition applies. The import template uses **Tier = ALL** for all 8 rows.

If you later want tier-specific criteria (e.g. “UX Validation Complete” only for Tier 1), you could add separate criteria with TIER_1_ONLY and level-aware definitions; the current design keeps one set of 8 with ALL.

---

**Ownership:** For **Internal CS notification complete**, PM coordinates: ensures Slack is sent and that Product Education (KB) and CS/Support (FAQ, training, draft) have completed their CS Prep tasks. For **Customer notification by CS executed**, Marketing executes the advance email plan; CSM owns the ClearGO criterion and strategic outreach.

---

## Managing notifications in ClearGO

ClearGO has a **Slack integration** and **notification settings** (Admin → Settings → Notifications / Integrations). You can configure Slack channels and email for criteria nudges, launch risk alerts, Go/No-Go decisions, weekly digest, and other events. Internal UI rollout notifications (e.g. notifying CS in #ui-rollout or a CS channel when an epic hits a gate or Cohort 1) can be managed there; configure the channels and templates that match your rollout process.
