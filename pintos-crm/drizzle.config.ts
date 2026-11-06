import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./drizzle. They are applied automatically when the app starts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
});
