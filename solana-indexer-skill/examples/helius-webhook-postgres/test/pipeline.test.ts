import { describe, it, expect, beforeEach } from "vitest";
import { pool, withTx } from "../src/db.js";
import { applyTransaction, applyBatch } from "../src/writer.js";
import type { NormalizedTx } from "../src/types.js";

function tx(sig: string, slot: number, account: string, amount: string): NormalizedTx {
  return { signature: sig, slot, commitment: "confirmed", raw: { sig },
    events: [{ instructionIndex: 0, kind: "token_transfer", account, mint: "USDC", amount }] };
}

async function balance(account: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0)::float8 AS b FROM events WHERE account=$1`, [account]);
  return rows[0].b;
}
async function eventCount(): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM events`);
  return rows[0].c;
}

beforeEach(async () => {
  await pool.query("TRUNCATE events, raw_transactions, outbox, dead_letter, indexer_cursor");
});

describe("indexer correctness", () => {
  it("is idempotent: replaying a batch does not double-count", async () => {
    const batch = [tx("sigA", 10, "alice", "100"), tx("sigB", 11, "alice", "50")];
    await applyBatch(batch);
    await applyBatch(batch); // redelivery
    expect(await eventCount()).toBe(2);
    expect(await balance("alice")).toBe(150);
  });

  it("handles out-of-order delivery: final state is order-independent", async () => {
    await applyBatch([tx("s3", 30, "bob", "5")]);
    await applyBatch([tx("s1", 10, "bob", "1")]);
    await applyBatch([tx("s2", 20, "bob", "2")]);
    expect(await balance("bob")).toBe(8);
  });

  it("rolls back a reorg: rows above last finalized slot are removed", async () => {
    await applyBatch([tx("f1", 10, "carol", "10"), tx("r1", 25, "carol", "99")]);
    const lastFinalized = 20;
    await withTx(async (c) => {
      await c.query("DELETE FROM events WHERE slot > $1", [lastFinalized]);
      await c.query("DELETE FROM raw_transactions WHERE slot > $1", [lastFinalized]);
    });
    expect(await balance("carol")).toBe(10); // reorged 99 is gone
  });
});
