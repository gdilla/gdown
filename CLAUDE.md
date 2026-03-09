# CLAUDE.md

## Tech Stack

- **Framework:** Vue 3 + TypeScript 5.9 (strict), `<script setup>` Composition API
- **Desktop shell:** Tauri 2 (Rust backend in `src-tauri/`)
- **Rich editor:** Tiptap v3 (WYSIWYG mode)
- **Source editor:** CodeMirror 6 (raw markdown mode)
- **State:** Pinia 3
- **Build:** Vite 7
- **Package manager:** pnpm (use `pnpm`, never `npm` or `yarn`)
- **Type check:** `pnpm typecheck` (runs `vue-tsc -b --noEmit`)
- **Diagrams:** Mermaid 11
- **Math:** KaTeX + MathJax
- **Markdown parsing:** markdown-it + Turndown (HTML→MD conversion)

## Project Structure

```
typora-clone/
├── src/
│   ├── components/       — Vue components (Editor.vue, sidebar/, tabs/, etc.)
│   ├── composables/      — Reusable Vue composables
│   ├── extensions/       — Custom Tiptap extensions
│   ├── services/         — Business logic / file system services
│   ├── stores/           — Pinia stores
│   ├── styles/           — Global CSS/SCSS
│   ├── types/            — TypeScript type definitions
│   └── utils/            — Pure utility functions
├── src-tauri/
│   ├── src/              — Rust backend (Tauri commands)
│   ├── capabilities/     — Tauri permission configs
│   └── tauri.conf.json   — App config (window, bundle, etc.)
└── public/               — Static assets
```

## Code Conventions

- Always use `<script setup lang="ts">` — no Options API
- Pinia stores live in `src/stores/`, one file per domain
- Custom Tiptap extensions go in `src/extensions/`
- Composables follow `use` prefix convention (e.g. `useEditor.ts`)
- No hardcoded colors — use CSS custom properties
- Prefer `computed()` over watchers for derived state

## Dev Workflow

```bash
pnpm dev          # Start Tauri dev (hot reload)
pnpm vite:dev     # Frontend only (no Tauri shell)
pnpm typecheck    # Type check (vue-tsc)
pnpm build        # Full Tauri production build
```

> First run requires Rust toolchain and Tauri CLI. See Tauri 2 docs.

## Git

- No enforced convention detected — use descriptive branch names
- Commit messages: `feat:`, `fix:`, `chore:` prefixes preferred

## Common Mistakes

<!-- When Claude makes a mistake and you correct it, say "Add that to CLAUDE.md Common Mistakes" to build project-specific rules over time -->
