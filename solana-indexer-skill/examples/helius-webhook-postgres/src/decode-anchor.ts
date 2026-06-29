import { BorshInstructionCoder, BorshEventCoder, type Idl } from "@coral-xyz/anchor";
import bs58 from "bs58";
import type { NormalizedEvent } from "./types.js";

const PROGRAM_DATA_PREFIX = "Program data: ";

/**
 * Build a decoder bound to one program's IDL.
 * - decodeInstructions: walks top-level + inner instructions, decodes those
 *   that belong to `programId`.
 * - decodeEvents: decodes Anchor events emitted in program logs
 *   ("Program data: <base64>").
 *
 * Works against a raw `getTransaction` result (default json encoding, where
 * instruction `data` is base58 and account keys are strings).
 */
export function makeAnchorDecoder(idl: Idl, programId: string) {
  const ixCoder = new BorshInstructionCoder(idl);
  const eventCoder = new BorshEventCoder(idl);

  function accountKeys(tx: any): string[] {
    const keys = tx?.transaction?.message?.accountKeys ?? [];
    return keys.map((k: any) => (typeof k === "string" ? k : k?.pubkey ?? String(k)));
  }

  function decodeInstructions(tx: any): NormalizedEvent[] {
    const out: NormalizedEvent[] = [];
    const msg = tx?.transaction?.message;
    if (!msg) return out;
    const keys = accountKeys(tx);

    const all: Array<{ ix: any; index: number }> = [];
    (msg.instructions ?? []).forEach((ix: any, i: number) => all.push({ ix, index: i }));
    for (const inner of tx?.meta?.innerInstructions ?? []) {
      for (const ix of inner.instructions ?? []) all.push({ ix, index: inner.index });
    }

    let ii = 0;
    for (const { ix } of all) {
      const pid = keys[ix.programIdIndex];
      if (pid !== programId) { ii++; continue; }
      try {
        const buf = Buffer.from(bs58.decode(ix.data));
        const decoded = ixCoder.decode(buf);
        if (decoded) {
          out.push({
            instructionIndex: ii,
            kind: `ix:${decoded.name}`,
            account: keys[ix.accounts?.[0]] ?? "",
            data: decoded.data as Record<string, unknown>,
          });
        }
      } catch {
        // Not decodable with this IDL (e.g. a CPI to another program) — skip.
      }
      ii++;
    }
    return out;
  }

  function decodeEvents(tx: any, startIndex = 1000): NormalizedEvent[] {
    const out: NormalizedEvent[] = [];
    const logs: string[] = tx?.meta?.logMessages ?? [];
    let ii = startIndex; // keep event indices distinct from instruction indices
    for (const log of logs) {
      if (!log.startsWith(PROGRAM_DATA_PREFIX)) continue;
      const b64 = log.slice(PROGRAM_DATA_PREFIX.length);
      try {
        const ev = eventCoder.decode(b64);
        if (ev) {
          out.push({
            instructionIndex: ii++,
            kind: `event:${ev.name}`,
            account: "",
            data: ev.data as Record<string, unknown>,
          });
        }
      } catch {
        // Not an Anchor event line — skip.
      }
    }
    return out;
  }

  return { decodeInstructions, decodeEvents };
}

export type AnchorDecoder = ReturnType<typeof makeAnchorDecoder>;
