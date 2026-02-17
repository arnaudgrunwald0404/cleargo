#!/bin/bash

# Test script for criteria nudge notifications
# Usage: ./test-criteria-nudges.sh [email]
# Example: ./test-criteria-nudges.sh agrunwald@clearcompany.com

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Get email from command line argument or use default
TEST_EMAIL="${1:-agrunwald@clearcompany.com}"
CRON_SECRET="${CRON_SECRET:-cc0621079a7b048f9e7a94695c3b0239c51ef9e941198488ec9b4ee8c4cd67f5}"
BASE_URL="${NEXT_PUBLIC_APP_URL:-https://cleargo.netlify.app}"

echo "🧪 Testing criteria nudge notifications for: $TEST_EMAIL"
echo "📍 Endpoint: $BASE_URL/api/jobs/criteria-nudges?test_email=$TEST_EMAIL"
echo ""

# Make the request
curl -X GET \
  "$BASE_URL/api/jobs/criteria-nudges?test_email=$TEST_EMAIL" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  | jq '.' 2>/dev/null || cat

echo ""
echo "✅ Test completed!"
