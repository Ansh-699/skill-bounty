import { describe, it, expect, beforeEach } from "vitest";
import { pool } from "../src/db.js";
import { applyBatch } from "../src/writer.js";
import type { NormalizedTx } from "../src/types.js";

function finalizedTx(sig: string, slot: number, account: string, amount: string): NormalizedTx {
  return {
    signature: sig,
    slot,
    blockTime: 1_750_000_000,
    commitment: "finalized",
    raw: { sig },
    events: [{ instructionIndex: 0, kind: "token_transfer", account, mint: "USDC", amount }],
  };
}

beforeEach(async () => {
  await pool.query("TRUNCATE events, raw_transactions, outbox, dead_letter, indexer_cursor");
});

describe("analytics views", () => {
  it("account_balances reflects only finalized events after refresh", async () => {
    await applyBatch([
      finalizedTx("a1", 10, "dave", "100"),
      finalizedTx("a2", 11, "dave", "-30"),
    ]);
    await pool.query("REFRESH MATERIALIZED VIEW account_balances");
    const { rows } = await pool.query(
      `SELECT balance::text FROM account_balances WHERE account='dave' AND mint='USDC'`,
    );
    expect(rows[0]?.balance).toBe("70");
  });

  it("hourly_volume halves double-counted transfer sides", async () => {
    await applyBatch([finalizedTx("a3", 12, "alice", "40")]);
    await pool.query("REFRESH MATERIALIZED VIEW hourly_volume");
    const { rows } = await pool.query(
      `SELECT volume::float8 AS volume FROM hourly_volume WHERE mint='USDC'`,
    );
    expect(rows[0]?.volume).toBe(20);
  });
});
