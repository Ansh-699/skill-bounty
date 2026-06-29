import type { NormalizedTx } from "./types.js";
import type { AnchorDecoder } from "./decode-anchor.js";

export function normalizeAnchor(
  tx: any,
  decoder: AnchorDecoder,
  commitment: NormalizedTx["commitment"] = "finalized",
): NormalizedTx {
  const signature = tx?.transaction?.signatures?.[0] ?? tx?.signature;
  const events = [...decoder.decodeInstructions(tx), ...decoder.decodeEvents(tx)];
  return {
    signature,
    slot: tx?.slot,
    blockTime: tx?.blockTime ?? undefined,
    commitment,
    events,
    raw: tx,
  };
}
