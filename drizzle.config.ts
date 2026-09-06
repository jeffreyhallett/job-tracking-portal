import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load env files on its own. Node 22 can, so pull in
// .env.local (what `vercel env pull` writes) and .env if they exist. The
// first file that defines a variable wins, so ENV_FILE=.env.production.local
// targets production instead of the Development branch.
for (const file of [process.env.ENV_FILE, ".env.local", ".env"]) {
  if (!file) continue;
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
