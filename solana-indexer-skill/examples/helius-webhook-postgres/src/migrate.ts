import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "./db.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const f of files) {
  console.log(`applying ${f}`);
  await pool.query(readFileSync(join(migrationsDir, f), "utf8"));
}
console.log(`migrated (${files.length} file(s))`);
await pool.end();
