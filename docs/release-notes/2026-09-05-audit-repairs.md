# Leaf audit repairs — 2026-09-05

These audit repairs harden document safety and reduce repeated work in the editor
while keeping Leaf's existing Tauri, Vue, Tiptap, and CodeMirror boundaries.

## What changed

- **Save and recovery:** One serialized save path owns YAML and body writes,
  tracks revisions and queued edits, and coordinates autosave with close
  decisions. Dirty named and untitled documents receive recovery snapshots.
- **Close and mode safety:** Save / Don't Save / Cancel protects dirty tabs,
  including coordinated macOS Quit. WYSIWYG and Source mode handoffs preserve
  the latest content and metadata.
- **Editor work:** Rich-editor HTML, Markdown, JSON, and outline snapshots are
  coalesced over 200 ms and flushed at save, export, copy, session, tab, close,
  and mode boundaries.
- **Source and folders:** Math scans avoid repeated range searches, source
  decorations update by viewport, and folder children load on expansion. AI
  file discovery briefly caches and deduplicates concurrent requests.
- **Everyday UX:** Tabs remain readable and keyboard navigable, the open-
  document picker is usable, the default 800×600 layout avoids editor overflow,
  and Preferences now exposes four labeled sections with live editor settings.
- **Export and metadata:** Export options reach Pandoc, unsupported default
  reader flags are removed, and complex YAML stays in the raw editor so fields
  are not silently lost.
- **Harness:** Codex and Claude share one concise workflow with isolated
  worktrees, pinned Node/pnpm gates, a root review role, and CI coverage using
  real Pandoc tests. No new dependencies were added.

## Validation recorded during the audit

- PR verification covered typecheck, ESLint, Clippy, rustfmt, 29 frontend test
  files / 302 tests, 71 Rust tests with Pandoc, and the Vite production build.
- The parser benchmark reduced a 500,000-character scan from 24.54 ms to
  0.70 ms in the recorded fixture. A single rich-editor serialization still
  measured about 1.32 s at 500,000 characters in a Node/jsdom stress fixture
  with 3,164 headings and 9,493 nodes; this is not a normal-document benchmark.
  Coalescing reduces repeated work but does not make that individual conversion
  cheap.
- Browser checks covered the default 800×600 layout, long-token wrapping,
  dirty-close decisions, mode metadata round trips, source settings, tab
  navigation, and the open-document picker.
- Native HTML export remains unverified because the export-dialog automation
  timed out. No successful export output is claimed, and no native memory
  reduction is claimed.

## Deployment record

- A local macOS arm64 Leaf 0.1.0 app was built from application source
  `385f4a1` using release workflow `f9e8f09`. The complete gate passed:
  typecheck, ESLint, Clippy, rustfmt, Vite production build, 29 frontend test
  files / 302 tests, 71 Rust tests with Pandoc, and the optimized `.app` build.
- The app-only release gate avoids the Finder-dependent DMG packaging step;
  the general `pnpm build` command remains unchanged for full packaging.
- Strict ad-hoc signature verification (`codesign --verify --deep --strict`)
  passed for both the built artifact and the installed app. The installed
  executable SHA-256
  `ed98435255738402072bc76ec2513d88832bbe87a4b463f2aacf26df47269523`
  matches the built artifact.
- The new installed process is running, and the user confirmed that documents
  are visible.
