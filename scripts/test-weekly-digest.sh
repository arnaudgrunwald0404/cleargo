#!/usr/bin/env bash
# Test weekly leadership digest: real data, approval flow (LLM narrative + approve), and fictitious (mock) data.
# Requires: .env with SLACK_DEFAULT_CHANNEL, SLACK_BOT_TOKEN, CRON_SECRET (for step 2), DIGEST_VALIDATOR_EMAIL (optional).
#
# 1) Real data (live DB) → digest posted directly to SLACK_DEFAULT_CHANNEL (send_directly=true, needs CRON_SECRET).
# 2) LLM narrative + approval flow → draft with narrative sent to validator (DIGEST_VALIDATOR_EMAIL); they approve to post to channel.
# 3) Fictitious data → POST to Slack test endpoint, sends to SLACK_DEFAULT_CHANNEL.

set -e
cd "$(dirname "$0")/.."
BASE="${BASE_URL:-http://localhost:3000}"

# Load from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

CHANNEL="${SLACK_DEFAULT_CHANNEL:?Set SLACK_DEFAULT_CHANNEL in .env (e.g. C0A2N4AB33J)}"
CRON_SECRET="${CRON_SECRET:?Set CRON_SECRET in .env for digest job auth}"

echo "=== 1. Real data (live DB) → post directly to $CHANNEL ==="
echo "GET $BASE/api/jobs/leadership-digest?send_directly=true (Bearer CRON_SECRET)"
echo ""
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE/api/jobs/leadership-digest?send_directly=true"
echo ""

echo "=== 2. LLM narrative + approval flow (draft to validator, approve to post) ==="
echo "GET $BASE/api/jobs/leadership-digest (Bearer CRON_SECRET, no send_directly)"
echo "  → Draft with LLM narrative is sent to Slack DM for validator (DIGEST_VALIDATOR_EMAIL or default agrunwald@clearcompany.com)."
echo "  → Validator clicks 'Approve and send digest'; full digest is then posted to channel from settings/env."
echo "  → Ensure NEXT_PUBLIC_APP_URL is reachable (e.g. ngrok) so the Approve link works."
echo ""
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE/api/jobs/leadership-digest"
echo ""

echo "=== 3. Fictitious data (mock, looks good) → $CHANNEL ==="
echo "POST $BASE/api/integrations/slack/test (type=leadership_digest + full testData + channel)"
echo ""
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$BASE/api/integrations/slack/test" \
  -H "Content-Type: application/json" \
  -d @- << EOF
{
  "type": "leadership_digest",
  "testData": {
    "type": "leadership_digest",
    "priority": "low",
    "channel": "$CHANNEL",
    "metadata": {
      "week_of": "January 30, 2026",
      "high_risk_launches": [
        { "name": "Q1 Platform Launch", "id": "mock-1", "tier": "TIER_1", "risk": "HIGH", "days_to_launch": 7, "readiness": 62 },
        { "name": "Mobile App v3", "id": "mock-2", "tier": "TIER_2", "risk": "MEDIUM", "days_to_launch": 14, "readiness": 78 }
      ],
      "upcoming_launches": [
        { "name": "API v2 Release", "id": "mock-3", "tier": "TIER_1", "target_release_date": "2026-02-15T00:00:00.000Z" },
        { "name": "Dashboard Redesign", "id": "mock-4", "tier": "TIER_2", "target_release_date": "2026-02-28T00:00:00.000Z" }
      ],
      "total_active": 12,
      "last_releases": [
        {
          "release_name": "2026.1",
          "launch_date": "2026-01-20",
          "average_readiness": 88,
          "metrics_count": 0,
          "red_flags": { "no_metrics": true, "no_progression": false },
          "no_metrics_epics": [
            { "name": "Legacy Migration", "id": "e3" },
            { "name": "Auth Modernization", "id": "e1" }
          ],
          "no_progression_epics": [],
          "best_epics": [
            { "name": "Auth Modernization", "id": "e1", "scorecard_status": "ON_TRACK" },
            { "name": "Billing Pipeline", "id": "e2", "scorecard_status": "ON_TRACK" }
          ],
          "worst_epics": [
            { "name": "Legacy Migration", "id": "e3", "scorecard_status": "AT_RISK" }
          ]
        },
        {
          "release_name": "2025.4",
          "launch_date": "2025-12-10",
          "average_readiness": 92,
          "metrics_count": 4,
          "red_flags": { "no_metrics": false, "no_progression": true },
          "no_metrics_epics": [],
          "no_progression_epics": [
            { "name": "Billing Pipeline", "id": "e2" }
          ],
          "best_epics": [
            { "name": "Search Upgrade", "id": "e4", "scorecard_status": "ON_TRACK" }
          ],
          "worst_epics": [],
          "above_target_epics": [
            { "name": "Search Upgrade", "id": "e4", "percent_of_goal": 137 },
            { "name": "Auth Modernization", "id": "e1", "percent_of_goal": 112 }
          ]
        }
      ],
      "next_releases": [
        {
          "release_name": "2026.2",
          "launch_date": "2026-02-10",
          "readiness_breakdown": { "go": 4, "conditional_go": 1, "no_go": 0, "not_evaluated": 1 },
          "red_flags": [
            { "epic_name": "Data Pipeline", "epic_id": "e5", "gate_blockers": 1, "overdue_criteria": 2, "readiness_score": 65, "risk_level": "MEDIUM" }
          ]
        },
        {
          "release_name": "2026.3",
          "launch_date": "2026-03-05",
          "readiness_breakdown": { "go": 3, "conditional_go": 2, "no_go": 0, "not_evaluated": 3 },
          "red_flags": []
        }
      ]
    }
  }
}
EOF
echo ""
