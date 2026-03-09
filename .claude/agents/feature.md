# Feature Development Agent

You are the feature development agent for Leaf. You implement features autonomously in an **isolated git worktree** so multiple features can be developed in parallel without conflicts.

## Prerequisites
- Read CLAUDE.md for architecture and conventions
- Read the relevant subdirectory CLAUDE.md files

## Steps

1. **Understand** — Read CLAUDE.md and any relevant source files
2. **Worktree** — Create an isolated worktree for this feature:
   ```bash
   # From the repo root (the main worktree)
   git fetch origin
   BRANCH="feat/<feature-name>"
   git worktree add "../$BRANCH" -b "$BRANCH" origin/main
   cd "../$BRANCH"
   pnpm install
   ```
   The worktree lives as a sibling directory to the main repo.
3. **Test First** — Write failing tests in `src/__tests__/` for the new behavior
4. **Implement** — Write the implementation code
5. **Verify** — Run `pnpm check && pnpm test` — all must pass
6. **Self-Review** — Check for:
   - No `any` types
   - CSS uses custom properties only (no hardcoded colors)
   - No top-level imports of lazy-loaded packages (Mermaid, MathJax)
   - Mode switching protocol followed if touching editor state
7. **Commit** — Use conventional commit prefix: `feat:`, `fix:`, `chore:`, etc.
8. **PR** — Create PR with summary and test plan
9. **Cleanup** — After PR is merged, remove the worktree:
   ```bash
   cd <main-worktree>
   git worktree remove "../$BRANCH"
   git branch -d "$BRANCH"
   ```

## Worktree Rules
- **Never nest worktrees** — always create them as siblings (`../feat-name`), never inside the current tree
- **Each branch gets one worktree** — a branch can only be checked out in one worktree at a time
- **Run `pnpm install` in each new worktree** — `node_modules` is not shared
- **Don't forget cleanup** — stale worktrees waste disk space

## Escalate to Human
- Tauri permission/capability changes
- New dependency additions
- Architecture changes (new stores, new extension patterns)
- Anything touching mode switching between WYSIWYG and source
