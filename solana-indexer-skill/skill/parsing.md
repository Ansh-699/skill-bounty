# Transaction Parsing

How to decode raw Solana transactions into meaningful, typed events.

## Parsing Approaches

### 1. Helius Enhanced (pre-parsed)

If you're using Helius enhanced webhooks, you get parsed data for free:
- `tokenTransfers[]` — SPL token transfers with mint, amount, from, to
- `nativeTransfers[]` — SOL transfers with amount, from, to
- `accountData[]` — account state changes
- `events` — higher-level event classification

```typescript
export function normalizeHelius(raw: any): NormalizedTx {
  const events: NormalizedEvent[] = [];
  let ii = 0;

  for (const t of raw.tokenTransfers ?? []) {
    events.push({
      instructionIndex: ii++,
      kind: "token_transfer",
      account: t.toUserAccount,
      mint: t.mint,
      amount: String(t.tokenAmount),
      data: t,
    });
    // Mirror event for the sender (negative amount)
    events.push({
      instructionIndex: ii++,
      kind: "token_transfer",
      account: t.fromUserAccount,
      mint: t.mint,
      amount: String(-t.tokenAmount),
      data: t,
    });
  }
  // ... same for nativeTransfers
  return { signature: raw.signature, slot: raw.slot, events, raw, ... };
}
```

### 2. Anchor IDL Decoding (program-specific)

For custom programs built with Anchor, decode instructions using the IDL:

```typescript
import { BorshCoder, Idl } from "@coral-xyz/anchor";

const idl: Idl = JSON.parse(readFileSync("./idl/my_program.json", "utf8"));
const coder = new BorshCoder(idl);

function decodeInstruction(data: Buffer) {
  const decoded = coder.instruction.decode(data);
  if (!decoded) return null;
  return { name: decoded.name, args: decoded.data };
}

function decodeEvent(logMessage: string) {
  // Anchor events are base64-encoded in program logs
  const events = coder.events.decode(logMessage);
  return events;
}
```

> **Runnable implementation:** `examples/helius-webhook-postgres/src/decode-anchor.ts`
> provides `makeAnchorDecoder(idl, programId)` with `decodeInstructions` (walks
> top-level **and** inner/CPI instructions) and `decodeEvents` (decodes Anchor
> `Program data:` log events). Pair it with `src/normalize-anchor.ts`'s
> `normalizeAnchor(tx, decoder)` to feed typed events into the same idempotent
> writer. Instruction `data` from a default `getTransaction` is base58 — decode
> with `bs58` before `BorshInstructionCoder.decode`.

### 3. Raw Instruction Walking

For non-Anchor programs or when you need full control:

```typescript
function walkInstructions(tx: any): DecodedInstruction[] {
  const results: DecodedInstruction[] = [];
  const msg = tx.transaction.message;

  // Top-level instructions
  for (let i = 0; i < msg.instructions.length; i++) {
    const ix = msg.instructions[i];
    const programId = msg.accountKeys[ix.programIdIndex];
    results.push({
      index: i,
      programId: programId.toString(),
      data: Buffer.from(ix.data, "base64"),
      accounts: ix.accounts.map((a: number) => msg.accountKeys[a].toString()),
    });
  }

  // Inner instructions (CPIs)
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      results.push({
        index: inner.index,
        programId: msg.accountKeys[ix.programIdIndex].toString(),
        data: Buffer.from(ix.data, "base64"),
        accounts: ix.accounts.map((a: number) => msg.accountKeys[a].toString()),
        isInner: true,
      });
    }
  }

  return results;
}
```

## Token Metadata

Use the DAS API to enrich events with token metadata:

```bash
# Get asset info (name, symbol, image, etc.)
curl -X POST "https://mainnet.helius-rpc.com/?api-key=$KEY" \
  -H "Content-Type: application/json" \
  -d '{ "jsonrpc": "2.0", "id": 1, "method": "getAsset", "params": { "id": "<MINT>" } }'
```

**Cache aggressively** — token metadata rarely changes. Store in a
`token_metadata` table keyed by mint address.

```sql
CREATE TABLE IF NOT EXISTS token_metadata (
  mint     TEXT PRIMARY KEY,
  symbol   TEXT,
  name     TEXT,
  decimals INT,
  image    TEXT,
  data     JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Normalization Contract

All parsed data flows through a `NormalizedTx` type (see `types.ts`):

```typescript
type NormalizedEvent = {
  instructionIndex: number;  // unique within this tx
  kind: string;              // e.g. "token_transfer", "swap", "mint"
  account: string;           // affected account
  mint?: string;             // token mint (if applicable)
  amount?: string;           // signed string for precision
  data?: unknown;            // source-specific extra data
};

type NormalizedTx = {
  signature: string;
  slot: number;
  blockTime?: number;
  commitment?: "processed" | "confirmed" | "finalized";
  events: NormalizedEvent[];
  raw: unknown;              // always preserve the original
};
```

**Rule:** Always store the `raw` payload. You can re-parse later without
re-fetching from the chain.

## Anti-patterns

- ❌ Discarding the raw payload after parsing → can't fix parsing bugs retroactively
- ❌ Using floating-point for token amounts → precision loss
- ❌ Ignoring inner instructions → missing CPI events (swaps, liquidations)
- ❌ Hardcoding program IDs without a config map → fragile deployments
