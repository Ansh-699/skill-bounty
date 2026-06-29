import { applyBatch } from "./writer.js";
import { config } from "./config.js";
import { normalizeHelius } from "./normalize.js";

const RPC = config.RPC_URL;

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

// Page newest -> oldest using the `before` cursor; resumable + idempotent.
export async function backfill(address: string) {
  let before: string | undefined;
  for (;;) {
    const sigs: any[] = await rpc("getSignaturesForAddress",
      [address, { limit: 1000, before, commitment: "finalized" }]);
    if (sigs.length === 0) break;

    for (const s of sigs) {
      const tx = await rpc("getTransaction",
        [s.signature, { maxSupportedTransactionVersion: 0, commitment: "finalized" }]);
      if (!tx) continue;
      // NOTE: backfill stores the RAW transaction only. To populate `events` (and thus
      // balances/analytics) for historical data, decode each tx with makeAnchorDecoder
      // + normalizeAnchor (see parsing.md) before applyBatch. Left raw here for brevity.
      await applyBatch([{
        signature: s.signature, slot: tx.slot, blockTime: tx.blockTime,
        commitment: "finalized",
        events: [], raw: tx,
      }]);
    }
    before = sigs[sigs.length - 1].signature;
  }
}

if (process.argv[2]) backfill(process.argv[2]).then(() => process.exit(0));
