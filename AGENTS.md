# Leaf agent workflow

`HARNESS.md` is the canonical workflow for Codex and Claude: worktrees,
verification, review evidence, and release boundaries live there.

`CLAUDE.md` remains the canonical Leaf architecture and coding-convention
reference. Read both files before changing the repository, then read any
nested guidance for the paths being changed.

Keep the main worktree as the stable reference and work in
`worktrees/<kind>/<slug>` on a dedicated branch. Use the canonical PR gate
before reporting work complete. Dependency setup uses the frozen lockfile. Do
not use `--no-verify` to bypass a failure; report setup or product failures with
their evidence. Merging, releasing, signing, and installing the application
require an explicit user request.
