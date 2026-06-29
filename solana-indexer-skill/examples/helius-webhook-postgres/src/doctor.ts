import { config } from "./config.js"; // importing validates env (exits on failure)
import { pool } from "./db.js";

let failed = false;

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e: any) {
    failed = true;
    console.log(`✗ ${name} — ${e?.message ?? e}`);
  }
}

async function rpc(method: string, params: unknown[] = []) {
  const r = await fetch(config.RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

console.log("\n🩺 solana-indexer doctor\n");

await check("env config", async () => "all required variables present & valid");

await check("database reachable", async () => {
  await pool.query("SELECT 1");
  return "connected";
});

await check("schema migrated", async () => {
  const { rows } = await pool.query(
    `SELECT to_regclass('public.events') AS events, to_regclass('public.account_balances') AS analytics`,
  );
  if (!rows[0].events) throw new Error("core tables missing — run \`npm run migrate\`");
  return rows[0].analytics ? "core + analytics present" : "core present (analytics view missing — run migrate)";
});

await check("RPC reachable", async () => {
  const slot = await rpc("getSlot");
  return `current slot ${slot}`;
});

await check("webhook auth", async () => {
  if ((config.WEBHOOK_AUTH_HEADER?.length ?? 0) < 16) throw new Error("secret too short");
  return "set";
});

await check("cursor / sync lag", async () => {
  const { rows } = await pool.query(
    `SELECT last_slot, EXTRACT(EPOCH FROM now() - updated_at) AS lag
     FROM indexer_cursor WHERE name = 'main'`,
  );
  if (!rows[0]) return "no cursor yet (nothing indexed)";
  return `last_slot=${rows[0].last_slot}, lag=${Math.round(rows[0].lag)}s`;
});

await pool.end();
console.log("");
process.exit(failed ? 1 : 0);
