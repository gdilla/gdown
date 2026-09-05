# /review — Commit-specific review

Read `HARNESS.md`, `CLAUDE.md`, and relevant nested guidance. Use read-only Bash
to resolve the actual base and head commits, inspect staged and unstaged diffs,
and read every changed file in context. Do not edit, install, build, commit,
merge, release, skip gates, or use `--no-verify`.

Review in this order: correctness and data loss, IPC registration and payload
shapes, state ownership and duplication, error handling, performance, tests,
then Vue/Tiptap/CodeMirror and CSS conventions. For save, mode, session, or IPC
changes, require the corresponding evidence contract in `HARNESS.md`; also
record performance and default 800×600 UX evidence when relevant.

For each real issue, report:

- **Priority:** P0–P3
- **File:** path and line
- **Issue:** concrete failure or risk
- **Impact:** affected behavior
- **Minimal fix:** smallest useful correction
- **Confidence:** high, medium, or low

End with `Approve`, `Approve with suggestions`, or `Request changes`.
