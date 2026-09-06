// Outside a deployed Vercel environment (i.e. under `vercel dev`), read
// .env.local / .env so local runs don't depend on the project's Development
// environment having every variable. No-op in production/preview.
if (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development") {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // absent
    }
  }
}
