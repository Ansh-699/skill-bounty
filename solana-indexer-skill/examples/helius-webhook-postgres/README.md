# helius-webhook-postgres (reference implementation)

Proves the solana-indexer-skill patterns end-to-end:
idempotent writes, cursor checkpointing, outbox, and reorg rollback.

## Run
1. `docker compose up -d`
2. `cp .env.example .env` and fill RPC_URL + WEBHOOK_AUTH_HEADER
3. `npm install && npm run migrate`
4. `npm run dev`  -> POST Helius enhanced payloads to http://localhost:8080/helius
5. `npm test`     -> idempotency / out-of-order / reorg tests

## Backfill
`npm run backfill <ADDRESS>`  (getSignaturesForAddress + getTransaction)

Backfill is raw transaction ingestion only; it stores canonical transaction rows and leaves event decoding to the live webhook path or a future IDL-backed decoder.

## Finality reconcile
`npm run reconcile`  (confirmed -> finalized; deletes reorged rows)
