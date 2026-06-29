# Tech Stack & Deployment

Recommended stack, deployment patterns, and operational concerns.

## Recommended Stack

| Layer | Recommended | Alternatives |
|---|---|---|
| **Language** | TypeScript (Node.js) | Rust (for high-throughput gRPC) |
| **Runtime** | Node.js 20+ | Bun |
| **Database** | PostgreSQL 16 | CockroachDB (multi-region) |
| **Cache** | Redis 7 | KeyDB, Dragonfly |
| **Queue** | Postgres outbox + Redis | BullMQ, SQS |
| **HTTP** | Express 4.x | Fastify (faster), Hono |
| **gRPC client** | `@triton-one/yellowstone-grpc` v5 | `helius-laserstream` |
| **ORM** | Raw `pg` (recommended) | Drizzle, Prisma |
| **Testing** | Vitest | Jest |
| **Deploy** | Docker + fly.io / Railway | Kubernetes, AWS ECS |

**Why raw `pg` over ORMs?** Indexer queries are performance-critical and
use Postgres-specific features (UPSERT, SKIP LOCKED, GREATEST). ORMs add
overhead and often generate suboptimal SQL for these patterns.

## Project Structure

```
my-indexer/
├── docker-compose.yml         # Postgres + Redis for local dev
├── migrations/
│   ├── 001_init.sql           # Core tables
│   └── 002_analytics.sql      # Materialized views, domain tables
├── src/
│   ├── db.ts                  # Pool + withTx helper
│   ├── types.ts               # NormalizedTx, NormalizedEvent
│   ├── writer.ts              # Idempotent writer + cursor + outbox
│   ├── normalize.ts           # Source-specific → NormalizedTx
│   ├── webhook-server.ts      # HTTP endpoint for webhooks
│   ├── backfill.ts            # Historical data catch-up
│   ├── reconciler.ts          # confirmed → finalized promotion
│   ├── outbox-poller.ts       # Dispatch side-effects
│   └── api.ts                 # REST/GraphQL serving layer
├── test/
│   └── pipeline.test.ts       # Correctness tests
├── .env.example
├── package.json
└── tsconfig.json
```

## Docker

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./
EXPOSE 8080
CMD ["node", "dist/webhook-server.js"]
```

## Environment Variables

```bash
# Required
DATABASE_URL=postgres://user:pass@host:5432/dbname
RPC_URL=https://mainnet.helius-rpc.com/?api-key=KEY

# Webhook
WEBHOOK_AUTH_HEADER=long-random-string
PORT=8080

# Optional
REDIS_URL=redis://localhost:6379
RECONCILE_INTERVAL_MS=30000
BACKFILL_BATCH_SIZE=100
LOG_LEVEL=info
```

## Scaling

### Horizontal Scaling (multiple workers)

For webhook servers: run N replicas behind a load balancer.
Idempotent writes mean any replica can process any webhook delivery.

For gRPC streams: each worker subscribes to a **different account set**
to partition the work. Or use Redis-based leader election.

### Database Scaling

1. **Connection pooling:** Use PgBouncer in front of Postgres
2. **Read replicas:** Route API reads to replicas
3. **Partitioning:** Partition `events` by slot range at ~100M rows
4. **Archival:** Move old raw_transactions to cold storage (S3 + Parquet)

## Monitoring

Essential metrics to track:

```typescript
// Sync lag: how far behind the chain tip
const lagQuery = `
  SELECT EXTRACT(EPOCH FROM now() - updated_at) AS lag_seconds
  FROM indexer_cursor WHERE name = 'main'
`;

// Pending outbox depth
const outboxQuery = `
  SELECT COUNT(*) FROM outbox WHERE status = 'pending'
`;

// Dead letter accumulation
const dlqQuery = `
  SELECT COUNT(*) FROM dead_letter
  WHERE created_at > now() - INTERVAL '1 hour'
`;

// Non-finalized row count (should stay bounded)
const nonFinalizedQuery = `
  SELECT COUNT(*) FROM raw_transactions WHERE commitment <> 'finalized'
`;
```

### Alerts

| Metric | Warning | Critical |
|---|---|---|
| Sync lag | > 60s | > 300s |
| Outbox depth | > 1000 | > 10000 |
| Dead letters / hour | > 10 | > 100 |
| Non-finalized rows | > 5000 | > 50000 |

## Health Check

Expose a `/health` endpoint that reports:
- Sync status (last slot, lag)
- Database connectivity
- Outbox depth
- Dead letter count

```typescript
app.get("/health", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT last_slot, updated_at FROM indexer_cursor WHERE name = 'main'`
    );
    const lag = rows[0]
      ? (Date.now() - new Date(rows[0].updated_at).getTime()) / 1000
      : null;
    res.json({ ok: true, lastSlot: rows[0]?.last_slot, lagSeconds: lag });
  } catch {
    res.status(503).json({ ok: false });
  }
});
```

## Anti-patterns

- ❌ Running migrations in the application startup → race conditions with multiple replicas
- ❌ No connection pooling → connection exhaustion under load
- ❌ Logging full transaction payloads → disk/log explosion
- ❌ No health check → silent failures in production
