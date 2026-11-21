# CLAUDE.md — Leaf

Leaf is a Typora-inspired markdown editor built with Tauri 2 + Vue 3 + Tiptap v3.
GitHub: https://github.com/gdilla/gdown

## Quality Gates

`HARNESS.md` is the canonical workflow and review-evidence guide. This file
owns Leaf's architecture and coding conventions.

For a PR, run:

```bash
pnpm verify:pr    # typecheck, lint, clippy, rustfmt, Vitest, Rust tests, Vite build
```

For an explicitly requested release, run:

```bash
pnpm verify:release  # PR gate plus optimized macOS .app build
```

## Feature Development Protocol

Read `HARNESS.md` for the canonical worktree, verification, review, and release
workflow. Keep feature work in `worktrees/<kind>/<slug>` on a dedicated branch,
then run `pnpm verify:pr` before reporting it ready.

**Worktree rules:** Always create worktrees inside `Leaf/worktrees/` — NEVER as siblings in `../` (that pollutes the parent projects folder). Run `pnpm install --frozen-lockfile` in each new worktree. Multiple features can run in parallel in separate worktrees.

## Done Criteria

A PR is ready when:
- All PR gates pass (`pnpm verify:pr`)
- Tests cover the new behavior
- No `any` types introduced
- CSS uses custom properties only (no hardcoded colors)
- CLAUDE.md updated if architecture changed
- After every PR, suggest improvements to CLAUDE.md and HARNESS.md based on what was learned

## Escalation Policy — Ask the Human

- Tauri permission/capability changes
- New dependency additions
- Architecture changes (new stores, new extension patterns)
- Anything touching mode switching between WYSIWYG and source

---

## Tech Stack

- **Framework:** Vue 3 + TypeScript 5.9 (strict), `<script setup>` Composition API
- **Desktop shell:** Tauri 2 (Rust backend in `src-tauri/`)
- **Rich editor:** Tiptap v3 (WYSIWYG mode) — 20+ custom extensions
- **Source editor:** CodeMirror 6 (raw markdown mode) — `src/components/source/SourceEditor.vue`
  (lazy-loaded: App.vue uses `defineAsyncComponent`, so CodeMirror stays out of the startup chunk)
- **State:** Pinia 3 — one store per domain in `src/stores/`
- **Build:** Vite 7
- **Package manager:** pnpm (NEVER use npm or yarn)
- **Testing:** Vitest + @vue/test-utils + jsdom
- **Linting:** ESLint (flat config) + Prettier + Clippy + rustfmt
- **CI:** GitHub Actions (`.github/workflows/ci.yml`)
- **Diagrams:** Mermaid 11 (lazy-loaded — only on first render)
- **Math:** KaTeX (eager) + MathJax (lazy-loaded — only on first render)
- **Markdown parsing:** markdown-it (MD→HTML) + Turndown (HTML→MD)
- **Tables:** `@tiptap/extension-table` + custom Turndown rules

## App Identity

- **App name:** Leaf (was "gdown" — fully renamed)
- **Bundle ID:** `com.gautambanerjee.leaf`
- **Cargo package:** `leaf` / lib: `leaf_lib`
- **macOS .app:** `src-tauri/target/release/bundle/macos/Leaf.app`
- **DMG:** `src-tauri/target/release/bundle/dmg/Leaf_0.1.0_aarch64.dmg`

## Project Structure

```
Leaf/
├── src/
│   ├── App.vue               — Root; keyboard shortcuts, Tauri event listeners, v-if Editor/SourceEditor
│   ├── __tests__/            — Vitest tests (mirrors src/ structure)
│   ├── components/
│   │   ├── Editor.vue        — Tiptap WYSIWYG editor (only mounted in wysiwyg mode)
│   │   ├── source/
│   │   │   └── SourceEditor.vue  — CodeMirror source editor (only mounted in source mode)
│   │   ├── StatusBar.vue     — Save status, path display, panel toggles, mode toggle
│   │   ├── sidebar/          — File tree, outline panel
│   │   ├── tabs/             — Tab bar and tab items
│   │   └── preferences/      — Preferences window (4 panes)
│   ├── extensions/           — Custom Tiptap extensions (GdownTable, MermaidBlock, etc.)
│   ├── stores/               — Pinia stores (tabs, autoSave, preferences, editorMode, etc.)
│   ├── utils/
│   │   ├── markdownConverter.ts  — htmlToMarkdown (Turndown) + markdownToHtml (markdown-it)
│   │   └── frontmatter.ts        — YAML front-matter parsing
│   ├── codemirror/           — CodeMirror extensions (math highlight, frontmatter, mathjax preview)
│   └── style.css             — CSS custom properties for all themes
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs            — Tauri setup, menu builder, event handlers
│   │   ├── main.rs           — Entry point (calls leaf_lib::run())
│   │   └── commands/         — fs.rs, export.rs, session.rs, ai_files.rs, mod.rs
│   └── tauri.conf.json       — App config (productName: "Leaf", identifier: com.gautambanerjee.leaf)
├── .github/workflows/ci.yml  — CI: canonical `pnpm verify:pr` gate
├── eslint.config.js          — ESLint flat config (Vue 3 + TS)
├── vitest.config.ts          — Vitest configuration
└── public/
```

## Code Conventions

- Always `<script setup lang="ts">` — no Options API
- No hardcoded colors — use CSS custom properties (`var(--text-primary)`, `var(--sidebar-border)`, etc.)
- Themes are pure CSS: add `[data-theme="name"]` block in `style.css` + entry in `preferences.ts` ThemeMode
- Custom Tiptap extensions in `src/extensions/`, named `Gdown*`
- Pinia stores: one file per domain, composable style (not options)
- Prefer `computed()` over watchers
- Every new feature MUST include tests in `src/__tests__/`

## Architecture: Mode Switching (critical — many bugs here)

The WYSIWYG/source switch uses `v-if` in App.vue — **two separate components**, not v-show:

```html
<Editor v-if="editorModeStore.mode === 'wysiwyg'" />   <!-- Tiptap -->
<SourceEditor v-else />                                  <!-- CodeMirror -->
```

**Content handoff protocol:**
1. WYSIWYG→source: `handleToggleMode()` in Editor.vue calls `flushSnapshot()` (→ `captureState()`
   serializes `editor.getHTML()` into body `markdown` + `frontmatter`), saves `{ doc: null }`, THEN
   calls `setMode('source')`. `onBeforeUnmount` sees `unmountForModeSwitch` and only cancels the
   snapshot timer, so the handoff is not overwritten; any other unmount flushes the pending snapshot.
2. Source→wysiwyg: SourceEditor's Cmd+/ handler runs `captureEditorState()` (body, front-matter,
   `doc: null`) before `setMode('wysiwyg')`; Editor.vue `onMounted` → `restoreState()` loads the TipTap
   JSON `doc` when present and there is no front-matter, otherwise front-matter + markdown as HTML.
3. Undo boundary: every programmatic load (mount, tab switch, external/conflict reload) resets undo
   history — Editor.vue `resetUndoHistory()`, SourceEditor.vue `restoreContent()` → `view.setState()`.
   Never load a document with a plain `setContent`/`dispatch({ changes })` alone (Undo would cross tabs).

**Source-only tabs and size limits** (`src/utils/documentLimits.ts` holds the limits and the measurements
behind them):
- `Tab.sourceOnly` is set when a tab is created: `'plain-text'` for any file that is not markdown
  (`.md .markdown .mdown .mkd .txt .text`), `'too-large'` for a document over `MAX_RICH_CHARS` (200 KB).
  The rich editor rewrites what it loads as markdown (a CSV comes back with rows joined), and converts
  the whole document on every edit, so it must never load such a tab.
- `editorModeStore.mode` is the mode **in effect**: `'source'` whenever the active tab is source-only,
  otherwise the user's preference. `setMode('wysiwyg')` is refused with a notice on a source-only tab.
  Switching between a rich tab and a source-only tab therefore swaps Editor/SourceEditor through the
  `v-if`, like an image tab does — not through the handoff protocol above.
- Size only bounds work that is linear in the document. Work that can be quadratic is kept away from
  source-only tabs altogether: SourceEditor loads them as plain text (the markdown parser takes 67 s on a
  4 MB CSV) and builds no outline for them (the heading scan takes 62 s on 1 MB that opens with an unclosed
  link-reference title), and `wordCount` counts them in one plain pass (its markdown-stripping patterns
  take 33 s on a 440 KB CSV of `<LOD` values).
- A source-only tab is stored whole (`splitDocument(content, true)`: `frontmatter` is null and `markdown`
  is the entire file). In a plain-text file a leading `---` block is content, not front matter, so saving
  cannot rewrite it; in a large markdown file it avoids re-parsing the front matter on every keystroke.
  Front matter counts towards the 200 KB limit (`tabSourceOnlyReason`).
- SourceEditor's `renderedTabId` is the tab whose text is in the editor. On a tab switch it moves only
  when the new tab is loaded (`pendingTabId` covers the gap): a `gdown:capture-state` in between must
  save the outgoing document to its own tab. Moving it early wrote one tab's text into another.
- `read_file` takes the open-size limit (`MAX_OPEN_BYTES`, 4 MB) on every call — opening, the
  external-change reload and the save-conflict check — and refuses a larger file before reading it; when
  opening, its error text is shown to the user. A reload re-decides `sourceOnly` (`applyDiskContent`).

**Keyboard shortcut rule:** Cmd+/ is handled by:
- `Editor.vue` window listener → wysiwyg→source (calls `handleToggleMode`)
- `source/SourceEditor.vue` window listener → source→wysiwyg (calls `setMode('wysiwyg')`)
- App.vue does NOT handle Cmd+/ (removed to prevent double-fire bug)

## Dev Workflow

```bash
pnpm dev          # Start Tauri dev server (hot reload, Vite on :1420)
pnpm vite:dev     # Frontend only (no Tauri window)
pnpm verify:pr    # PR gate: typecheck, lint, clippy, rustfmt, tests, Vite build
pnpm verify:release # PR gate plus optimized macOS .app build → Leaf.app
```

## Build & Install (macOS)

Use `/release` after the user has explicitly requested a release. It runs
`pnpm verify:release` before the signing and installation steps below. The
release gate builds and validates the `.app`; `pnpm build` remains an optional
full-distribution command when a DMG is needed.

```bash
# 1. Build and validate the release app bundle
pnpm verify:release
# Output: src-tauri/target/release/bundle/macos/Leaf.app

# Optional full distribution package (including DMG)
# pnpm build
# Outputs: src-tauri/target/release/bundle/macos/Leaf.app
#          src-tauri/target/release/bundle/dmg/Leaf_0.1.0_aarch64.dmg

# 2. Ad-hoc sign (no Apple Developer account needed — personal use only)
codesign --force --deep --sign - \
  src-tauri/target/release/bundle/macos/Leaf.app

# 3. Remove quarantine (if moving from Downloads)
xattr -rd com.apple.quarantine \
  src-tauri/target/release/bundle/macos/Leaf.app

# 4. Install to Applications
cp -r src-tauri/target/release/bundle/macos/Leaf.app /Applications/
```

First launch may show a Gatekeeper prompt — right-click → Open to bypass once.

## Themes

Themes are CSS-only. To add a new theme:
1. Add `[data-theme="name"] { --var: value; ... }` block to `src/style.css`
2. Add `'name'` to `ThemeMode` union in `src/stores/preferences.ts`
3. Add option to `themeOptions` array in `src/components/preferences/AppearancePane.vue`
4. Add `.preview-name { ... }` CSS in AppearancePane.vue's scoped style
5. Add `CheckMenuItemBuilder` entry in `src-tauri/src/lib.rs` Themes submenu + event handler

Current themes: `light`, `dark`, `auto`, `solarized-light`, `solarized-dark`, `github`
(`auto` is resolved to `light`/`dark` in `preferences.ts`; it has no CSS block).

Semantic colour tokens (every colour token in `:root` needs a value in every theme block —
`src/__tests__/theme/colorLiterals.test.ts` enforces this and rejects new colour literals):
- Neutral: `--ink-rgb` (use `rgba(var(--ink-rgb), a)` for hover/pressed tints), `--text-secondary`,
  `--text-emphasis`, `--text-muted`, `--text-faint`, `--text-placeholder`, `--bg-secondary`,
  `--surface-hover`, `--surface-muted`, `--border-color`, `--border-subtle`, `--border-faint`,
  `--border-strong`, `--input-border`, `--button-*`, `--dialog-*`
- Accent: `--accent-color`, `--accent-rgb`, `--accent-hover`, `--accent-text`, `--control-accent(-rgb)`,
  `--link-color`, `--focus-outline(-rgb)`, `--focus-surface`
- Status: `--error-rgb`, `--success-color`, `--success-text`, `--danger-text`, `--system-{green,red}-rgb`,
  `--save-{ok,error}-*`, `--notice-{success,danger,warning}-{bg,text,border}`,
  `--status-{success,danger,info}-{bg,text}`, `--warning-panel-*`, `--math-error-*`
- Code/content: `--code-inline-*`, `--code-block-*`, `--syntax-*`, `--math-source-*`, `--blockquote-*`,
  `--mark-bg`, `--search-{match,current}-{bg,ring}`, `--block-*` (front matter)
- Preferences: `--prefs-*`, `--pref-*`
Exported HTML copies only `.gdown-editor` rules, so content tokens also get light values on
`.gdown-editor.content` in `style.css` — add new content tokens there too.

## Git

- Repo: https://github.com/gdilla/gdown
- Commit style: `feat:`, `fix:`, `chore:`, `perf:` prefixes
- Never commit to main directly
- Pre-commit hook runs lint-staged + typecheck automatically

## Common Mistakes

<!-- Say "Add that to CLAUDE.md Common Mistakes" when Claude makes an error -->

- **DO NOT** call `editorModeStore.toggleMode()` directly for WYSIWYG→source — it skips content capture.
  Use `window.dispatchEvent(new CustomEvent('gdown:toggle-mode'))` instead (Editor.vue handles it).
- **DO NOT** add Cmd+/ handling to App.vue — it causes double-fire and clears document content.
- **Cargo lib name** is `leaf_lib` (not `gdown_lib`) — main.rs calls `leaf_lib::run()`.
- Mermaid and MathJax are **lazy-loaded** — do not add top-level imports of these packages.
- The source editor is `src/components/source/SourceEditor.vue`; it is mounted only when source mode is active.
- **DO NOT** load a tab into the rich editor without checking `tab.sourceOnly`, and do not add per-edit
  work that scans the whole document without checking it against the limits in `documentLimits.ts`.
- **Test files use `.test.ts`** extension (not `.spec.ts`). Tests live in `src/__tests__/` mirroring `src/` structure.
- **Worktree pnpm setup:** `pnpm-workspace.yaml` intentionally denies esbuild build scripts. Do not symlink binaries, approve dependency scripts ad hoc, or bypass hooks with `--no-verify`. Report missing build outputs as a setup/config failure and handle policy changes separately.
