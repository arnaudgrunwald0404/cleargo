# PRD Addendum — Aha Mapping, Filters, and Write-back (v0.1)

This addendum clarifies Aha integration details and extends the Launch data model to align with `docs/launch-readiness/aha-launch-console-mapping.yaml`.

## Aha Inbound Filter
- Include epics in allowed workspaces where:
  - Launch Candidate == true OR
  - tags contains "LaunchConsole"

## Launch Data Model (additions/clarifications)
- Launch (extensions):
  - product_component (string, read-only from Aha custom field)
  - pod (string, read-only from Aha custom field)
  - readiness_status (enum: Go, Conditional Go, No Go, Not Evaluated)
  - last_go_no_go_decision_date (date, optional)
  - console_url (string, optional) — format: https://launch-console.clearcompany.com/launch/{launch.id}
- Notes:
  - status remains the internal lifecycle (PLANNED, IN_EVALUATION, GO, CONDITIONAL_GO, NO_GO, SHIPPED, CANCELLED)
  - readiness_score remains a 0–1 float; readiness_score_pct is derived for Aha write-back only

## Aha Write-back (idempotent)
- Triggers:
  - On readiness recompute, and
  - On creation of a Decision Snapshot
- Only send updates when values changed since last sync.
- Fields written back to Aha:
  - Launch Readiness Status
  - Launch Readiness Score (%)
  - Launch Risk
  - Launch Go/No-Go Date
  - Launch Console URL

## Behavior on First Sync
- Upsert Launch by aha_id
- For new Launches: instantiate all applicable Criteria with NOT_SET

## Mapping Key Hygiene
- Confirm and parameterize all Aha custom_field_key values; remove "TODO" placeholders.
- Keep mapping configurable (no hard-coded keys).
