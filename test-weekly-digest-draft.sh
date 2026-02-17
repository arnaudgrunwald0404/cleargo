#!/bin/bash

# Test script to send weekly digest draft for approval
# This sends a draft DM to the validator (DIGEST_VALIDATOR_EMAIL) with approval buttons

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

CRON_SECRET="${CRON_SECRET:-cc0621079a7b048f9e7a94695c3b0239c51ef9e941198488ec9b4ee8c4cd67f5}"
BASE_URL="${NEXT_PUBLIC_APP_URL:-https://cleargo.netlify.app}"
VALIDATOR_EMAIL="${DIGEST_VALIDATOR_EMAIL:-agrunwald@clearcompany.com}"

echo "📋 Sending weekly digest draft for approval..."
echo "📍 Endpoint: $BASE_URL/api/jobs/weekly-digest"
echo "👤 Validator: $VALIDATOR_EMAIL"
echo ""

# Make the request (without send_directly=true, it sends a draft to validator)
curl -X GET \
  "$BASE_URL/api/jobs/weekly-digest" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  | jq '.' 2>/dev/null || cat

echo ""
echo "✅ Draft sent! Check Slack DM for approval."
