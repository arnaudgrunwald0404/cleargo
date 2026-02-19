# HEART Metric Selection: How It Works and How to Trust It

## Aha Epic Review

- ClearGO epics come from Aha; the epic you picked (from the list under a release) has a name and description that the HEART flow uses.
- The Aha MCP in this environment uses a different reference format (e.g. `DEVELOP-123`) than the internal epic IDs (e.g. `APP-E-1099`), so we could not fetch the epic record directly via MCP. In the app, the epic’s **name** and **description** are what drive HEART recommendations.

---

## Pendo Data Quality (ClearCompany, last 30 days)

We checked Pendo for entities relevant to **LinkedIn Job Status** and **1:1 Self-Scheduling**–type epics. **You have strong, real usage** for both areas.

### Track events (custom events)

| Event | Events (30d) | Accounts | Visitors |
|-------|--------------|----------|----------|
| `App.Requisition.Synced.LinkedIn` | 117,893 | 669 | 3 |
| `App.Candidate.OneOnOneInterviewScheduling.TimeSlots.Sent` | 24,091 | 410 | 945 |
| `App.Candidate.MultiInterviewerScheduling.Invite.Sent` | 11,415 | 234 | 2 |
| `App.Candidate.ProfileViewed.LinkedIn` | 4,430 | 226 | 680 |

### Pages

| Page | Events (30d) | Accounts | Visitors |
|------|--------------|----------|----------|
| Edit Requisition | 57,593 | 1,269 | 4,273 |
| Recruiting - Requisition - Job Boards | 52,574 | 1,148 | 4,778 |
| Propose Times for 1:1 Screening Call | 21,110 | 538 | 1,438 |
| Interviews | 4,999 | 657 | 1,358 |

So for epics like **LinkedIn Job Status** or **Enhanced 1:1 Self-Scheduling**, Pendo has plenty of real data to back HEART metrics.

---

## How the Implementation Selects “Good” Choices

### 1. **Only real Pendo data is used**

- The agent receives **only** events and features returned by the Pendo integration (from `pendo_events_cache` and Pendo APIs).
- Events include **user count** and **event count** in the prompt so the model can prefer well-used events.

### 2. **Epic–event matching is guided, not guessed**

- **`findRelatedEvents()`** (in `pendo-context.ts`) scores events by:
  - Keyword overlap with epic **name** and **description** (tokenized, stemmed).
  - A small boost for events with `userCount > 100` and `eventCount > 1000`.
- The prompt lists these “related” events first, then the rest of the event list (up to a cap).
- So the AI sees which events are pre-ranked as relevant and which have strong usage.

### 3. **Product area keeps recommendations relevant**

- Epic **product area** is inferred from the epic (e.g. Recruiting, Onboarding).
- When fetching Pendo context, **events can be filtered by product area** (from `pendo_events_cache.product_area`).
- So the agent is working with events that are at least tagged or inferred for the same product space as the epic.

### 4. **Strict “do not guess” rule**

- The prompt explicitly says: *"DO NOT GUESS. If you cannot find Pendo events that are CLEARLY related to this feature (or to the user's direction when provided), you MUST skip that HEART category entirely."*
- So the model is instructed to leave a dimension empty rather than invent or guess event names.

### 5. **Validation: only valid IDs are kept**

- After the AI returns recommendations, **`validateRecommendations()`** (in `agent.ts`) runs.
- Every `eventId` is checked: it must be either an **exact event name** from the available events list or an **exact feature id** from the available features list.
- Any ID that doesn’t match is **dropped**; only valid event names or feature IDs are stored.
- So even if the model hallucinated an ID, it would not be applied.

### 6. **Data confidence from the model**

- The schema asks the model to set **`dataConfidence`** (`high` | `medium` | `low`) and **`dataConfidenceReason`**.
- These are returned and stored (e.g. `data_confidence` on the config). You can surface them in the UI to see when the model itself is uncertain.

### 7. **User direction overrides generic matching**

- If the user provides **“user context”** (e.g. “focus on LinkedIn sync and job board usage”), the prompt states: *"Use this as your PRIMARY guide for which events to recommend."*
- So explicit user direction can steer the AI toward the right Pendo events even when the epic name/description is generic.

---

## How You Can Trust the Implementation

1. **Check the rationales**  
   Each recommended dimension (Engagement, Adoption, etc.) has a **rationale** explaining why those events were chosen. Use them to judge whether the mapping makes sense.

2. **Use “What we’re tracking”**  
   The UI shows which event names (and/or feature names) are selected for each metric. Compare those to the Pendo entities above (and to Pendo itself) to confirm they match the epic.

3. **Rely on validation**  
   Only event names and feature IDs that exist in the current Pendo context survive `validateRecommendations`. You will not get fake or misspelled event names in saved metrics.

4. **Use data confidence when shown**  
   If the UI displays `dataConfidence` and `dataConfidenceReason`, treat “low” as a signal to manually review the recommended events and rationales.

5. **Spot-check in Pendo**  
   For a given epic, take one or two of the recommended event names and run a Pendo activity query (e.g. last 30 days) to confirm there is real usage. The tables above show that for LinkedIn and 1:1 scheduling, usage is strong.

6. **Add user direction when it matters**  
   When pulling HEART metrics, if you have a specific behavior in mind (e.g. “LinkedIn sync and job board views”), add that as user context so the model prioritizes those events.

---

## Summary

- **Aha:** The epic name/description (and product area) drive HEART; we couldn’t look up the epic by APP-E-xxx in MCP, but the app has the right context.
- **Pendo:** For epics like LinkedIn Job Status or 1:1 Self-Scheduling, Pendo has high-volume, real usage on relevant events and pages.
- **Trust:** The implementation uses only real Pendo data, pre-ranks related events, validates every ID, instructs the model not to guess, and returns a data-confidence assessment—so you can trust the choices by checking rationales, “What we’re tracking,” and optional spot-checks in Pendo.
