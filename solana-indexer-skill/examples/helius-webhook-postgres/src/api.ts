import express from "express";
import { pool } from "./db.js";
import { config } from "./config.js";

const app = express();

// Balances are read live from events so the API stays simple; the materialized
// views are still the source of truth for analytics endpoints and refresh jobs.
app.get("/api/balance/:account", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT mint, SUM(amount)::text AS balance
     FROM events
     WHERE account = $1 AND commitment = 'finalized'
     GROUP BY mint`,
    [req.params.account],
  );
  res.json({ account: req.params.account, balances: rows });
});

// Recent events for an account, keyset-paginated.
app.get("/api/events/:account", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit)) || 50, 200);
  const afterSlot = req.query.after_slot ? Number(req.query.after_slot) : 9_999_999_999;
  const afterId = req.query.after_id ? Number(req.query.after_id) : 9_999_999_999_999;
  const { rows } = await pool.query(
    `SELECT id, signature, slot, kind, mint, amount::text, block_time
     FROM events
     WHERE account = $1 AND (slot, id) < ($2, $3)
     ORDER BY slot DESC, id DESC
     LIMIT $4`,
    [req.params.account, afterSlot, afterId, limit],
  );
  const last = rows[rows.length - 1];
  res.json({
    events: rows,
    nextCursor: last ? { after_slot: last.slot, after_id: last.id } : null,
  });
});

// Hourly volume (optionally filtered by mint).
app.get("/api/volume", async (req, res) => {
  const mint = req.query.mint ? String(req.query.mint) : null;
  const { rows } = await pool.query(
    `SELECT hour, mint, volume::text, tx_count
     FROM hourly_volume
     WHERE ($1::text IS NULL OR mint = $1)
     ORDER BY hour DESC
     LIMIT 168`, // last 7 days of hours
    [mint],
  );
  res.json({ volume: rows });
});

// Sync status.
app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT last_slot, updated_at FROM indexer_cursor WHERE name = 'main'`,
    );
    const lagSeconds = rows[0]
      ? (Date.now() - new Date(rows[0].updated_at).getTime()) / 1000
      : null;
    res.json({ ok: true, lastSlot: rows[0]?.last_slot ?? 0, lagSeconds });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.listen(config.API_PORT, () =>
  console.log(`read API listening on :${config.API_PORT}`),
);
