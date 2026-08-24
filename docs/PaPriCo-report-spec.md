# Specification — PaPriCo report in ClearGO

**Version:** 1.0 · 24 August 2026
**Author:** Arnaud Grunwald
**Implementers:** Dan Pope, AJ Depew (ClearGO owners)
**Status:** Draft for review

---

## 1. Purpose

PaPriCo — ClearCo's Packaging & Pricing Committee — currently decides its own scope by hand, records its decisions in a Slack post, and tracks its commitments nowhere. The observable result is that in the June 2026 session, four of six action items owned by the chair did not land, and nobody could see that until the next meeting was being prepared.

ClearGO already holds the facts the committee needs: which releases are approaching which stage, and which criteria are still open. This report turns those facts into the meeting, and turns the meeting's output back into tracked state.

**Three jobs, in priority order:**

1. **Generate the agenda from criteria state**, so scope is set by the system rather than by whoever remembers.
2. **Capture each decision** with an owner and a due date, so ClearGO becomes the system of record for pricing and packaging decisions.
3. **Surface open commitments** at the top of every agenda, so nothing quietly fails to land again.

**Success condition:** the chair spends zero time assembling an agenda, and no decision leaves the room without an owner and a date.

---

## 2. Location and access

- New admin section: **Launches Management → PaPriCo**, sibling to Launch Schedule and Launch Criteria.
- Permissions: **identical to Release Criteria** — committee members read/write; no public or shareable view in v1.
- Rationale for no public view: items carry unapproved prices, gross-margin floors and vendor cost data. A shareable read-only view is a candidate for v2 with explicit field-level redaction, not something to retrofit later by accident.

---

## 3. Data model

Four new tables. Names are indicative; follow existing repo conventions for casing and prefixes.

### `paprico_meetings`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `meeting_date` | date | |
| `chair_email` | text | |
| `status` | enum | `draft` · `agenda_published` · `held` · `closed` |
| `agenda_published_at` | timestamptz | null until published |
| `agenda_snapshot` | jsonb | frozen item list at publish time — see §5.4 |
| `notes` | text | free-form chair notes |
| `created_at` / `updated_at` | timestamptz | |

### `paprico_items`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `source` | enum | `release` (derived from criteria) · `standing` (manually added) |
| `release_id` | fk nullable | set when `source = release` |
| `criterion_id` | fk nullable | set when `source = release` — **match by ID, never by label** |
| `title` | text | auto-composed for release items, free text for standing |
| `description` | text | |
| `category` | text | e.g. Pricing, Packaging, Naming, Forecasting, Process |
| `owner_email` | text | |
| `status` | enum | `proposed` · `on_agenda` · `decided` · `deferred` · `blocked` · `closed` |
| `blocked_reason` | text | required when `status = blocked` |
| `time_box_minutes` | int nullable | chair-set, used to sanity-check the agenda against meeting length |
| `sort_order` | int | chair-controlled ordering within a meeting |
| `auto_closed` | bool | true when closed by the criterion flipping complete |
| `created_at` / `updated_at` | timestamptz | |

### `paprico_decisions` — append-only
| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `item_id` | fk | |
| `meeting_id` | fk | |
| `decision_type` | enum | `approved` · `approved_with_amendment` · `rejected` · `deferred` · `assigned` · `no_decision_needed` |
| `decision_text` | text | what was actually decided, in one or two sentences |
| `rationale` | text nullable | why — the thing nobody ever writes down |
| `owner_email` | text | who executes |
| `due_date` | date nullable | |
| `completed_at` | timestamptz nullable | set when the commitment lands |
| `supersedes_id` | fk nullable | a later decision that reverses or amends an earlier one |
| `decided_by` | text | authenticated user |
| `decided_at` | timestamptz | |

**Decisions are never edited or deleted.** A change of mind is a new decision row with `supersedes_id` set. This is deliberate: the committee's credibility problem is partly that its history is unreconstructable.

### `paprico_gating_criteria` — configuration
| Field | Type | Notes |
|---|---|---|
| `criterion_id` | fk pk | |
| `enabled` | bool | |
| `lookahead_days` | int | per-criterion override of the default horizon |

Seed with: **20** Packaging & Pricing Approved · **70** Confirmed Pricing Communicated · **71** Revenue forecast reviewed by SVP Sales + Head RevOps · **5** Revenue Forecast & Risk Analysis · **62** Commercialization · plus the two new criteria *Product Name Confirmed* and *Unit Economics & Margin Floor Documented* once they exist.

Editable in the UI. Criteria get renumbered and relabelled; the report must not break when they do — hence matching on `criterion_id`, and hence this table rather than a hardcoded list.

---

## 4. Agenda generation rule

Computed **on read**, not by a background job. No cron, no staleness.

For the next meeting with `status IN (draft, agenda_published)`:

```
An item is auto-PROPOSED when:
    the release has a criterion in paprico_gating_criteria WHERE enabled = true
AND that criterion is not complete for that release
AND the release's date for that criterion's Ready By stage
      falls within lookahead_days (default 60) of the meeting date
```

Plus, always included regardless of dates:

- Every `standing` item with `status NOT IN (closed)`.
- Every item with `status = deferred` from any previous meeting — **deferral carries forward automatically**.
- Every open commitment: any `paprico_decisions` row with `owner_email` set, `completed_at IS NULL`, and `due_date` in the past or within 14 days.

### Urgency band
Derived from days between today and the stage date for the open criterion:

| Band | Condition |
|---|---|
| `overdue` | stage date has passed |
| `critical` | ≤ 14 days |
| `soon` | 15–30 days |
| `horizon` | 31+ days |

Sort: `overdue` → `critical` → `soon` → `horizon`, then by stage date ascending, then by tier (Tier 1 first).

### Auto-close
When a criterion in `paprico_gating_criteria` flips to complete for a release, any `paprico_items` row for that release/criterion pair with `status IN (proposed, on_agenda, deferred)` is set to `closed` with `auto_closed = true`, and a system note is appended. The report maintains itself; items disappear because the underlying work got done, not because someone tidied the list.

---

## 5. Screens

### 5.1 Agenda (default view)
Header: next meeting date, chair, status, total time-boxed minutes versus meeting length (warn when over).

Four sections, in this order:

1. **Open commitments** — decisions with an owner and a due date, not yet complete. Shows age in days. *This section is first on purpose.*
2. **Overdue and critical** — release items whose stage date has passed or is inside 14 days.
3. **Approaching** — the rest of the release-derived items inside the horizon.
4. **Standing items** — the manually-added backlog: ClearInsights Max refresh, legacy credit conversion, discount enforcement, and similar.

Each row shows: title · release · tier · the open criterion · stage · days to stage date · owner · status · urgency band. Row actions: add to agenda / defer / block / open detail. Chair can drag to reorder and set a time box.

Empty state for §2–3 is a real answer, not a blank: *"Nothing approaching a stage with pricing, naming or forecast criteria open."*

### 5.2 Publish agenda
Chair action, available in `draft`. Freezes the current list into `agenda_snapshot`, sets `status = agenda_published`, and produces:

- a printable / readable agenda view;
- a **copyable Slack-formatted block** — the chair posts this to `#paprico` rather than writing it.

Publishing matters because a computed agenda would otherwise shift between circulation and the meeting. Snapshot it, and the room is looking at what was sent.

### 5.3 In-meeting mode
Full-width, one item at a time, keyboard-navigable (`j`/`k` or arrows to move, `d` to open the decision form). For each item: the item detail, its decision history, and the capture form.

**Decision form:** decision type (required) · decision text (required) · rationale · owner (required for `assigned`, `approved`, `approved_with_amendment`) · due date (required when an owner is set). Saves immediately on submit — no draft state to lose, and the record is written while the room is still in the meeting.

Validation: an item cannot be marked `decided` without at least one decision row. An `assigned` or `approved` decision cannot be saved without an owner and a due date. This is the single most important constraint in the spec.

### 5.4 Item detail
Title, description, source, linked release and criterion (deep-linked into the existing criteria UI), category, owner, status, attachment links (submission deck, spreadsheet, Slack thread), and the full append-only decision history with `supersedes` relationships rendered as a chain.

### 5.5 Minutes export
Generates, for a `held` meeting: decisions taken (with owner and due date), items deferred and why, items blocked and on what, and commitments still open from prior meetings. Output as markdown, copyable, plus download. This replaces the hand-written summary entirely.

### 5.6 Settings
Manage `paprico_gating_criteria` — which criteria pull an item onto the agenda, and the default lookahead. Small screen, high value; it is what keeps the report alive as ClearGO's criteria change.

---

## 6. Non-functional requirements

- **Audit:** every write records the authenticated user and timestamp. Decisions are append-only.
- **Time:** store UTC, render in `America/Los_Angeles`.
- **Performance:** the agenda view must render from a single round trip; no N+1 across releases and criteria.
- **No new PII.** Owners are identified by work email only.
- **Accessibility:** WCAG 2.2 AA, consistent with the existing ClearCo token set. Urgency must not be conveyed by colour alone — pair every band with a text label.
- **Resilience:** if a release or criterion is deleted, its items remain and render as orphaned rather than disappearing or erroring.
- **No writes to ClearGO's existing criteria state.** This report reads criteria; it never flips them. Changing a criterion's completion remains the job of whoever owns it.

---

## 7. Out of scope for v1

Price calculation of any kind · CPQ behaviour · anything writing to Salesforce or PandaDoc · public or customer-facing views · email or Slack automation (the copyable blocks are deliberate manual steps in v1) · the shareable GTM-wide read-only view.

---

## 8. Acceptance criteria

1. With no meeting scheduled, the section prompts the chair to create one; nothing else errors.
2. A release with criterion 20 open, whose Product Definition Complete date is 45 days out, appears as `proposed` in **Approaching**.
3. The same release, with that date 10 days out, appears in **Overdue and critical** with band `critical`.
4. Marking criterion 20 complete in ClearGO causes that item to close with `auto_closed = true` on next load, with no user action.
5. A standing item with no release appears in **Standing items** and never disappears until explicitly closed.
6. An item cannot be set to `decided` without a decision row.
7. An `assigned` decision cannot be saved without both an owner and a due date.
8. A decision that supersedes another renders both, in order, with the relationship visible.
9. An item deferred in meeting A appears automatically on meeting B's agenda.
10. A decision with a past due date and no `completed_at` appears in **Open commitments** on every subsequent agenda until completed.
11. Publishing an agenda freezes the list; later criteria changes do not alter the published snapshot.
12. Minutes export for a held meeting lists every decision with owner and due date.
13. Access matches Release Criteria permissions; an unauthorised user gets the standard denial, not a partial render.
