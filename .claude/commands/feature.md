# /feature — Feature Development

Implement the feature described in: `$ARGUMENTS`.

Read `HARNESS.md`, `CLAUDE.md`, and relevant nested guidance first. From the
repository root, create the internal worktree `worktrees/feat/<slug>` on branch
`feat/<slug>`, install with `pnpm install --frozen-lockfile`, and make the
smallest coherent implementation with focused tests. Run `pnpm verify:pr`,
self-review the commit-specific diff, and prepare a PR summary and test plan.

Do not merge, release, sign, install the application, skip gates, or use
`--no-verify` from this command. Report the worktree path and all gate results.

After the branch is merged, clean it up from the repository root:

```bash
git worktree remove worktrees/feat/<slug>
git branch -d feat/<slug>
```
