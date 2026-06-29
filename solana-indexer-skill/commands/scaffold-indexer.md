# /scaffold-indexer

Generate a starter Solana indexer project with all the reliability patterns
baked in.

## Usage

```
/scaffold-indexer
```

## What it generates

A complete project structure in the current directory:

```
├── docker-compose.yml         # Postgres + Redis
├── .env.example               # Required environment variables
├── package.json               # Dependencies + scripts
├── tsconfig.json              # TypeScript config
├── migrations/
│   └── 001_init.sql           # Core tables (cursor, raw_transactions, events, outbox, dead_letter)
├── src/
│   ├── db.ts                  # Connection pool + withTx helper
│   ├── types.ts               # NormalizedTx, NormalizedEvent
│   ├── writer.ts              # Idempotent writer + cursor + outbox
│   ├── normalize.ts           # Helius enhanced → NormalizedTx
│   ├── webhook-server.ts      # Express webhook handler
│   ├── backfill.ts            # getSignaturesForAddress paginator
│   ├── reconciler.ts          # confirmed → finalized promoter
│   └── migrate.ts             # Migration runner
└── test/
    └── pipeline.test.ts       # Idempotency + reorg tests
```

## Customization prompts

After scaffolding, the agent will ask:
1. What program/accounts are you indexing?
2. What events do you care about? (transfers, swaps, mints, etc.)
3. Do you need a serving layer? (REST API, WebSocket, etc.)
4. What's your expected throughput? (determines webhook vs gRPC)

## Implementation

The scaffold uses the reference implementation from
`examples/helius-webhook-postgres/` as the template, with placeholders
for program-specific configuration.

## Files referenced

- `skill/ingestion.md` — data source setup
- `skill/reliability.md` — writer patterns
- `skill/finality.md` — reconciler setup
- `skill/stack.md` — project structure
