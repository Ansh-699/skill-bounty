# Schema Design & Analytics

How to structure your database for both reliable ingestion and fast queries.

## Three-Layer Architecture

```
┌─────────────────┐
│   RAW LAYER     │  raw_transactions — immutable, keyed by signature
├─────────────────┤
│  EVENT LAYER    │  events — decoded, keyed by (signature, instruction_index)
├─────────────────┤
│ ANALYTICS LAYER │  materialized views, aggregates, balances
└─────────────────┘
```

### Raw Layer (source of truth)

```sql
CREATE TABLE raw_transactions (
  signature   TEXT PRIMARY KEY,
  slot        BIGINT NOT NULL,
  block_time  BIGINT,
  commitment  TEXT NOT NULL DEFAULT 'confirmed',
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX raw_tx_slot_idx ON raw_transactions (slot);
```

**Why keep it?** You can always re-derive events from raw data if your parsing
logic changes. Never delete raw data (only mark reorged rows).

### Event Layer (decoded, queryable)

```sql
CREATE TABLE events (
  id                BIGSERIAL PRIMARY KEY,
  signature         TEXT NOT NULL,
  instruction_index INT NOT NULL DEFAULT 0,
  slot              BIGINT NOT NULL,
  block_time        BIGINT,
  kind              TEXT NOT NULL,      -- e.g. "token_transfer", "swap"
  account           TEXT,               -- affected account
  mint              TEXT,               -- token mint
  amount            NUMERIC,            -- signed (+ for inflow, - for outflow)
  commitment        TEXT NOT NULL DEFAULT 'confirmed',
  data              JSONB,              -- extra parsed data
  UNIQUE (signature, instruction_index)
);
CREATE INDEX events_slot_idx    ON events (slot);
CREATE INDEX events_account_idx ON events (account);
CREATE INDEX events_kind_idx    ON events (kind);
CREATE INDEX events_mint_idx    ON events (mint) WHERE mint IS NOT NULL;
```

### Analytics Layer (derived, refreshable)

> **Runnable implementation:** `migrations/002_analytics.sql` defines the
> `account_balances` and `hourly_volume` materialized views (with unique
> indexes for `REFRESH ... CONCURRENTLY`); refresh them with `npm run refresh`.

Build materialized views or summary tables on top of the event layer.

## Common Analytics Patterns

### Token Balances

```sql
-- Current balance per account per mint (finalized only for safety)
CREATE MATERIALIZED VIEW account_balances AS
SELECT
  account,
  mint,
  SUM(amount) AS balance,
  MAX(slot) AS last_slot,
  COUNT(*) AS tx_count
FROM events
WHERE commitment = 'finalized'
GROUP BY account, mint;

-- Refresh after each reconcile run
REFRESH MATERIALIZED VIEW CONCURRENTLY account_balances;
```

### Time-Series Aggregates

```sql
-- Hourly volume by mint
CREATE MATERIALIZED VIEW hourly_volume AS
SELECT
  date_trunc('hour', to_timestamp(block_time)) AS hour,
  mint,
  SUM(ABS(amount)) / 2 AS volume,  -- divide by 2 because we have both sides
  COUNT(DISTINCT signature) AS tx_count
FROM events
WHERE kind IN ('token_transfer', 'sol_transfer')
  AND commitment = 'finalized'
  AND block_time IS NOT NULL
GROUP BY 1, 2;
```

### Top Accounts

```sql
-- Most active accounts in the last 24h
SELECT account, COUNT(*) AS event_count, COUNT(DISTINCT signature) AS tx_count
FROM events
WHERE block_time > EXTRACT(EPOCH FROM now() - INTERVAL '24 hours')
GROUP BY account
ORDER BY event_count DESC
LIMIT 50;
```

### Program-Specific Events

```sql
-- For a DeFi protocol: track swaps
CREATE TABLE swaps (
  id          BIGSERIAL PRIMARY KEY,
  signature   TEXT NOT NULL,
  slot        BIGINT NOT NULL,
  pool        TEXT NOT NULL,
  token_in    TEXT NOT NULL,
  amount_in   NUMERIC NOT NULL,
  token_out   TEXT NOT NULL,
  amount_out  NUMERIC NOT NULL,
  user_wallet TEXT NOT NULL,
  commitment  TEXT NOT NULL DEFAULT 'confirmed',
  UNIQUE (signature)
);
```

## Indexing Strategy

| Query Pattern | Index |
|---|---|
| "All events for account X" | `events(account)` |
| "Events in slot range" | `events(slot)` |
| "Token transfers for mint Y" | `events(mint) WHERE mint IS NOT NULL` |
| "Recent events by kind" | `events(kind, slot DESC)` |
| "Non-finalized for reconciler" | `raw_transactions(commitment) WHERE commitment <> 'finalized'` |

## Partitioning (for scale)

When the `events` table exceeds ~100M rows, partition by slot range:

```sql
CREATE TABLE events (
  -- same columns
) PARTITION BY RANGE (slot);

CREATE TABLE events_p0 PARTITION OF events FOR VALUES FROM (0) TO (100000000);
CREATE TABLE events_p1 PARTITION OF events FOR VALUES FROM (100000000) TO (200000000);
-- etc.
```

## Anti-patterns

- ❌ Using `FLOAT` for amounts → precision loss on large token supplies
- ❌ No raw layer → can't re-derive when parsing logic changes
- ❌ Refreshing materialized views synchronously in the write path → latency spike
- ❌ Missing composite unique constraint on events → duplicates on replay
- ❌ Storing commitment as boolean `is_finalized` → can't distinguish processed/confirmed
