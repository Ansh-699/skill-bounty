---
name: solana-indexer
description: >
  Production-grade Solana on-chain data indexing into databases.
  Covers idempotent writes, cursor checkpointing, reorg-safe finality,
  backfill, parsing, analytics schemas, and serving patterns.
  Addon to solana-dev-skill — no duplication.
---

# Solana Indexer Skill

> **What this skill does:** Makes any coding agent an expert at reliably indexing
> on-chain Solana data into a database and serving analytics — idempotent,
> cursor-checkpointed, and reorg-safe.

## Routing Table

Match the user's intent to the right file. Load **only** what's needed.

| Intent / Keywords | File | What it covers |
|---|---|---|
| "set up webhook", "listen to transactions", "gRPC stream", "LaserStream" | [`ingestion.md`](skill/ingestion.md) | All data sources: Helius webhooks, Yellowstone gRPC, LaserStream, RPC polling |
| "duplicate", "idempotent", "double-count", "replay safe" | [`reliability.md`](skill/reliability.md) | UPSERT patterns, cursor checkpointing, outbox, dead-letter |
| "reorg", "finalized", "commitment", "rollback stale data" | [`finality.md`](skill/finality.md) | Commitment levels, reconciler pattern, slot-based rollback |
| "backfill", "historical data", "catch up", "getSignaturesForAddress" | [`backfill.md`](skill/backfill.md) | Paginated backfill, gap detection, resumable cursors |
| "parse", "decode", "IDL", "instruction data", "Anchor" | [`parsing.md`](skill/parsing.md) | Anchor IDL decoding, inner instruction walking, token metadata |
| "schema", "analytics", "dashboard", "aggregation", "balance" | [`schema-analytics.md`](skill/schema-analytics.md) | Schema design, materialized views, time-series patterns |
| "API", "serve", "query", "REST", "GraphQL", "websocket" | [`serving.md`](skill/serving.md) | Serving indexed data: REST, GraphQL, WebSocket, caching |
| "stack", "infra", "deploy", "scale", "monitor" | [`stack.md`](skill/stack.md) | Tech stack choices, deployment, scaling, monitoring |
| "setup", "env", "config", "getting started", "validate config" | [`commands/init-indexer.md`](commands/init-indexer.md) | Interactive setup + zod env validation |
| "diagnose", "doctor", "healthcheck", "why is it failing" | [`commands/doctor.md`](commands/doctor.md) | Preflight checks for env, DB, RPC, schema, lag |
| "Helius API", "DAS", "webhook create", "getTransactionsForAddress" | [`resources.md`](skill/resources.md) | Verified 2026 API reference for Helius, Yellowstone, Solana RPC |

## Quick Start

```
# Install the skill
./install.sh -y

# In your project, ask your agent:
"Index every USDC transfer for this program into Postgres"
"My indexer is double-counting swaps — fix it"
"Set up a Helius webhook listener with reorg protection"
```

## Commands

| Command | Description |
|---|---|
| `/init-indexer` | Interactive env setup wizard (writes & validates `.env`) |
| `/scaffold-indexer` | Generate a starter indexer project |
| `/verify-pipeline` | Run correctness checks (idempotency, reorg, gaps) |
| `/doctor` | Preflight diagnostics (env, DB, RPC, schema, lag) |

## Example

See [`examples/helius-webhook-postgres/`](examples/helius-webhook-postgres/) for
a runnable reference implementation with tests proving idempotency, out-of-order
safety, and reorg rollback.
