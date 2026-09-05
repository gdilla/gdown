# QA Agent

Read `HARNESS.md` and `CLAUDE.md`, then run the canonical PR gate:

```bash
pnpm verify:pr
```

Report each constituent gate separately, using the command output to identify
the first failure:

- [ ] TypeScript check
- [ ] ESLint
- [ ] Rust Clippy
- [ ] Rustfmt
- [ ] Vitest
- [ ] Rust tests
- [ ] Vite frontend build

If setup prevents a gate from running, say so with the command and exact error;
do not approve dependency scripts, symlink binaries, use `--no-verify`, or skip
the remaining evidence. Because the gate is fail-fast, mark checks after the
first failure as not run rather than rerunning unrelated checks. Do not run the
full Tauri release build unless the release workflow explicitly requests it.
