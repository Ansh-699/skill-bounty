# Backfill Patterns

How to catch up on historical data when you start a new indexer or recover
from an extended outage.

## Strategy 1: Standard RPC (getSignaturesForAddress + getTransaction)

Works with any Solana RPC. Pages newest → oldest using the `before` cursor.

```typescript
export async function backfill(address: string) {
  let before: string | undefined;
  for (;;) {
    const sigs = await rpc("getSignaturesForAddress", [
      address,
      { limit: 1000, before, commitment: "finalized" }
    ]);
    if (sigs.length === 0) break;

    for (const s of sigs) {
      const tx = await rpc("getTransaction", [
        s.signature,
        { maxSupportedTransactionVersion: 0, commitment: "finalized" }
      ]);
      if (!tx) continue;
      await applyBatch([normalize(tx)]);
    }
    before = sigs[sigs.length - 1].signature;
  }
}
```

**Params for `getSignaturesForAddress`:**
- `limit` — max 1000 per page
- `before` — signature to paginate from (exclusive)
- `until` — stop at this signature (exclusive)
- `commitment` — `finalized` recommended for backfill

**Important limitation:** Only returns transactions that *directly* reference
the address. Token account (ATA) transactions where the address is the owner
but not a signer won't appear. Use Helius `getTransactionsForAddress` for those.

## Strategy 2: Helius getTransactionsForAddress (faster, richer)

One call returns up to 1000 **full** parsed transactions with:
- Bidirectional sort (`asc` / `desc`)
- Time/slot/status filters
- Pagination via `before` cursor
- `tokenAccounts` filter for ATA history

```bash
curl -X POST "https://api.helius.dev/v0/addresses/<ADDRESS>/transactions?api-key=$KEY" \
  -H "Content-Type: application/json" \
  -d '{ "type": "TRANSFER", "before": "<LAST_SIG>" }'
```

Use this when:
- You need token account history (not just direct references)
- You want parsed data without a second `getTransaction` call
- Speed matters (1 call vs 1000+1 calls per page)

## Resumable Backfill

Make backfill resumable by persisting progress:

```typescript
// Before starting, check where we left off
const cursor = await pool.query(
  `SELECT last_signature FROM indexer_cursor WHERE name = 'backfill'`
);
let until = cursor.rows[0]?.last_signature;

// After each page, update the cursor
await withTx(async (c) => {
  for (const tx of page) await applyTransaction(c, tx);
  await c.query(
    `INSERT INTO indexer_cursor (name, last_slot, last_signature)
     VALUES ('backfill', $1, $2)
     ON CONFLICT (name) DO UPDATE SET last_slot = $1, last_signature = $2`,
    [lastSlot, lastSig]
  );
});
```

## Gap Detection

After backfill, verify no slots were skipped:

```sql
-- Find gaps in the slot sequence
WITH slots AS (
  SELECT DISTINCT slot FROM raw_transactions ORDER BY slot
),
gaps AS (
  SELECT slot, LEAD(slot) OVER (ORDER BY slot) AS next_slot
  FROM slots
)
SELECT slot, next_slot, (next_slot - slot) AS gap_size
FROM gaps
WHERE next_slot - slot > 1
ORDER BY gap_size DESC
LIMIT 20;
```

Gaps are normal (not every slot has transactions for your accounts), but
unusually large gaps may indicate missed data.

## Backfill + Live Overlap

When transitioning from backfill to live indexing:

1. Start the live listener **first** (it writes idempotently)
2. Run backfill until it catches up to the live listener's starting slot
3. The overlap region is safely deduplicated by the UPSERT logic

```
Timeline:
  |--- backfill (oldest → newest) --->|
                              |--- live (webhook/gRPC) --->
                              ^overlap (idempotent, safe)^
```

## Anti-patterns

- ❌ Backfilling at `confirmed` commitment → may include data that later reorgs
- ❌ Not rate-limiting RPC calls → 429 errors, IP bans
- ❌ Starting live listener after backfill completes → gap between backfill end and live start
- ❌ Assuming `getSignaturesForAddress` covers token account transactions
