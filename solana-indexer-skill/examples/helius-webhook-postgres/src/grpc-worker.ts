// Optional streaming ingestion via Yellowstone gRPC / Helius LaserStream.
// Feeds the SAME idempotent writer as the webhook path (applyBatch).
//
// Adjust the import line + SubscribeRequest shape to the installed
// @triton-one/yellowstone-grpc v5.0.9.
import { Client, CommitmentLevel, type SubscribeRequest } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";
import { config, grpcAccounts } from "./config.js";
import { applyBatch } from "./writer.js";
import type { NormalizedTx } from "./types.js";

function normalizeGrpcTx(update: any): NormalizedTx | null {
  const txWrap = update?.transaction;
  const txInfo = txWrap?.transaction ?? txWrap;
  if (!txInfo) return null;
  const sigBytes = txInfo.signature ?? txInfo?.transaction?.signatures?.[0];
  if (!sigBytes) return null;
  const signature = typeof sigBytes === "string" ? sigBytes : bs58.encode(Buffer.from(sigBytes));
  const slot = Number(txWrap?.slot ?? update?.slot ?? 0);
  return {
    signature,
    slot,
    commitment: "confirmed", // gRPC delivers confirmed; reconciler promotes later
    events: [], // decode with makeAnchorDecoder(idl, programId) when you have an IDL
    raw: txInfo,
  };
}

async function main() {
  if (!config.GRPC_ENDPOINT) {
    console.error("✗ GRPC_ENDPOINT not set. Add GRPC_ENDPOINT / GRPC_TOKEN / GRPC_ACCOUNTS to .env");
    process.exit(1);
  }
  const accounts = grpcAccounts();
  const client = new Client(config.GRPC_ENDPOINT, config.GRPC_TOKEN, undefined);
  const stream = await client.subscribe();

  stream.on("data", async (data: any) => {
    const tx = normalizeGrpcTx(data);
    if (!tx) return;
    try {
      await applyBatch([tx]);
    } catch (err) {
      console.error("write failed", err);
    }
  });
  stream.on("error", (err: any) => console.error("stream error", err));

  const request: SubscribeRequest = {
    accounts: {},
    slots: {},
    transactions: {
      indexer: {
        accountInclude: accounts,
        accountExclude: [],
        accountRequired: [],
        vote: false,
        failed: false,
      },
    },
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
    commitment: CommitmentLevel.CONFIRMED,
  } as unknown as SubscribeRequest;

  await new Promise<void>((resolve, reject) => {
    stream.write(request, (err: any) => (err ? reject(err) : resolve()));
  });
  console.log(`📡 gRPC worker subscribed to ${accounts.length} account(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
