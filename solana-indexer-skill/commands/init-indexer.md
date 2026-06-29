# /init-indexer

Interactively configure a Solana indexer project: collect every required
environment variable, generate a strong webhook secret, validate the result,
and write `.env` — so the "many env vars" never become a manual chore.

## Usage

```
/init-indexer
```

## What it does

1. Prompts for `DATABASE_URL`, `RPC_URL`, `WEBHOOK_AUTH_HEADER` (auto-generates a
   24-byte hex secret if left blank), `PORT`, and `API_PORT`.
2. Writes a clean `.env` (never overwrites without confirmation).
3. Hands off to `npm run migrate` and `npm run doctor` for verification.

Config is validated at runtime by `src/config.ts` (a `zod` schema). Any missing
or malformed variable fails fast with a human-readable message instead of a
cryptic driver error.

## Implementation

- Wizard: `examples/helius-webhook-postgres/scripts/init.mjs` (`npm run init`)
- Validation: `examples/helius-webhook-postgres/src/config.ts`

## Files referenced

- `skill/stack.md` — environment variable catalog
