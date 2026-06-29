#!/usr/bin/env bash
set -euo pipefail

# One-command demo: sends sample payload, verifies events, checks health.
# Usage: npm run demo  (or bash scripts/demo.sh)

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# Load auth header from .env
if [[ ! -f .env ]]; then
  echo "❌ .env not found. Run: cp .env.example .env"
  exit 1
fi
AUTH=$(grep WEBHOOK_AUTH_HEADER .env | cut -d= -f2)

echo "📤 Sending sample USDC transfer..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8080/helius \
  -H "content-type: application/json" \
  -H "authorization: $AUTH" \
  -d @samples/usdc-transfer.json)

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✅ Webhook accepted (HTTP $HTTP_CODE)"
else
  echo "❌ Webhook rejected (HTTP $HTTP_CODE)"
  exit 1
fi

echo ""
echo "📊 Events in database:"
docker compose exec -T postgres psql -U indexer -d indexer \
  -c "SELECT account, mint, amount::text FROM events ORDER BY id;"

echo ""
echo "🔄 Replaying same payload (idempotency test)..."
curl -s -o /dev/null \
  -X POST http://localhost:8080/helius \
  -H "content-type: application/json" \
  -H "authorization: $AUTH" \
  -d @samples/usdc-transfer.json

EVENT_COUNT=$(docker compose exec -T postgres psql -U indexer -d indexer -t \
  -c "SELECT COUNT(*)::int FROM events;" | tr -d ' ')
echo "✅ Event count after replay: $EVENT_COUNT (should still be 2)"

echo ""
echo "💚 Health check:"
curl -s http://localhost:8080/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8080/health
echo ""
