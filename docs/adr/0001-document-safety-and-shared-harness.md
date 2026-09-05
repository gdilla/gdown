# ADR-0001: Document safety and shared audit harness

- **Status:** Accepted
- **Date:** 2026-09-05
- **Scope:** Leaf document editing, recovery, performance boundaries, and agent workflow

## Context

The audit found multiple paths that could serialize or overwrite document state,
including mode and close transitions. Rich-editor conversion also repeated work
during edit bursts. Folder discovery did unnecessary work before expansion,
structured fields could discard complex YAML, and Codex and Claude had diverging
worktree and verification instructions. The repairs needed to use the current
stores, components, and scripts without introducing speculative architecture.

## Decisions

1. **One serialized save owner with revision safety.** The [document-save
   owner](../../src/stores/autoSave.ts) owns [YAML/body serialization](../../src/utils/frontmatter.ts)
   and document writes, while revisions and queued edits prevent a late document
   write from replacing newer content silently. Recovery and [session
   snapshots](../../src/stores/session.ts) use their own ordered persistence
   paths, fed by the current captured editor state; autosave and close decisions
   coordinate with the document-save owner.
2. **Coalesce rich-editor snapshots and flush at boundaries.** HTML, Markdown,
   JSON, and outline snapshots may be coalesced over a 200 ms edit window, then
   must flush at save, export, copy, session, tab, close, and mode boundaries.
   This keeps boundary reads current without converting the entire document for
   every transaction.
3. **Load the file tree lazily.** Folder children load on expansion, and the
   existing short-lived AI-file cache deduplicates concurrent discovery. The
   tree does not gain a speculative global cache or new adapter layer.
4. **Keep complex YAML in the raw editor.** Fields that cannot be represented
   without loss stay as raw YAML while ordinary metadata fields remain
   editable. This preserves unknown keys, block scalars, and nested values.
5. **Use one Codex/Claude harness.** `AGENTS.md` delegates workflow to the
   shared [`HARNESS.md`](../../HARNESS.md), while `CLAUDE.md` remains the
   architecture reference. Internal worktrees, pinned Node/pnpm commands,
   evidence rules, and CI's real Pandoc-backed Rust tests are shared by both
   agent workflows. Codex-specific execution uses Luna implementers and a root
   reviewer; Claude retains its own slash-command entry points. The release
   gate verifies the optimized macOS app bundle without requiring the
   Finder-dependent DMG packaging step; the general `pnpm build` command stays
   available for full packaging.

## Alternatives considered

- Keeping multiple save timers would preserve existing duplication but leave
  ordering and overwrite races unresolved.
- Serializing on every editor transaction would keep snapshots current at a
  higher CPU cost; broad caching would add invalidation and memory complexity.
- Eagerly loading every descendant would make all data available immediately at
  the cost of unnecessary startup work and poor scaling for large trees.
- Rebuilding complex YAML through fields would keep one form model at the cost
  of silently dropping syntax and unknown values.
- Maintaining separate Codex and Claude instructions would make drift likely;
  a shared canonical harness gives each tool a clear entry point.

## Consequences

- Save, recovery, close, and mode behavior have one ownership boundary and can
  be reviewed with revision and boundary evidence.
- Edit bursts perform fewer conversions, while one very large conversion still
  needs profiling before any further design is proposed.
- Folder expansion defers work and raw YAML preserves fidelity, with users
  seeing some data only after expansion and some complex values remaining raw.
- Shared gates reduce workflow drift. Local Pandoc remains optional for app use,
  while CI provisions it so export integration tests cannot pass by skipping
  their bodies.
- App-only release verification keeps local deployment independent of the
  Finder-dependent DMG packaging path; full packaging remains an explicit
  separate command.
- The changes retain existing framework and dependency boundaries and do not
  claim native memory reduction or successful native export without evidence.
