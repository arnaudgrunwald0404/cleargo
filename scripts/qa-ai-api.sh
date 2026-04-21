#!/bin/bash
# QA script for the ClearGO AI Chief-of-Staff API.
# Usage:
#   CLEARGO_BASE_URL=https://your-deploy.netlify.app \
#   CLEARGO_AI_API_KEY=your-key \
#   TEST_MEMBER_ID=<uuid> \
#   TEST_EPIC_ID=<uuid> \
#   ./scripts/qa-ai-api.sh

BASE_URL="${CLEARGO_BASE_URL:-http://localhost:8888}"
API_KEY="${CLEARGO_AI_API_KEY:-test-key}"
TEAM_MEMBER_ID="${TEST_MEMBER_ID:-a1000000-0000-0000-0000-000000000001}"
EPIC_ID="${TEST_EPIC_ID:-c1000000-0000-0000-0000-000000000001}"

AUTH_HEADER="X-ClearGo-Key: $API_KEY"

echo ""
echo "=== ClearGO AI API QA ==="
echo "Base URL : $BASE_URL"
echo "Member ID: $TEAM_MEMBER_ID"
echo "Epic ID  : $EPIC_ID"
echo ""

# -----------------------------------------------------------------------
echo "--- GET /api/v1/team-members (valid key) ---"
curl -s -H "$AUTH_HEADER" "$BASE_URL/api/v1/team-members" | python3 -m json.tool
echo ""

# -----------------------------------------------------------------------
echo "--- GET /api/v1/1on1-prep?person_id=<id> (valid key) ---"
curl -s -H "$AUTH_HEADER" "$BASE_URL/api/v1/1on1-prep?person_id=$TEAM_MEMBER_ID" | python3 -m json.tool
echo ""

# -----------------------------------------------------------------------
echo "--- GET /api/v1/epic?id=<id> (valid key) ---"
curl -s -H "$AUTH_HEADER" "$BASE_URL/api/v1/epic?id=$EPIC_ID" | python3 -m json.tool
echo ""

# -----------------------------------------------------------------------
echo "--- GET /api/v1/team-members (invalid key — expect 401) ---"
curl -s -H "X-ClearGo-Key: wrong-key" "$BASE_URL/api/v1/team-members" | python3 -m json.tool
echo ""

# -----------------------------------------------------------------------
echo "--- GET /api/v1/1on1-prep (missing person_id — expect 400) ---"
curl -s -H "$AUTH_HEADER" "$BASE_URL/api/v1/1on1-prep" | python3 -m json.tool
echo ""

# -----------------------------------------------------------------------
echo "--- GET /api/v1/epic (missing id — expect 400) ---"
curl -s -H "$AUTH_HEADER" "$BASE_URL/api/v1/epic" | python3 -m json.tool
echo ""

echo "=== QA complete ==="
