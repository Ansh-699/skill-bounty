import express from "express";
import { config } from "./config.js";
import { withTx, pool } from "./db.js";
import { applyTransaction } from "./writer.js";
import { normalizeHelius } from "./normalize.js";

const app = express();
app.use(express.json({ limit: "10mb" }));
const AUTH = config.WEBHOOK_AUTH_HEADER;

app.post("/helius", async (req, res) => {
  // Verify the shared secret (set as authHeader when creating the webhook).
  if (AUTH && req.header("authorization") !== AUTH) return res.sendStatus(401);

  const items = Array.isArray(req.body) ? req.body : [req.body];
  try {
    await withTx(async (c) => {
      for (const raw of items) {
        try {
          await applyTransaction(c, normalizeHelius(raw));
        } catch (err) {
          await c.query(
            `INSERT INTO dead_letter (source, payload, error) VALUES ($1,$2,$3)`,
            ["helius-webhook", JSON.stringify(raw), String(err)]
          );
        }
      }
    });
    // Only ACK after a durable write. A 5xx makes Helius retry — idempotency makes that safe.
    res.sendStatus(200);
  } catch {
    res.sendStatus(500);
  }
});

app.get("/health", async (_req, res) => {
  const { rows } = await pool.query("SELECT last_slot FROM indexer_cursor WHERE name='main'");
  res.json({ ok: true, syncedSlot: rows[0]?.last_slot ?? 0 });
});

app.listen(config.PORT, () => console.log(`indexer webhook listening on :${config.PORT}/helius`));
