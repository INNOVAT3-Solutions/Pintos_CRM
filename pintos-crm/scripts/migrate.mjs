// Applies database migrations before `next build` when DATABASE_URL is set (production).
// Locally (no DATABASE_URL) it does nothing — the embedded database migrates itself on start.
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("migrate: no DATABASE_URL — skipping (local embedded database migrates on start)");
  process.exit(0);
}

const { default: postgres } = await import("postgres");
const { drizzle } = await import("drizzle-orm/postgres-js");
const { migrate } = await import("drizzle-orm/postgres-js/migrator");

const client = postgres(url, { max: 1, prepare: false });
try {
  await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("migrate: database is up to date");
} finally {
  await client.end();
}
