// Normalized shape our writer understands, independent of the source.
export type NormalizedEvent = {
  instructionIndex: number;
  kind: string;          // e.g. "transfer"
  account: string;       // affected account
  mint?: string;
  amount?: string;       // signed; string to preserve precision
  data?: unknown;
};

export type NormalizedTx = {
  signature: string;
  slot: number;
  blockTime?: number;
  commitment?: "processed" | "confirmed" | "finalized";
  events: NormalizedEvent[];
  raw: unknown;          // original payload, stored in raw_transactions
};
