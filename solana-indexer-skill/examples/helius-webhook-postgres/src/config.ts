import { z } from "zod";

const Schema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "is required")
    .refine((v) => v.startsWith("postgres"), "must be a postgres:// connection string"),
  RPC_URL: z.string().url("must be a valid URL"),
  WEBHOOK_AUTH_HEADER: z.string().min(16, "use a long random secret (>= 16 chars)"),
  PORT: z.coerce.number().int().positive().default(8080),
  API_PORT: z.coerce.number().int().positive().default(8090),
  REDIS_URL: z.string().url().optional(),
  RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  // Optional gRPC worker config (Phase 4)
  GRPC_ENDPOINT: z.string().url().optional(),
  GRPC_TOKEN: z.string().optional(),
  GRPC_ACCOUNTS: z.string().optional(), // comma-separated; split at use site
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(): Config {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("\n✗ Invalid environment configuration:\n");
    for (const issue of parsed.error.issues) {
      console.error(`  • ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    console.error("\nFix your .env (copy .env.example) or run `npm run init`, then retry.\n");
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();

// Helper: parsed list of accounts for the gRPC worker.
export function grpcAccounts(): string[] {
  return (config.GRPC_ACCOUNTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
