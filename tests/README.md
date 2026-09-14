# Tests

Two suites, over the pure functions the multi-user work leans on hardest:

- `crypto.test.ts` — password hashing and verification, and session tokens:
  that a wrong password fails, that a changed password or a tampered
  issued-at invalidates a token, that expiry works, and that agent tokens are
  only ever compared by hash.
- `prefs.test.ts` — lane renaming, reordering and hiding, plus the invariant
  that makes renaming safe: stored timeline labels stay canonical
  (`"Status: Phone screen"`) and are only translated for display, so the stats
  can still replay a history written before a rename.

```sh
npm test
```

`shared/prefs.ts` imports `./types.js`, which plain Node's type stripping does
not map onto `types.ts` the way the bundler does for `api/`. So `npm test`
bundles each suite with esbuild into `.tests/` first, then runs
`node --test` over the output. `.tests/` is generated and git-ignored.
