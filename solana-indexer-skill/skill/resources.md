# Verified API Reference (2026)

> Confirmed against current documentation. Use these exact names in skill files
> and generated code. No guessing.

## Helius Webhooks

### Create Webhook
```
POST https://api.helius.dev/v0/webhooks?api-key=KEY
```

**Body fields:**
| Field | Type | Description |
|---|---|---|
| `webhookURL` | string | Your HTTPS endpoint |
| `transactionTypes` | string[] | e.g. `["ANY"]`, `["TRANSFER"]` |
| `accountAddresses` | string[] | Accounts to watch |
| `webhookType` | string | `enhanced` \| `raw` \| `enhancedDevnet` \| `rawDevnet` \| `discord` |
| `authHeader` | string | Shared secret for verification |

**Verify inbound:** Match `req.header("authorization")` against your `authHeader`.

**Docs:** [Create Webhook](https://docs.helius.dev/webhooks-and-websockets/webhooks)

---

## Helius Transaction APIs

### ⚠️ Enhanced Transactions Parser API — DEPRECATED
Do **not** use. For history: use `getTransactionsForAddress`. For single lookups: use `getTransaction`.

**Docs:** [Enhanced Transactions overview](https://docs.helius.dev/solana-apis/enhanced-transactions-api)

### getTransactionsForAddress (Helius-exclusive, faster backfill)
```
POST https://api.helius.dev/v0/addresses/<ADDRESS>/transactions?api-key=KEY
```

Returns up to 1000 full parsed transactions per call with:
- Bidirectional sort (`asc` / `desc`)
- Time/slot/status filters
- Pagination via `before` cursor
- `tokenAccounts` filter for ATA history

**Docs:** [getTransactionsForAddress](https://docs.helius.dev/solana-apis/enhanced-transactions-api/parsed-transaction-history)

---

## Solana RPC

### getSignaturesForAddress (standard backfill)
```
RPC method: "getSignaturesForAddress"
Params: [address, { before?, until?, limit?, commitment? }]
```
- `limit`: max 1000
- `commitment`: `finalized` recommended for backfill
- **Limitation:** Only returns txns that directly reference the address (not its token accounts)

**Docs:** [getSignaturesForAddress](https://solana.com/docs/rpc/http/getsignaturesforaddress)

### getTransaction
```
RPC method: "getTransaction"
Params: [signature, { maxSupportedTransactionVersion: 0, commitment? }]
```
**Important:** Must set `maxSupportedTransactionVersion: 0` or versioned txns return null.

### getSignatureStatuses
```
RPC method: "getSignatureStatuses"
Params: [signatures[], { searchTransactionHistory: true }]
```
Returns `confirmationStatus`: `"processed"` | `"confirmed"` | `"finalized"` or `null` (not found / reorged).

---

## DAS API (Digital Asset Standard)

### Methods
| Method | Description |
|---|---|
| `getAsset` | Single asset by mint/ID |
| `getAssetsByOwner` | All assets for a wallet |
| `searchAssets` | Filter by `tokenType`: `fungible` \| `nonFungible` \| `regularNFT` \| `compressedNFT` \| `all` |
| `getSignaturesForAsset` | Transaction history for an asset |

- Max 1000 records/page
- Supports page-based or keyset pagination

**Docs:** [DAS API](https://docs.helius.dev/solana-apis/digital-asset-standard-das-api)

---

## Streaming: Yellowstone gRPC

### TypeScript Client
Package: `@triton-one/yellowstone-grpc` (v5.0.9)

```typescript
import { Client } from "@triton-one/yellowstone-grpc";

const client = new Client(endpoint, token);
const stream = await client.subscribe();

stream.write({
  transactions: {
    myFilter: {
      accountInclude: ["<PROGRAM_ID>"],
      accountExclude: [],
      accountRequired: [],
    }
  },
  commitment: 1,  // CONFIRMED
  accounts: {},
  slots: {},
  blocks: {},
  blocksMeta: {},
});
```

### Rust Client
Crate: `yellowstone-grpc-client` (`GeyserGrpcClient`)

**Docs:** [Dragon's Mouth / Yellowstone](https://docs.triton.one/project-yellowstone/dragons-mouth-grpc-subscriptions)

---

## Streaming: Helius LaserStream

Wire-compatible with Yellowstone gRPC. Adds:
- **Auto-reconnect** with backoff
- **Historical replay** via `fromSlot` (~24h / ~216k slots)
  - Older replays return finalized data

SDK: `helius-laserstream`

```typescript
import { Helius } from "helius-laserstream";

const client = new Helius("your-api-key");
const stream = await client.subscribe({
  transactions: {
    myFilter: { accountInclude: ["<PROGRAM_ID>"] }
  },
  commitment: 1,
  fromSlot: 280000000,
});
```

**Docs:**
- [LaserStream gRPC](https://docs.helius.dev/solana-apis/laserstream)
- [Historical replay](https://docs.helius.dev/solana-apis/laserstream#historical-replay)

---

## Solana Commitment Levels

| Level | Description | Latency | Reversible? |
|---|---|---|---|
| `processed` | Node has seen the block | ~400ms | ✅ Yes |
| `confirmed` | 66%+ of stake has voted | ~1-2s | ⚠️ Very rare |
| `finalized` | 31+ blocks built on top | ~12-15s | ❌ No |

**Docs:** [Commitment status](https://docs.solana.com/developing/clients/jsonrpc-api#configuring-state-commitment)
