# Ingestion Sources

How to get on-chain data into your indexer. Pick **one primary** source and
optionally add a secondary for redundancy.

## 1. Helius Enhanced Webhooks (recommended starting point)

**What:** Helius pushes parsed transaction data to your HTTP endpoint in real-time.
No polling. Built-in retry on 5xx. Easiest path to "something working."

**Create a webhook:**
```bash
curl -X POST "https://api.helius.dev/v0/webhooks?api-key=$HELIUS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookURL": "https://your-server.com/helius",
    "transactionTypes": ["ANY"],
    "accountAddresses": ["<PROGRAM_ID_OR_ACCOUNT>"],
    "webhookType": "enhanced",
    "authHeader": "your-secret-token"
  }'
```

**Verify inbound requests** by checking `req.header("authorization") === authHeader`.

**Webhook types:**
- `enhanced` — parsed, human-readable fields (tokenTransfers, nativeTransfers, etc.)
- `raw` — full RPC-style transaction object
- `enhancedDevnet` / `rawDevnet` — devnet equivalents
- `discord` — sends to a Discord channel webhook

**Payload shape (enhanced):**
Each delivery is an array of transaction objects:
```json
[{
  "signature": "5K7...",
  "slot": 280000000,
  "timestamp": 1719000000,
  "type": "TRANSFER",
  "tokenTransfers": [{ "mint": "EPjF...", "fromUserAccount": "A...", "toUserAccount": "B...", "tokenAmount": 100 }],
  "nativeTransfers": [{ "fromUserAccount": "A...", "toUserAccount": "B...", "amount": 1000000 }],
  "accountData": [...],
  "events": {...}
}]
```

**Key behaviors:**
- Delivers at `confirmed` commitment (not `finalized`). You must reconcile later.
- Retries on 4xx/5xx — your handler MUST be idempotent (see `reliability.md`).
- Batches: a single POST may contain multiple transactions.
- Only 200 OK = ACK. Return 200 only after durable write.

## 2. Yellowstone gRPC (high throughput, low latency)

**What:** Server-streaming gRPC subscription for blocks, transactions, accounts, slots.
Sub-second latency. Best for high-volume indexing.

**TS client:** `@triton-one/yellowstone-grpc` (v5.0.9)

```typescript
import { Client } from "@triton-one/yellowstone-grpc";

const client = new Client("https://your-grpc-endpoint", "your-token");
const stream = await client.subscribe();

stream.on("data", (update) => {
  if (update.transaction) {
    // process update.transaction
  }
});

// Send subscription request
stream.write({
  transactions: {
    myFilter: {
      accountInclude: ["<PROGRAM_ID>"],
      accountExclude: [],
      accountRequired: [],
    }
  },
  commitment: 1, // CONFIRMED
  slots: {},
  accounts: {},
  blocks: {},
  blocksMeta: {},
});
```

**Commitment enum values:** `0` = PROCESSED, `1` = CONFIRMED, `2` = FINALIZED

> **Runnable implementation:** `examples/helius-webhook-postgres/src/grpc-worker.ts`
> (`npm run grpc`). It normalizes each streamed transaction into the same
> `NormalizedTx` and calls the same `applyBatch` writer as the webhook path —
> demonstrating that ingestion sources are swappable behind one reliable writer.
> LaserStream is wire-compatible: point `GRPC_ENDPOINT` at a LaserStream
> endpoint and add `fromSlot` to the request for historical replay.

## 3. Helius LaserStream (Yellowstone + batteries)

**What:** Wire-compatible with Yellowstone gRPC but adds:
- **Auto-reconnect** with backoff
- **Historical replay** via `fromSlot` (up to ~24h / ~216k slots; older replays return finalized data)

```typescript
import { Helius } from "helius-laserstream";

const client = new Helius("your-api-key");
const stream = await client.subscribe({
  transactions: {
    myFilter: { accountInclude: ["<PROGRAM_ID>"] }
  },
  commitment: 1,
  fromSlot: 280000000, // replay from this slot
});
```

## 4. RPC Polling (simplest, lowest throughput)

**What:** Poll `getSignaturesForAddress` + `getTransaction` on a timer.
Works everywhere but high-latency and rate-limited.

Use for: development, low-volume accounts, or as a backup verifier.

```typescript
// Poll every N seconds
const sigs = await rpc("getSignaturesForAddress", [
  address, { limit: 100, commitment: "confirmed" }
]);
for (const s of sigs) {
  const tx = await rpc("getTransaction", [
    s.signature, { maxSupportedTransactionVersion: 0 }
  ]);
  // process tx
}
```

## Decision Matrix

| Source | Latency | Throughput | Complexity | Best For |
|---|---|---|---|---|
| Helius Webhook | ~1-3s | Medium | Low | Most apps, quick start |
| Yellowstone gRPC | <1s | Very High | Medium | High-volume, DeFi |
| LaserStream | <1s | Very High | Medium | gRPC + easy reconnect |
| RPC Polling | 5-30s | Low | Low | Dev/test, backup |

## Anti-patterns

- ❌ Don't use `Enhanced Transactions` parser API — it's **deprecated**. Use
  `getTransactionsForAddress` for history or `getTransaction` for single lookups.
- ❌ Don't ACK (return 200) before your durable write completes.
- ❌ Don't assume a single webhook POST = a single transaction (it's an array).
