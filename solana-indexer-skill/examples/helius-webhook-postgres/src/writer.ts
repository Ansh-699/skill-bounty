import type { PoolClient } from "pg";
import { withTx } from "./db.js";
import type { NormalizedTx } from "./types.js";

const CURSOR = "main";

// Apply ONE transaction idempotently. Safe to call any number of times.
export async function applyTransaction(c: PoolClient, tx: NormalizedTx) {
  const commitment = tx.commitment ?? "confirmed";

  // 1) RAW layer — dedupe on signature.
  await c.query(
    `INSERT INTO raw_transactions (signature, slot, block_time, commitment, payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (signature) DO NOTHING`,
    [tx.signature, tx.slot, tx.blockTime ?? null, commitment, JSON.stringify(tx.raw)]
  );

  // 2) Events — dedupe on (signature, instruction_index). Outbox only on first insert.
  for (const ev of tx.events) {
    const res = await c.query(
      `INSERT INTO events
         (signature, instruction_index, slot, block_time, kind, account, mint, amount, commitment, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (signature, instruction_index) DO NOTHING
       RETURNING id`,
      [tx.signature, ev.instructionIndex, tx.slot, tx.blockTime ?? null,
       ev.kind, ev.account, ev.mint ?? null, ev.amount ?? null, commitment,
       ev.data ? JSON.stringify(ev.data) : null]
    );
    if ((res.rowCount ?? 0) > 0) {
      await c.query(
        `INSERT INTO outbox (topic, payload) VALUES ($1, $2)`,
        ["event.indexed", JSON.stringify({ signature: tx.signature, ii: ev.instructionIndex })]
      );
    }
  }

  // 3) Advance cursor in the SAME tx so progress can never outrun data.
  await c.query(
    `INSERT INTO indexer_cursor (name, last_slot, last_signature, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (name) DO UPDATE
       SET last_slot = GREATEST(indexer_cursor.last_slot, EXCLUDED.last_slot),
           last_signature = EXCLUDED.last_signature,
           updated_at = now()`,
    [CURSOR, tx.slot, tx.signature]
  );
}

// Convenience: apply a batch atomically.
export async function applyBatch(txs: NormalizedTx[]) {
  await withTx(async (c) => {
    for (const tx of txs) await applyTransaction(c, tx);
  });
}
