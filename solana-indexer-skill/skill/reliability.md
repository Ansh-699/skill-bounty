# Reliability Patterns

The three guarantees every production indexer must provide:
**no duplicates**, **no missed data**, **no phantom side-effects**.

## 1. Idempotent Writes (UPSERT on signature)

Every blockchain event is uniquely identified by its transaction `signature`
(+ `instruction_index` for multi-event txns). Key all writes on this pair.

```sql
-- Raw transactions: dedupe on signature
INSERT INTO raw_transactions (signature, slot, block_time, commitment, payload)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (signature) DO NOTHING;

-- Events: dedupe on (signature, instruction_index)
INSERT INTO events (signature, instruction_index, slot, block_time, kind, account, mint, amount, commitment, data)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT (signature, instruction_index) DO NOTHING
RETURNING id;
```

**Why `DO NOTHING` not `DO UPDATE`?** On-chain data is immutable. If we already
have it, there's nothing to update. `DO NOTHING` is cheaper and avoids
write-amplification.

**Rule:** If `RETURNING id` returns no row, the event was a replay → skip
all downstream side-effects for that event.

## 2. Cursor Checkpointing (no missed data on restart)

Persist *how far you've processed* in the **same database transaction** as the
data itself. This guarantees atomicity: either both the data and the cursor
advance, or neither does.

```sql
INSERT INTO indexer_cursor (name, last_slot, last_signature, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (name) DO UPDATE
  SET last_slot = GREATEST(indexer_cursor.last_slot, EXCLUDED.last_slot),
      last_signature = EXCLUDED.last_signature,
      updated_at = now();
```

**Why `GREATEST`?** Out-of-order delivery means you might process slot 100
before slot 95. The cursor should only ever move forward.

**On restart:** Read the cursor, pass its `last_signature` or `last_slot`
to your data source as the resume point.

## 3. Transactional Outbox (no phantom side-effects)

Side-effects (notifications, webhook fan-out, cache invalidation) must be
written in the **same transaction** as the event, but dispatched **asynchronously**
by a separate poller.

```sql
-- Written inside the same tx as the event INSERT
INSERT INTO outbox (topic, payload) VALUES ($1, $2);
```

A separate worker polls `outbox` and dispatches:
```sql
UPDATE outbox SET status = 'processing', attempts = attempts + 1
WHERE id = (SELECT id FROM outbox WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING *;
```

After successful dispatch: `UPDATE outbox SET status = 'done' WHERE id = $1`
After failure: leave as `pending` (or `failed` after N attempts) for retry.

**Why not dispatch inline?** If the dispatch fails, you'd have to roll back the
data write too. The outbox decouples "record the intent" from "execute the intent."

## 4. Dead Letter Queue

Payloads that can't be parsed or processed go to `dead_letter` instead of
crashing the pipeline:

```sql
INSERT INTO dead_letter (source, payload, error) VALUES ($1, $2, $3);
```

Monitor `dead_letter` row count. Review and replay manually or automatically
after fixing the parser.

## 5. Putting It All Together

Every ingestion handler follows this pattern:

```typescript
await withTx(async (c) => {
  // 1. UPSERT raw transaction (dedupe)
  // 2. UPSERT each event (dedupe), outbox on first insert only
  // 3. Advance cursor (GREATEST)
  // Any exception → full ROLLBACK, nothing is half-written
});
// 4. ACK the source (return 200 / advance gRPC offset)
```

See [`examples/helius-webhook-postgres/src/writer.ts`](../examples/helius-webhook-postgres/src/writer.ts)
for the full implementation.

## Anti-patterns

- ❌ ACK before durable write → lost data on crash
- ❌ Cursor in a separate transaction → data written but cursor not advanced (or vice versa)
- ❌ Inline side-effects → partial dispatch on failure
- ❌ Swallowing parse errors silently → invisible data loss
- ❌ Using `INSERT` without `ON CONFLICT` → duplicate key errors on redelivery
