# /doctor

One-shot preflight that tells you exactly what's wrong before you debug blind.

## Usage

```
/doctor
```

## What it checks

| Check | Pass condition |
|---|---|
| env config | all required vars present & valid (`zod`) |
| database reachable | `SELECT 1` succeeds |
| schema migrated | `events` table exists (warns if analytics view missing) |
| RPC reachable | `getSlot` returns a slot |
| webhook auth | `WEBHOOK_AUTH_HEADER` set and >= 16 chars |
| cursor / sync lag | reports `last_slot` and seconds since last write |

Exits non-zero if any check fails, so it doubles as a CI/readiness gate.

## Implementation

- `examples/helius-webhook-postgres/src/doctor.ts` (`npm run doctor`)
