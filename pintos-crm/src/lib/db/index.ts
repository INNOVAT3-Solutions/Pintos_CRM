import "server-only";
import path from "node:path";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * One database handle for the whole app.
 *
 * - DATABASE_URL set (production, Vercel): real Postgres via postgres.js.
 * - DATABASE_URL empty (your Mac): embedded Postgres (PGlite) stored in ./.data,
 *   so nothing needs installing to run the CRM locally.
 *
 * Both speak the same Postgres dialect and Drizzle exposes the same query API for
 * each, so the rest of the app only sees `Db`.
 */
export type Db = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

// Survive Next.js dev hot-reloads without opening the local database twice.
const g = globalThis as unknown as {
  __pintosDb?: Promise<Db>;
  /** Local only: how many migration files were applied, and a way to apply new ones without a restart. */
  __pintosMigrated?: number;
  __pintosMigrate?: () => Promise<void>;
};

async function migrationCount(): Promise<number> {
  const { readdir } = await import("node:fs/promises");
  return (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).length;
}

async function connect(): Promise<Db> {
  const { DATABASE_URL } = env();

  if (DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // Migrations run once per deploy (scripts/migrate.mjs, before `next build`),
    // not on every serverless cold start where they could race each other.
    const client = postgres(DATABASE_URL, { max: 5, prepare: false });
    return drizzle(client, { schema });
  }

  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is required when running on Vercel (the local database cannot persist there).");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { mkdir } = await import("node:fs/promises");
  const dataDir = path.join(process.cwd(), ".data", "pglite");
  await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  g.__pintosMigrate = async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });
    g.__pintosMigrated = await migrationCount();
  };
  await g.__pintosMigrate();
  // Same query-builder API as the postgres-js driver; see note above.
  return db as unknown as Db;
}

export async function getDb(): Promise<Db> {
  if (!g.__pintosDb) {
    g.__pintosDb = connect().catch((e) => {
      g.__pintosDb = undefined; // allow a retry on the next request
      throw e;
    });
  }
  const db = await g.__pintosDb;
  // A connection opened by older code (before a hot reload) has no migrate hook yet: attach one.
  if (!g.__pintosMigrate && !process.env.DATABASE_URL && !process.env.VERCEL && process.env.NODE_ENV !== "production") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    g.__pintosMigrate = async () => {
      await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: MIGRATIONS });
      g.__pintosMigrated = await migrationCount();
    };
  }
  // Local development: a schema change added a migration while the CRM was running — apply it now
  // instead of failing until the next restart. (Production migrates once per deploy.)
  if (g.__pintosMigrate && process.env.NODE_ENV !== "production" && (await migrationCount()) !== g.__pintosMigrated) {
    await g.__pintosMigrate();
  }
  return db;
}

export { schema };
