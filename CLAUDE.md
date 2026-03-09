# CLAUDE.md — Leaf

Leaf is a Typora-inspired markdown editor built with Tauri 2 + Vue 3 + Tiptap v3.
GitHub: https://github.com/gdilla/gdown

## Quality Gates

Every change must pass these before merge:

```bash
pnpm check        # typecheck + lint + rust:lint (combined gate)
pnpm test         # vitest unit tests
pnpm build        # full Tauri build (for release)
```

Individual gates:
```bash
pnpm typecheck    # vue-tsc --noEmit
pnpm lint         # ESLint (src/)
pnpm rust:lint    # cargo clippy -D warnings
pnpm rust:fmt     # cargo fmt --check
pnpm test         # vitest run
```

## Feature Development Protocol

1. Create an isolated worktree for the feature:
   ```bash
   git fetch origin
   BRANCH="feat/<name>"
   git worktree add "worktrees/$BRANCH" -b "$BRANCH" origin/main
   cd "worktrees/$BRANCH" && pnpm install
   ```
2. Write failing tests first in `src/__tests__/`
3. Implement the feature
4. Run `pnpm check && pnpm test` — all must pass
5. Self-review the diff
6. Commit with conventional prefix (`feat:`, `fix:`, `chore:`, `perf:`)
7. Create PR with summary and test plan
8. After merge, clean up: `git worktree remove "worktrees/$BRANCH" && git branch -d "$BRANCH"`

**Worktree rules:** Always create worktrees inside `typora-clone/worktrees/` — NEVER as siblings in `../` (that pollutes the parent projects folder). Run `pnpm install` in each new worktree. Multiple features can run in parallel in separate worktrees.

## Done Criteria

A PR is ready when:
- All quality gates pass (`pnpm check && pnpm test`)
- Tests cover the new behavior
- No `any` types introduced
- CSS uses custom properties only (no hardcoded colors)
- CLAUDE.md updated if architecture changed

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
typora-clone/
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
│   │   └── preferences/      — Preferences window (6 panes)
│   ├── extensions/           — Custom Tiptap extensions (GdownTable, MermaidBlock, etc.)
│   ├── stores/               — Pinia stores (tabs, autoSave, preferences, editorMode, etc.)
│   ├── utils/
│   │   ├── markdownConverter.ts  — htmlToMarkdown (Turndown) + markdownToHtml (markdown-it)
│   │   ├── mathRenderer.ts       — MathJax lazy singleton
│   │   └── frontmatter.ts        — YAML front-matter parsing
│   ├── codemirror/           — CodeMirror extensions (math highlight, frontmatter, mathjax preview)
│   └── style.css             — CSS custom properties for all themes
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs            — Tauri setup, menu builder, event handlers
│   │   ├── main.rs           — Entry point (calls leaf_lib::run())
│   │   └── commands/         — fs.rs, export.rs, session.rs
│   └── tauri.conf.json       — App config (productName: "Leaf", identifier: com.gautambanerjee.leaf)
├── .github/workflows/ci.yml  — CI: typecheck, lint, test, clippy, rustfmt
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
1. WYSIWYG→source: `handleToggleMode()` in Editor.vue reads `editor.getHTML()`, converts to markdown,
   saves to `tabsStore.saveEditorState(tabId, { markdown })` BEFORE calling `setMode('source')`
2. Source→wysiwyg: `onMounted` in Editor.vue reads `tab.editorState.markdown` and loads into Tiptap
3. `captureState()` in Editor.vue `onBeforeUnmount` MUST NOT overwrite tab state with empty content
   (guarded: only saves if `body.trim()` is non-empty)

**Keyboard shortcut rule:** Cmd+/ is handled by:
- `Editor.vue` window listener → wysiwyg→source (calls `handleToggleMode`)
- `source/SourceEditor.vue` window listener → source→wysiwyg (calls `setMode('wysiwyg')`)
- App.vue does NOT handle Cmd+/ (removed to prevent double-fire bug)

## Dev Workflow

```bash
pnpm dev          # Start Tauri dev server (hot reload, Vite on :1420)
pnpm vite:dev     # Frontend only (no Tauri window)
pnpm check        # All quality gates (typecheck + lint + rust lint)
pnpm test         # Vitest unit tests
pnpm build        # Full release build → Leaf.app + Leaf.dmg
```

## Build & Install (macOS)

```bash
# 1. Build release bundle
pnpm build
# Output: src-tauri/target/release/bundle/macos/Leaf.app
#         src-tauri/target/release/bundle/dmg/Leaf_0.1.0_aarch64.dmg

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
- The embedded `src/components/SourceEditor.vue` (inside Editor.vue) is never actually shown
  (Editor.vue is unmounted when source mode is active). The real source editor is `source/SourceEditor.vue`.
- **Test files use `.test.ts`** extension (not `.spec.ts`). Tests live in `src/__tests__/` mirroring `src/` structure.
- **Worktree pnpm issue:** `pnpm install` in new worktrees skips esbuild build scripts (interactive `pnpm approve-builds` prompt can't run in non-interactive shells). This causes missing `node_modules/.bin/esbuild` and typecheck failures for transitive type declarations (`@lezer/highlight`, `@tiptap/extension-*`). Workaround: manually symlink esbuild — `ln -sf ../.pnpm/esbuild@<version>/node_modules/esbuild/bin/esbuild node_modules/.bin/esbuild` — or commit with `--no-verify` if only pre-existing type errors remain.
