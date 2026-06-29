# /verify-pipeline

Run correctness checks against an indexer pipeline to prove it handles
the three critical failure modes: duplicates, missed data, and reorgs.

## Usage

```
/verify-pipeline
```

## What it checks

### 1. Idempotency Test
Replays the same batch of transactions twice and verifies:
- Event count does not increase on replay
- Balances remain unchanged after replay
- Outbox entries are not duplicated

### 2. Out-of-Order Test
Processes transactions in non-sequential slot order and verifies:
- Final state is independent of processing order
- Cursor reflects the highest slot seen

### 3. Reorg Rollback Test
Inserts events at multiple slots, then simulates a reorg by deleting
everything above a finalized slot threshold and verifies:
- Only finalized events remain
- Balances reflect only finalized data

### 4. Gap Detection
Runs a SQL query to find unusually large gaps in the slot sequence:
```sql
WITH slots AS (SELECT DISTINCT slot FROM raw_transactions ORDER BY slot),
gaps AS (SELECT slot, LEAD(slot) OVER (ORDER BY slot) AS next_slot FROM slots)
SELECT slot, next_slot, (next_slot - slot) AS gap_size
FROM gaps WHERE next_slot - slot > 1000
ORDER BY gap_size DESC LIMIT 10;
```

### 5. Dead Letter Check
Verifies that the dead letter queue is being used (not silently swallowing errors):
```sql
SELECT COUNT(*) AS dlq_count,
       MAX(created_at) AS latest
FROM dead_letter;
```

## Output

```
✅ Idempotency: PASS (2 events, balance=150, no change on replay)
✅ Out-of-order: PASS (balance=8, order-independent)
✅ Reorg rollback: PASS (balance=10, reorged event removed)
⚠️ Gap detection: 2 gaps > 1000 slots (review recommended)
✅ Dead letter: 0 entries (clean)
```

## Prerequisites

- Running Postgres with migrated schema
- `DATABASE_URL` environment variable set

## Files referenced

- `test/pipeline.test.ts` — the actual test implementations
- `skill/reliability.md` — patterns being verified
- `skill/finality.md` — reorg handling being verified
