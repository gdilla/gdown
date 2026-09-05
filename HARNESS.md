# Leaf agent harness

`AGENTS.md` points here as the canonical workflow for Codex and Claude. `CLAUDE.md`
owns Leaf's architecture and coding conventions; nested `CLAUDE.md` files add
guidance for their directories.

## Roles and boundaries

- The implementer works in one isolated worktree, keeps the change focused, and
  reports the exact verification evidence.
- The root agent reviews the implementer's diff, reconciles parallel work, and
  decides whether the result is ready for human review.
- Codex bounded implementer and researcher tasks use `gpt-5.6-luna` at maximum
  supported reasoning. The root agent remains the reviewer. Claude slash
  commands are workflow entry points, not a second source of policy.
- User authorizations persist for the requested scope. Do not ask for approval
  again for work already authorized. Merging, releasing, signing, or installing
  the application still requires an explicit user request unless it was already
  authorized; frozen dependency setup is part of worktree setup.

## Worktrees

Keep the repository root as the stable reference checkout. Create feature
worktrees under the main checkout's `worktrees/` directory; never create a
sibling of `Leaf` or a worktree inside another feature worktree.

```bash
git fetch origin
BRANCH="feat/<slug>"       # use codex/<slug> for a Codex task
WORKTREE="worktrees/$BRANCH"
git worktree add "$WORKTREE" -b "$BRANCH" origin/main
cd "$WORKTREE"
pnpm install --frozen-lockfile
```

Use one branch per worktree. After the branch is merged, remove it from the
repository root with `git worktree remove worktrees/<kind>/<slug>` and delete
the local branch when it is no longer needed.

## Verification

The package scripts are the source of truth for gates:

| Command | Coverage |
| --- | --- |
| `pnpm verify:pr` | typecheck, ESLint, Clippy, rustfmt, Vitest, Rust tests, and the Vite frontend build |
| `pnpm verify:release` | the PR gate plus the full Tauri release build |
| `pnpm dev` / `pnpm vite:dev` | Tauri / frontend development servers |

Run `pnpm verify:pr` before reporting a PR-ready change. Run
`pnpm verify:release` before an explicitly requested release. Do not use
`--no-verify`, skip a gate, or manually symlink generated binaries to conceal a
failure. Report the command, first relevant error, and whether it is a setup or
product failure. The repository intentionally keeps
`pnpm-workspace.yaml`'s `allowBuilds: esbuild: false`; do not approve dependency
build scripts ad hoc. A missing output caused by that policy is a setup/config
issue. If changing that policy is proposed, assess it against the current user
authorization and review scope before editing.

CI installs with `pnpm install --frozen-lockfile` and runs the same
`pnpm verify:pr` gate. Keep `pnpm-lock.yaml` and dependency specifications in
sync; pnpm is the repository package manager. Use the Node version in `.nvmrc`
for local checks; CI reads the same file.

Pandoc is optional for local app use; export availability is reported at
runtime when it is absent. CI provisions Pandoc before `pnpm verify:pr` so the
Rust export integration tests exercise the converter instead of silently
passing on a skipped test. A local `cargo test` without Pandoc can still report
those tests as passed while skipping their bodies; record export coverage as
unavailable for that run.

## Review evidence

Review the actual base and head commits, then inspect every changed file. For a
behavioral change, require evidence only for the affected paths and record it
as verified, not applicable, or blocked:

- **Save:** for a save-related change, identify the single write owner; prove body/frontmatter
  serialization, debounce ordering, conflict handling, and surfaced errors.
- **Mode:** for a mode-related change, prove WYSIWYG↔Source content capture and restoration. Use the
  `gdown:toggle-mode` path where required; a direct store toggle can lose edits.
- **Session:** for a session-related change, prove restore ordering, active-tab selection, untitled content,
  and the effect of the relevant preference.
- **IPC:** for an IPC-related change, check that each frontend command is registered in Rust and that
  payload and return shapes agree. Add or update frontend mocks and Rust tests
  where the behavior changes.
- **Performance:** for performance-sensitive changes, state the measured or observed baseline and changed behavior
  for startup, typing, or document size when relevant.
- **UX:** for user-facing changes, exercise the default 800×600 viewport, including focus, clipping,
  overflow, dialogs, and keyboard paths. Record the environment for visual or
  interactive claims.

Missing evidence is uncertainty and should remain visible in the review.

## Claude entry points

- `/feature <description>` creates an internal feature worktree, implements and
  verifies the change, then prepares a PR for review.
- `/qa` runs `pnpm verify:pr` and reports each constituent gate.
- `/review` performs a read-only, commit-specific review and ends with a
  prioritized verdict.
- `/release` runs `pnpm verify:release`; signing and copying into
  `/Applications` happen only after explicit release authorization.

These commands must follow the same worktree, verification, and evidence rules
above. No command may merge, publish, sign, install the application, or bypass a
failing hook on its own. If the gate fails fast, report later checks as not run.
