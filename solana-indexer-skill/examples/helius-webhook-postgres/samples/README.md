# Sample Payloads

Pre-built Helius enhanced webhook payloads for testing the indexer without a live webhook.

## Files

| File | Description |
|---|---|
| `usdc-transfer.json` | Single USDC transfer (125.5 USDC, sender → recipient). Produces 2 events. |

## Usage

With the server running (`npm run dev`):

```bash
curl -X POST http://localhost:8080/helius \
  -H "content-type: application/json" \
  -H "authorization: $(grep WEBHOOK_AUTH_HEADER .env | cut -d= -f2)" \
  -d @samples/usdc-transfer.json
```

Or use the one-command demo:

```bash
npm run demo
```

## Verify

```bash
docker compose exec postgres psql -U indexer -d indexer \
  -c "SELECT account, mint, amount FROM events ORDER BY id;"
```

Expected output: two rows — recipient `+125.5`, sender `-125.5`.

Run the same curl again → still two rows = **idempotency proven live**.
