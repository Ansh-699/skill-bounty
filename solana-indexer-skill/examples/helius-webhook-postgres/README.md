# helius-webhook-postgres (reference implementation)

Proves the solana-indexer-skill patterns end-to-end:
idempotent writes, cursor checkpointing, outbox, and reorg rollback.

## Run
1. `npm ci`                     — install dependencies (required first)
2. `docker compose up -d`       — Postgres + Redis
3. `cp .env.example .env` and fill RPC_URL + WEBHOOK_AUTH_HEADER (or: `npm run init`)
4. `npm run migrate`            — applies all migrations
5. `npm run doctor`             — verify env, DB, RPC, schema before indexing
6. `npm test`                   — run test suite (expect 6 passing)
7. `npm run dev`                — webhook server on :8080, POST Helius enhanced payloads to http://localhost:8080/helius

## Backfill
`npm run backfill <ADDRESS>`  (getSignaturesForAddress + getTransaction)

Backfill is raw transaction ingestion only; it stores canonical transaction rows and leaves event decoding to the live webhook path or a future IDL-backed decoder.

## Finality reconcile
`npm run reconcile`  (confirmed -> finalized; deletes reorged rows)
