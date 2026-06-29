import type { NormalizedTx, NormalizedEvent } from "./types.js";

// Helius "enhanced" webhook delivers an array of parsed tx objects with fields:
// signature, slot, timestamp, type, tokenTransfers[], nativeTransfers[], ...
export function normalizeHelius(raw: any): NormalizedTx {
  const events: NormalizedEvent[] = [];
  let ii = 0;

  for (const t of raw.tokenTransfers ?? []) {
    // Prefer the raw base-unit string when present (money-safe); fall back to UI amount.
    const raw_amt =
      t.rawTokenAmount?.tokenAmount != null
        ? String(t.rawTokenAmount.tokenAmount)
        : String(t.tokenAmount);
    const neg = raw_amt.startsWith("-") ? raw_amt.slice(1) : `-${raw_amt}`;
    events.push({ instructionIndex: ii++, kind: "token_transfer",
      account: t.toUserAccount, mint: t.mint, amount: raw_amt, data: t });
    events.push({ instructionIndex: ii++, kind: "token_transfer",
      account: t.fromUserAccount, mint: t.mint, amount: neg, data: t });
  }
  for (const n of raw.nativeTransfers ?? []) {
    events.push({ instructionIndex: ii++, kind: "sol_transfer",
      account: n.toUserAccount, mint: "SOL", amount: String(n.amount), data: n });
    events.push({ instructionIndex: ii++, kind: "sol_transfer",
      account: n.fromUserAccount, mint: "SOL", amount: String(-n.amount), data: n });
  }

  return {
    signature: raw.signature,
    slot: raw.slot,
    blockTime: raw.timestamp,
    commitment: "confirmed",
    events,
    raw,
  };
}
