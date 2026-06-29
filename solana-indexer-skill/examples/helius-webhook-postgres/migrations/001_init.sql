-- Cursor: how far we have processed. One row per pipeline.
CREATE TABLE IF NOT EXISTS indexer_cursor (
  name           TEXT PRIMARY KEY,
  last_slot      BIGINT NOT NULL DEFAULT 0,
  last_signature TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable RAW layer: source of truth, keyed by signature (idempotent).
CREATE TABLE IF NOT EXISTS raw_transactions (
  signature   TEXT PRIMARY KEY,
  slot        BIGINT NOT NULL,
  block_time  BIGINT,
  commitment  TEXT   NOT NULL DEFAULT 'confirmed',
  payload     JSONB  NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raw_tx_slot_idx ON raw_transactions (slot);

-- Decoded events. Unique key makes re-delivery a no-op.
CREATE TABLE IF NOT EXISTS events (
  id                BIGSERIAL PRIMARY KEY,
  signature         TEXT   NOT NULL,
  instruction_index INT    NOT NULL DEFAULT 0,
  slot              BIGINT NOT NULL,
  block_time        BIGINT,
  kind              TEXT   NOT NULL,
  account           TEXT,
  mint              TEXT,
  amount            NUMERIC,
  commitment        TEXT   NOT NULL DEFAULT 'confirmed',
  data              JSONB,
  UNIQUE (signature, instruction_index)
);
CREATE INDEX IF NOT EXISTS events_slot_idx    ON events (slot);
CREATE INDEX IF NOT EXISTS events_account_idx ON events (account);

-- Outbox: side-effects to dispatch, written in the SAME tx as the event.
CREATE TABLE IF NOT EXISTS outbox (
  id         BIGSERIAL PRIMARY KEY,
  topic      TEXT   NOT NULL,
  payload    JSONB  NOT NULL,
  status     TEXT   NOT NULL DEFAULT 'pending',
  attempts   INT    NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox (status);

-- Dead letter: payloads we could not process, for inspection/replay.
CREATE TABLE IF NOT EXISTS dead_letter (
  id         BIGSERIAL PRIMARY KEY,
  source     TEXT   NOT NULL,
  payload    JSONB  NOT NULL,
  error      TEXT   NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
