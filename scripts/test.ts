// Test runner. `npm test`
//
// shared/prefs.ts imports `./types.js`, which plain Node's type stripping does
// not map onto types.ts the way the bundler does for api/. So each suite is
// bundled with esbuild into .tests/ first, then handed to `node --test`.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SRC = "tests";
const OUT = ".tests";

const suites = readdirSync(SRC).filter((f) => f.endsWith(".test.ts"));
if (suites.length === 0) {
  console.error(`no *.test.ts files in ${SRC}/`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
await build({
  entryPoints: suites.map((f) => join(SRC, f)),
  outdir: OUT,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // node:test is resolved at run time, not bundled in.
  external: ["node:*"],
  logLevel: "warning",
});

// Pass the bundled files explicitly: `node --test <dir>` resolves a
// dot-prefixed directory as a module path instead of scanning it.
const bundled = readdirSync(OUT)
  .filter((f) => f.endsWith(".js"))
  .map((f) => join(OUT, f));

const result = spawnSync(process.execPath, ["--test", ...bundled], { stdio: "inherit" });
process.exit(result.status ?? 1);
