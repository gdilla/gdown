# Leaf

A Typora-inspired markdown editor for macOS, built with Tauri 2, Vue 3, and Tiptap v3.

Leaf gives you a seamless WYSIWYG editing experience with the ability to switch to raw markdown source at any time. It supports tables, code blocks with syntax highlighting, math (KaTeX + MathJax), Mermaid diagrams, and multiple themes — all in a fast, native desktop app.

## Features

- **Dual editing modes** — WYSIWYG (Tiptap) and source (CodeMirror 6), toggled with `Cmd+/`
- **Rich markdown** — tables, task lists, code blocks (syntax highlighted), blockquotes, images, links
- **Math rendering** — inline and block math via KaTeX and MathJax (lazy-loaded)
- **Mermaid diagrams** — rendered inline (lazy-loaded)
- **Themes** — light, dark, auto, solarized-light, solarized-dark, github
- **Tabs** — multi-tab editing with session restore
- **Sidebar** — file tree browser and document outline
- **File associations** — opens `.md`, `.markdown`, `.txt` and other text files natively
- **Export** — copy as markdown from the status bar
- **Native macOS app** — built with Tauri 2 for small binary size and low memory usage

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) (do **not** use npm or yarn)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- Tauri 2 CLI — installed automatically via `pnpm`

## Getting Started

```bash
# Install dependencies
pnpm install

# Start the dev server (hot reload)
pnpm dev

# Or run the frontend only (no Tauri window)
pnpm vite:dev
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Tauri dev server with hot reload |
| `pnpm build` | Full release build (Leaf.app + DMG) |
| `pnpm test` | Run Vitest unit tests |
| `pnpm check` | Typecheck + ESLint + Clippy (all quality gates) |
| `pnpm typecheck` | `vue-tsc --noEmit` |
| `pnpm lint` | ESLint on `src/` |
| `pnpm lint:fix` | ESLint with auto-fix |
| `pnpm rust:lint` | `cargo clippy -D warnings` |
| `pnpm rust:fmt` | `cargo fmt --check` |
| `pnpm test:watch` | Vitest in watch mode |

## Build & Install (macOS)

```bash
# Build the release bundle
pnpm build

# Ad-hoc sign for local use
codesign --force --deep --sign - src-tauri/target/release/bundle/macos/Leaf.app

# Copy to Applications
cp -r src-tauri/target/release/bundle/macos/Leaf.app /Applications/
```

Build outputs:
- `src-tauri/target/release/bundle/macos/Leaf.app`
- `src-tauri/target/release/bundle/dmg/Leaf_0.1.0_aarch64.dmg`

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| Frontend | Vue 3 + TypeScript 5.9 |
| WYSIWYG editor | Tiptap v3 |
| Source editor | CodeMirror 6 |
| State management | Pinia 3 |
| Build tool | Vite 7 |
| Testing | Vitest + @vue/test-utils |
| Linting | ESLint + Prettier + Clippy + rustfmt |
| Math | KaTeX + MathJax |
| Diagrams | Mermaid 11 |
| Markdown parsing | markdown-it + Turndown |

## Project Structure

```
├── src/
│   ├── App.vue                  — Root component, keyboard shortcuts
│   ├── components/
│   │   ├── Editor.vue           — Tiptap WYSIWYG editor
│   │   ├── source/SourceEditor.vue — CodeMirror source editor
│   │   ├── StatusBar.vue        — Status bar with mode toggle
│   │   ├── sidebar/             — File tree and outline panels
│   │   ├── tabs/                — Tab bar
│   │   └── preferences/         — Preferences window (6 panes)
│   ├── extensions/              — Custom Tiptap extensions
│   ├── stores/                  — Pinia stores (one per domain)
│   ├── codemirror/              — CodeMirror extensions
│   ├── utils/                   — Markdown converter, math renderer, frontmatter
│   └── __tests__/               — Vitest unit tests
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs               — Tauri setup, menus, events
│   │   ├── main.rs              — Entry point
│   │   └── commands/            — File I/O, export, session commands
│   └── tauri.conf.json          — App configuration
└── .github/workflows/ci.yml    — CI pipeline
```

## License

Private project. Not currently open-source.
