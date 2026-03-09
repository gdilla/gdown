Review the code changes in this branch for issues.

Focus areas (in priority order):
1. **Correctness** — Logic errors, wrong Tiptap/CodeMirror API usage, missing edge cases
2. **TypeScript** — No `any` types, proper interfaces, correct generic usage
3. **Vue 3 patterns** — `<script setup>` Composition API, proper ref/reactive/computed usage, correct lifecycle hooks
4. **Tiptap extensions** — Correct Node/Mark schema, proper `addCommands`, no memory leaks in `addProseMirrorPlugins`
5. **Tauri IPC** — Correct `invoke()` usage, proper error handling on Tauri commands, capability permissions match usage
6. **Performance** — Unnecessary reactivity, missing `computed` where needed, large watchers, editor transaction efficiency
7. **Error handling** — Missing try/catch on async Tauri calls, no user-facing error states
8. **Style conventions** — CSS custom properties, no hardcoded colors/spacing

Output format:
For each issue found, output:
- **Priority:** 🔴 Must fix | 🟡 Should fix | 🟢 Nice to have
- **File:** path/to/file.vue:lineNumber
- **Issue:** What's wrong
- **Fix:** How to fix it

Review staged changes first (`git diff --cached`), then unstaged (`git diff`). If neither has changes, review the diff against the base branch.
