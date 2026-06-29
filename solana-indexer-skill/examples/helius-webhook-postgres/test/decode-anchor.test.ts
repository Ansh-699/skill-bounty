import { describe, it, expect } from "vitest";
import { makeAnchorDecoder } from "../src/decode-anchor.js";

// Minimal IDL with no instructions/events — decoder must construct and return [].
const emptyIdl: any = { version: "0.1.0", name: "noop", instructions: [], accounts: [], events: [], types: [] };

describe("anchor decoder", () => {
  it("constructs and returns no events for an unrelated tx", () => {
    const decoder = makeAnchorDecoder(emptyIdl, "Prog1111111111111111111111111111111111111111");
    const tx = { transaction: { message: { accountKeys: [], instructions: [] } }, meta: { innerInstructions: [], logMessages: [] } };
    expect(decoder.decodeInstructions(tx)).toEqual([]);
    expect(decoder.decodeEvents(tx)).toEqual([]);
  });
});
