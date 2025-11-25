#!/bin/bash

# Test KV Sync Function
# This script monitors the next hourly cron run

echo "🔄 KV Sync Test Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Current state
echo "📊 Current State:"
echo "  Time now: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Next cron run: $(date -v +1H '+%Y-%m-%d %H:00:00')"
echo ""

# Check KV before
echo "📦 KV State Before:"
cd "/Users/stephenlowisz/Documents/Github-Cursor/Revenue Institute/revenue-institute-email-tracking"
BEFORE=$(wrangler kv key list --binding=IDENTITY_STORE --preview=false 2>/dev/null | jq 'length')
echo "  Current entries: $BEFORE"
echo ""

# Wait for next hour
CURRENT_MIN=$(date '+%M')
WAIT_MIN=$((60 - CURRENT_MIN + 2))  # Wait until 2 min after hour
echo "⏰ Waiting $WAIT_MIN minutes for cron to run..."
echo "  (Cron runs at top of hour, checking at :02)"
echo ""

sleep ${WAIT_MIN}m

# Check KV after
echo "📦 KV State After:"
AFTER=$(wrangler kv key list --binding=IDENTITY_STORE --preview=false 2>/dev/null | jq 'length')
echo "  New entry count: $AFTER"
echo ""

# Compare
if [ "$AFTER" -gt "$BEFORE" ]; then
    echo "✅ SUCCESS! KV sync added $((AFTER - BEFORE)) new entries"
    echo ""
    echo "Testing personalization with new entry..."
    NEW_KEY=$(wrangler kv key list --binding=IDENTITY_STORE --preview=false 2>/dev/null | jq -r '.[0].name')
    curl -s "https://intel.revenueinstitute.com/personalize?vid=$NEW_KEY" | jq .
else
    echo "⚠️  No new entries added. Check logs:"
    echo "  https://dash.cloudflare.com → Workers → outbound-intent-engine → Logs"
fi

