import { pool, withTx } from "./db.js";
import { config } from "./config.js";

const RPC = config.RPC_URL;

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await r.json()).result;
}

// Promote confirmed rows to finalized; delete those that reorged out.
export async function reconcile() {
  const { rows } = await pool.query(
    `SELECT signature FROM raw_transactions WHERE commitment <> 'finalized' LIMIT 500`,
  );
  if (rows.length === 0) return;

  const statuses = await rpc("getSignatureStatuses", [
    rows.map((r) => r.signature),
    { searchTransactionHistory: true },
  ]);

  await withTx(async (c) => {
    // NOTE: a plain for-loop so each await stays INSIDE the transaction.
    for (let i = 0; i < rows.length; i++) {
      const sig = rows[i].signature;
      const st = statuses?.value?.[i];
      if (st?.confirmationStatus === "finalized") {
        await c.query(`UPDATE raw_transactions SET commitment='finalized' WHERE signature=$1`, [sig]);
        await c.query(`UPDATE events SET commitment='finalized' WHERE signature=$1`, [sig]);
      } else if (st === null) {
        // Not found at finalized -> reorged out. Remove it and its events.
        await c.query(`DELETE FROM events WHERE signature=$1`, [sig]);
        await c.query(`DELETE FROM raw_transactions WHERE signature=$1`, [sig]);
      }
      // else: still processed/confirmed -> leave for the next run.
    }
  });
}

if (process.argv[1]?.endsWith("reconciler.ts")) {
  reconcile()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
