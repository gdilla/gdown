# /release — Verify and release Leaf

The user's `/release` invocation authorizes this documented build, signing, and
application-install flow. Read `HARNESS.md` and `CLAUDE.md`, then run the
canonical release gate:

```bash
pnpm verify:release
```

This runs the PR gate and the full Tauri build. If it passes, run:

```bash
codesign --force --deep --sign - src-tauri/target/release/bundle/macos/Leaf.app
cp -r src-tauri/target/release/bundle/macos/Leaf.app /Applications/
```

Report the artifact path and any failure. Never use `--no-verify` or skip a
gate.
