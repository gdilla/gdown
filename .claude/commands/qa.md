# /qa — Run Quality Gates

Read `HARNESS.md` and `CLAUDE.md`, then run:

```bash
pnpm verify:pr
```

Report pass/fail for typecheck, ESLint, Clippy, rustfmt, Vitest, Rust tests,
and the Vite frontend build. Include the first relevant error and distinguish
setup/config failures from product failures. Do not skip gates or use
`--no-verify`. The gate is fail-fast: mark checks after the first failure as
not run and do not rerun unrelated checks.
