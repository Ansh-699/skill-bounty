import { pool } from "./db.js";

// Refresh analytics views. CONCURRENTLY needs the unique indexes from 002.
for (const view of ["account_balances", "hourly_volume"]) {
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
  } catch {
    // First refresh (or empty view) can't run CONCURRENTLY — fall back.
    await pool.query(`REFRESH MATERIALIZED VIEW ${view}`);
  }
  console.log(`refreshed ${view}`);
}
await pool.end();
