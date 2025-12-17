#!/bin/bash
# Test script to simulate an Aha! webhook

WEBHOOK_URL="https://fructuously-unsystematised-anjanette.ngrok-free.dev/api/integrations/aha/webhook"

echo "Testing webhook endpoint: $WEBHOOK_URL"
echo ""

# Simulate an Aha! epic webhook payload
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "epic.updated",
    "epic": {
      "id": "TEST-123",
      "reference_num": "CLEAR-TEST-123",
      "name": "Test Epic from Script",
      "url": "https://clearco.aha.io/epics/TEST-123",
      "tags": ["LaunchConsole"],
      "assigned_to_user": {
        "email": "test@clearcompany.com"
      },
      "custom_fields": {
        "launch_tier": {
          "value": "Tier 2"
        }
      }
    }
  }'

echo ""
echo ""
echo "Check your terminal for webhook logs and http://localhost:3000/launches for the test epic"
