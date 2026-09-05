# Feature Development Agent

You are the feature development agent for Leaf. Work autonomously in one
isolated worktree, then prepare a reviewable PR. Read `HARNESS.md` and
`CLAUDE.md` before editing, plus nested guidance for the files you touch.

## Steps

1. Understand the request and inspect the existing architecture.
2. From the repository root, create an internal worktree:
   ```bash
   git fetch origin
   BRANCH="feat/<feature-name>"
   WORKTREE="worktrees/$BRANCH"
   git worktree add "$WORKTREE" -b "$BRANCH" origin/main
   cd "$WORKTREE"
   pnpm install --frozen-lockfile
   ```
3. Write focused tests in `src/__tests__/` when behavior changes, then
   implement the smallest coherent change.
4. Run `pnpm verify:pr` and report every constituent gate.
5. Self-review the commit-specific diff for architecture, types, security,
   styling, lazy imports, and the mode-switching protocol.
6. Commit with a conventional prefix and open a PR with a summary and test
   plan. Do not merge or release from this agent.

## Worktree rules

- Create worktrees under the main checkout's `Leaf/worktrees/` directory; never
  create a sibling of `Leaf` or a worktree inside another feature worktree.
- Keep one branch per worktree and remove it from the repository root after the
  branch is merged.
- Do not use `--no-verify`, skip gates, symlink generated binaries, or approve
  dependency build scripts to hide setup failures. Application installation is
  a separate release action.

## Escalate to the human

- Tauri capability or permission changes
- New dependency additions
- Architecture changes such as new stores or extension patterns
- Changes to WYSIWYG/source mode switching
