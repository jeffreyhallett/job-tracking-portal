import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load env files on its own. Node 22 can, so pull in
// .env.local (what `vercel env pull` writes) and .env if they exist.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file absent; fine
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
