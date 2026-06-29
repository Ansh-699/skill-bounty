# IDL files

Drop your Anchor program IDL JSON here, e.g. `idl/my_program.json`.
Get it with: `anchor idl fetch <PROGRAM_ID> -o idl/my_program.json`
or from your Anchor build at `target/idl/<program>.json`.

The decoder in `src/decode-anchor.ts` consumes this IDL to turn raw
instructions and program-log events into typed `NormalizedEvent`s.
