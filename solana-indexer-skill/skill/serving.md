# Serving Indexed Data

How to expose your indexed Solana data via APIs, WebSockets, and caches.

## REST API

> **Runnable implementation:** `examples/helius-webhook-postgres/src/api.ts` (`npm run api`) —
> balances, keyset-paginated events, hourly volume, and a sync-status endpoint.

The simplest serving layer — a thin Express/Fastify wrapper over SQL queries.

```typescript
import express from "express";
import { pool } from "./db.js";

const app = express();

// Account balance
app.get("/api/balance/:account", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT mint, SUM(amount)::text AS balance
     FROM events
     WHERE account = $1 AND commitment = 'finalized'
     GROUP BY mint`,
    [req.params.account]
  );
  res.json({ account: req.params.account, balances: rows });
});

// Recent events for an account
app.get("/api/events/:account", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const { rows } = await pool.query(
    `SELECT signature, slot, kind, mint, amount::text, block_time, data
     FROM events
     WHERE account = $1
     ORDER BY slot DESC
     LIMIT $2`,
    [req.params.account, limit]
  );
  res.json({ events: rows });
});

// Health / sync status
app.get("/api/health", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT last_slot, updated_at FROM indexer_cursor WHERE name = 'main'`
  );
  const cursor = rows[0];
  const lagSeconds = cursor
    ? (Date.now() - new Date(cursor.updated_at).getTime()) / 1000
    : null;
  res.json({ ok: true, lastSlot: cursor?.last_slot, lagSeconds });
});
```

## WebSocket (real-time updates)

Use the outbox pattern to push new events to connected clients:

```typescript
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8081 });
const subscribers = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const { subscribe, account } = JSON.parse(msg.toString());
    if (subscribe && account) {
      if (!subscribers.has(account)) subscribers.set(account, new Set());
      subscribers.get(account)!.add(ws);
    }
  });
  ws.on("close", () => {
    for (const subs of subscribers.values()) subs.delete(ws);
  });
});

// Called by the outbox poller when a new event is dispatched
export function notifySubscribers(event: { account: string; [key: string]: any }) {
  const subs = subscribers.get(event.account);
  if (!subs) return;
  const payload = JSON.stringify(event);
  for (const ws of subs) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}
```

## Caching

For high-traffic endpoints, cache computed results in Redis:

```typescript
import { createClient } from "redis";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

async function cachedBalance(account: string): Promise<any> {
  const key = `balance:${account}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query(
    `SELECT mint, SUM(amount)::text AS balance
     FROM events WHERE account = $1 AND commitment = 'finalized'
     GROUP BY mint`,
    [account]
  );

  await redis.setEx(key, 30, JSON.stringify(rows)); // 30s TTL
  return rows;
}
```

**Cache invalidation:** When the outbox poller dispatches an event for an account,
delete/invalidate the relevant cache keys.

## GraphQL (optional)

If you prefer GraphQL over REST:

```typescript
const typeDefs = `
  type Event {
    signature: String!
    slot: Int!
    kind: String!
    account: String
    mint: String
    amount: String
    blockTime: Int
  }

  type Balance {
    mint: String!
    balance: String!
  }

  type Query {
    events(account: String!, limit: Int): [Event!]!
    balances(account: String!): [Balance!]!
  }

  type Subscription {
    newEvent(account: String!): Event!
  }
`;
```

## Pagination

For list endpoints, use keyset pagination (not offset-based):

```typescript
app.get("/api/events", async (req, res) => {
  const { account, after_slot, after_id, limit = 50 } = req.query;

  const { rows } = await pool.query(
    `SELECT id, signature, slot, kind, mint, amount::text, block_time
     FROM events
     WHERE account = $1
       AND (slot, id) < ($2, $3)  -- keyset cursor
     ORDER BY slot DESC, id DESC
     LIMIT $4`,
    [account, after_slot || 999999999, after_id || 999999999, Math.min(+limit, 200)]
  );

  const nextCursor = rows.length > 0
    ? { after_slot: rows[rows.length - 1].slot, after_id: rows[rows.length - 1].id }
    : null;

  res.json({ events: rows, nextCursor });
});
```

## Anti-patterns

- ❌ Exposing raw JSONB without shaping → leaking internal structure
- ❌ Unbounded queries (no LIMIT) → OOM on large accounts
- ❌ Serving `processed` commitment data without a warning label
- ❌ Cache without invalidation → stale data served indefinitely
- ❌ Offset-based pagination → slow on large tables, inconsistent with inserts
