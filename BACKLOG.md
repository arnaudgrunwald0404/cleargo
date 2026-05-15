# ClearGO Backlog

Last updated: 2026-05-15

---

## 🐛 Bugs

- [ ] **Slack notification not reliably firing when 2+ users are mentioned in a comment** — Arnaud Grunwald reported in DM (2026-05-14): "I never know if the ClearGO Slack messages are reaching when there are two people mentioned in a comment." Needs investigation into the multi-mention notification path.
- [ ] **Inconsistent date formatting** — Dates not displaying consistently across the app. Investigate and standardize. *(from TODO.md)*

---

## 🔔 Notifications & Comments

- [ ] **Thread-aware comment notifications (Kim Edwards, 2026-05-14)** — Users want Slack-like behavior: if you started a comment thread and tagged someone, notify you when they reply; if someone tagged you, notify you when the thread gets new activity. Kim noted it's hard to track comment threads she's involved in. *(Raised in #launch-readiness after Arnaud's feature update post)*
- [x] **Notification preference control (email vs. Slack)** — Michael Jones requested ability to choose delivery channel per notification. ✅ Implemented (staging, 2026-05-14)
- [x] **Master approver notified only when department sub-items complete** — Michael Jones request. ✅ Implemented (prod, 2026-05-14)
- [x] **Mark all comments as read + filter by threads you started or are tagged in** — Victoria Mariani request. ✅ Implemented (staging, 2026-05-14)

---

## 🔧 Quality / Tech Debt

- [ ] **SOC2 subprocessor registration** — Supabase and Netlify need to be formally registered as SOC2 subprocessors before ClearGO expands scope. *(AJ, DM 2026-05-14)*
- [ ] **Quality pass before major feature expansion** — AJ flagged concerns about maintainability as complexity grows. Do a structured audit (test coverage, error handling, performance, code organization) before taking on large new capabilities. *(AJ, DM 2026-05-14)*
- [ ] **Test tier changes write back to Aha!** — Verify that changing tier in ClearGO correctly writes back to Aha!. *(from TODO.md)*

---

## 🚀 Features (Current Backlog)

These were called out by AJ as the current backlog to complete before expanding scope:

- [ ] **Release Log** — Allow users to view a historical log of releases and their readiness outcomes.
- [ ] **Ideas Portal** — In-app portal for stakeholders to submit feature ideas/requests.
- [ ] **Success Metrics (HEART)** — Post-launch success metrics dashboard (HEART framework integration).

---

## 🔗 Integrations

- [ ] **Confluence integration** — ClearGO currently only pulls from Aha!. Expanding to Confluence requires data modeling work and a new integration client. *(AJ, DM 2026-05-14)*
- [ ] **Jira integration expansion** — Broaden existing Jira support to cover additional use cases beyond epic key extraction. *(AJ, DM 2026-05-14)*
- [ ] **Data quality & tagging standards** — Define standardized tagging conventions and socialize + enforce across all 7 product pods. Required before a knowledge/search layer is viable. *(AJ, DM 2026-05-14)*

---

## 📅 Ops / Process

- [ ] **Schedule stakeholder enablement sessions** — Arnaud asked AJ and Dan Pope to coordinate timing (DM 2026-05-14). Plan: 1× 60-min formal training (recorded) + 4× 30-min office hours. Audience: all ClearGO stakeholders.
- [ ] **Use Feedback tab to communicate upcoming changes** — Arnaud suggested (DM 2026-05-14) that AJ post upcoming system changes in the Feedback tab so users can review and comment before changes go live.

---

## 🔮 Future / Deferred

These ideas were discussed but intentionally deprioritized or redirected:

- [ ] **PMM one-pager generation** — Discussed building this into ClearGO but agreed it's better implemented as a standalone MCP (e.g., "PMM one-pager MCP" or "Product Documentation MCP") rather than adding more surface area to ClearGO. *(AJ + Arnaud DM, 2026-05-14)*
- [ ] **Knowledge layer (vector embeddings, semantic search, Q&A)** — Enterprise-grade capability requiring data quality foundation first. Deferred until tagging standards and data quality are in place. *(AJ, DM 2026-05-14)*
- [ ] **Sales enablement & support Q&A features** — Part of a broader enterprise vision discussed with Arnaud. On hold pending foundation work and scope decision. *(AJ, DM 2026-05-14)*
