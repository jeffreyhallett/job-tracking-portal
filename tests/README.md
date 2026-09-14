# Tests

Four suites, over the pure functions the multi-user and custom-pipeline work
leans on hardest:

- `crypto.test.ts` — password hashing and verification, and session tokens:
  that a wrong password fails, that a changed password or a tampered
  issued-at invalidates a token, that expiry works, and that agent tokens are
  only ever compared by hash.
- `pipeline.test.ts` — the **behaviour lock**. It describes the attention
  rules, the stats and the stage-completion marker as they behaved when there
  were nine hardcoded stages, and runs them against the default stage set. It
  exists so that making the pipeline per-user data cannot quietly move
  anybody's response rate, median-days figure or stale flags. If one of these
  has to change, that is a real behaviour change and needs to be a deliberate
  one.
- `stages.test.ts` — a pipeline that is nothing like the default one: that the
  phases carry the meaning, that a removed stage stays inert rather than
  distorting the stats, that validation refuses a pipeline with nowhere to put
  a live application, and that renaming or deleting a stage never orphans
  history (ids in timeline entries, legacy entries upgraded, `retargetEvents`).
- `prefs` coverage lives in `stages.test.ts` too, including the conversion of
  the older rename-only lane preferences.

```sh
npm test
```

`shared/prefs.ts` imports `./types.js`, which plain Node's type stripping does
not map onto `types.ts` the way the bundler does for `api/`. So `npm test`
bundles each suite with esbuild into `.tests/` first, then runs
`node --test` over the output. `.tests/` is generated and git-ignored.
