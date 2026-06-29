# Finality & Reorg Handling

Solana blocks can be rolled back until they reach `finalized` status.
Your indexer must handle this or risk serving stale/incorrect data.

## Commitment Levels

| Level | Meaning | Latency | Safety |
|---|---|---|---|
| `processed` | Node has seen the block | ~400ms | ❌ Can roll back anytime |
| `confirmed` | 66%+ of stake has voted | ~1-2s | ⚠️ Very rare rollback |
| `finalized` | 31+ blocks built on top | ~12-15s | ✅ Irreversible |

**Rule of thumb:**
- Display `confirmed` data in UIs (fast feedback)
- Use `finalized` for balance calculations and financial operations
- Never trust `processed` for anything durable

## The Reconciler Pattern

Since most data sources deliver at `confirmed` commitment (webhooks, gRPC),
you need a background process that:

1. Finds all rows with `commitment != 'finalized'`
2. Checks their current status via `getSignatureStatuses`
3. Promotes confirmed → finalized, or deletes reorged rows

```typescript
export async function reconcile() {
  // 1. Find non-finalized rows
  const { rows } = await pool.query(
    `SELECT signature FROM raw_transactions
     WHERE commitment <> 'finalized' LIMIT 500`
  );
  if (rows.length === 0) return;

  // 2. Batch-check their status
  const statuses = await rpc("getSignatureStatuses", [
    rows.map(r => r.signature),
    { searchTransactionHistory: true }
  ]);

  // 3. Promote or delete
  await withTx(async (c) => {
    for (let i = 0; i < rows.length; i++) {
      const st = statuses?.value?.[i];
      if (st?.confirmationStatus === "finalized") {
        // Promote to finalized
        await c.query(
          `UPDATE raw_transactions SET commitment='finalized' WHERE signature=$1`,
          [rows[i].signature]
        );
        await c.query(
          `UPDATE events SET commitment='finalized' WHERE signature=$1`,
          [rows[i].signature]
        );
      } else if (st === null) {
        // Reorged out — delete
        await c.query(`DELETE FROM events WHERE signature=$1`, [rows[i].signature]);
        await c.query(`DELETE FROM raw_transactions WHERE signature=$1`, [rows[i].signature]);
      }
      // else: still confirmed, check again later
    }
  });
}
```

## Slot-Based Rollback

For a more aggressive approach (e.g., after detecting a reorg via slot monitoring):

```sql
-- Delete everything above the last known finalized slot
DELETE FROM events WHERE slot > $1;
DELETE FROM raw_transactions WHERE slot > $1;
-- Reset the cursor
UPDATE indexer_cursor SET last_slot = $1 WHERE name = 'main';
```

Then re-ingest from `$1 + 1`. Idempotent writes make this safe.

## Querying with Finality Awareness

```sql
-- "Money-safe" balances: only finalized events
SELECT account, SUM(amount) AS balance
FROM events
WHERE commitment = 'finalized' AND mint = 'USDC'
GROUP BY account;

-- "Display" balances: include confirmed (faster, slight risk)
SELECT account, SUM(amount) AS balance
FROM events
WHERE commitment IN ('confirmed', 'finalized') AND mint = 'USDC'
GROUP BY account;
```

## Running the Reconciler

Run on a cron (every 30-60s) or as a continuous loop with a sleep interval:

```bash
# Cron
*/1 * * * * cd /app && npm run reconcile

# Or in your app
setInterval(() => reconcile().catch(console.error), 30_000);
```

## Anti-patterns

- ❌ Treating `confirmed` data as final for financial calculations
- ❌ No reconciler → stale rows accumulate forever
- ❌ Deleting reorged rows without also cleaning downstream aggregates
- ❌ Using `processed` commitment for anything persistent
