# solana-indexer-skill

Tests (idempotency, out-of-order delivery, reorg rollback, analytics, anchor decoder) run via
GitHub Actions (Postgres service + Vitest). See `.github/workflows/ci.yml`.


Production-grade Solana on-chain data indexing & analytics skill for
Claude Code / Codex.

## What it does

Makes any coding agent an expert at reliably indexing on-chain Solana data
into a database and serving analytics — **idempotent**, **cursor-checkpointed**,
and **reorg-safe**.

The three things that normally break — and that this skill gets right:

1. **Duplicates.** Blockchain data sources deliver the same event more than once.
   → We key every write on the transaction `signature` and **UPSERT**, so replays
   are harmless.

2. **Missed data on restart.** If your worker crashes, naïve code loses its place.
   → We persist a **cursor** (last processed slot) in the same DB transaction as
   the data, so restart resumes exactly where it left off.

3. **Reorgs.** Solana can drop a not-yet-finalized block. → We store the **slot**
   on every row and only treat **`finalized`** data as money-safe, rolling back
   anything above the last finalized slot.

## Install

```bash
# Standard (to ~/.claude/skills/solana-indexer/)
./install.sh -y

# Custom path
./install-custom.sh
```

## Usage

After installation, ask your agent in plain English:

- *"Index every USDC transfer for this program into Postgres"*
- *"My indexer is double-counting swaps — fix it."*
- *"Set up a Helius webhook listener with reorg protection"*

### Commands

| Command | Description |
|---|---|
| `/init-indexer` | Interactive env setup wizard (writes & validates `.env`) |
| `/scaffold-indexer` | Generate a starter indexer project |
| `/verify-pipeline` | Run correctness checks (idempotency, reorg, gaps) |
| `/doctor` | Preflight diagnostics (env, DB, RPC, schema, lag) |

## What's included

```
SKILL.md                           # Router — maps intent to the right file
.gitignore                         # Prevents committing secrets/deps
.github/
└── workflows/
    └── ci.yml                     # CI workflow for automated testing
skill/
├── ingestion.md                   # Helius webhooks, Yellowstone gRPC, LaserStream, RPC polling
├── reliability.md                 # Idempotent writes, cursor checkpointing, outbox, dead-letter
├── finality.md                    # Commitment levels, reconciler, reorg rollback
├── backfill.md                    # Paginated backfill, gap detection, resumable cursors
├── parsing.md                     # Anchor IDL decoding, instruction walking, token metadata
├── schema-analytics.md            # Schema design, materialized views, time-series
├── serving.md                     # REST, GraphQL, WebSocket, caching, pagination
├── stack.md                       # Tech stack, deployment, scaling, monitoring
└── resources.md                   # Verified 2026 API reference (Helius, Yellowstone, Solana)
agents/
├── indexer-architect.md           # Designs indexer architectures
└── pipeline-engineer.md           # Implements and debugs pipelines
commands/
├── init-indexer.md                # /init-indexer command doc
├── scaffold-indexer.md            # /scaffold-indexer command
├── verify-pipeline.md             # /verify-pipeline command
└── doctor.md                      # /doctor command doc
examples/
└── helius-webhook-postgres/       # Runnable reference implementation
    ├── package.json
    ├── docker-compose.yml
    ├── .env.example
    ├── idl/
    │   └── README.md              # Instructions for program IDLs
    ├── migrations/
    │   ├── 001_init.sql           # Core tables migration
    │   └── 002_analytics.sql      # Materialized views migration
    ├── scripts/
    │   └── init.mjs               # Interactive env setup wizard
    ├── src/
    │   ├── config.ts              # Zod config validation
    │   ├── db.ts                  # Pool + withTx (zod config aware)
    │   ├── types.ts               # NormalizedTx, NormalizedEvent
    │   ├── writer.ts              # Idempotent writer (the heart)
    │   ├── decode-anchor.ts       # Anchor IDL decoder
    │   ├── normalize-anchor.ts    # Anchor IDL normalizer
    │   ├── normalize.ts           # Helius → NormalizedTx
    │   ├── webhook-server.ts      # Express webhook handler
    │   ├── grpc-worker.ts         # Yellowstone gRPC worker
    │   ├── api.ts                 # Read API server (REST)
    │   ├── doctor.ts              # Preflight diagnostic checks
    │   ├── refresh.ts             # Materialized view refresher
    │   ├── backfill.ts            # Historical backfill
    │   ├── reconciler.ts          # confirmed → finalized
    │   └── migrate.ts             # Dynamic migration runner
    ├── test/
    │   ├── pipeline.test.ts       # Correctness tests
    │   ├── analytics.test.ts      # Materialized view tests
    │   └── decode-anchor.test.ts  # Anchor decoder smoke test
    └── README.md
```

## Run the example

```bash
cd examples/helius-webhook-postgres
npm ci                                        # install dependencies (required first)
docker compose up -d                          # Postgres + Redis
cp .env.example .env                          # or: npm run init  (interactive setup)
npm run migrate                               # applies all migrations
npm run doctor                                # verify env, DB, RPC, schema before indexing
npm test                                      # run test suite (expect 6 passing)
npm run dev                                   # webhook server on :8080
```

## Fit with the Solana AI Kit

- **Addon** to `solana-dev-skill` (no duplication)
- **Progressive disclosure** via `SKILL.md` routing table for token efficiency
- **Pairs** with the kit's Helius MCP (DAS/webhooks)
- **MIT licensed** and submodule-ready

## API Reference

All API names verified against current (2026) documentation:
- Helius: webhooks, getTransactionsForAddress, DAS API
- Yellowstone gRPC: `@triton-one/yellowstone-grpc` v5.0.9
- Helius LaserStream: `helius-laserstream` SDK
- Solana: commitment levels, getSignaturesForAddress, getTransaction

See [skill/resources.md](skill/resources.md) for the complete reference.

## License

MIT
