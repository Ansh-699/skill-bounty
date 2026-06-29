-- Analytics layer: materialized views over the finalized event stream.
-- Unique indexes are required for REFRESH MATERIALIZED VIEW CONCURRENTLY.

-- Per-account, per-mint balance (money-safe: finalized only).
CREATE MATERIALIZED VIEW IF NOT EXISTS account_balances AS
SELECT
  account,
  mint,
  SUM(amount)        AS balance,
  MAX(slot)          AS last_slot,
  COUNT(*)           AS event_count
FROM events
WHERE commitment = 'finalized'
  AND account IS NOT NULL
  AND mint IS NOT NULL
GROUP BY account, mint;

CREATE UNIQUE INDEX IF NOT EXISTS account_balances_pk
  ON account_balances (account, mint);

-- Hourly transfer volume per mint.
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_volume AS
SELECT
  date_trunc('hour', to_timestamp(block_time)) AS hour,
  mint,
  SUM(ABS(amount)) / 2          AS volume,   -- /2: we store both sides of a transfer
  COUNT(DISTINCT signature)     AS tx_count
FROM events
WHERE commitment = 'finalized'
  AND block_time IS NOT NULL
  AND mint IS NOT NULL
  AND kind IN ('token_transfer', 'sol_transfer')
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS hourly_volume_pk
  ON hourly_volume (hour, mint);
