# /feature — Autonomous Feature Development

Implement the feature described in: $ARGUMENTS

## Protocol
1. Read CLAUDE.md for conventions and architecture
2. Create an isolated worktree for the feature:
   ```bash
   git fetch origin
   BRANCH="feat/<feature-name-slug>"
   git worktree add "../$BRANCH" -b "$BRANCH" origin/main
   cd "../$BRANCH"
   pnpm install
   ```
3. Write failing tests first (TDD)
4. Implement the feature
5. Run `pnpm check && pnpm test` — fix any failures
6. Self-review the changes
7. Commit with conventional prefix
8. Create PR with test plan
9. Report the worktree path so the human knows where the code lives

## Worktree Cleanup (after PR merge)
```bash
git worktree remove "../$BRANCH"
git branch -d "$BRANCH"
```
