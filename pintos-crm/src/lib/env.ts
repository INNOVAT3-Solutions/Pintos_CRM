import "server-only";
import { z } from "zod";

/**
 * Server-side settings, read from .env.local (a link to the shared ../.env).
 * Validated once so a missing value fails loudly instead of halfway through a sync.
 */
const schema = z.object({
  GHL_PRIVATE_TOKEN: z.string().min(10, "GHL_PRIVATE_TOKEN is missing"),
  GHL_LOCATION_ID: z.string().min(5, "GHL_LOCATION_ID is missing"),
  GOOGLE_MAPS_API_KEY: z.string().optional().default(""),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  /** Postgres connection string in production. When empty, a local embedded database is used. */
  DATABASE_URL: z.string().optional().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration — ${problems}`);
  }
  cached = parsed.data;
  return cached;
}
