# Stores — Pinia State Management

## Pattern
All stores use the composable (setup) style with `defineStore`:

```ts
export const useMyStore = defineStore('myStore', () => {
  const value = ref<Type>(default)
  const derived = computed(() => ...)
  function action() { ... }
  return { value, derived, action }
})
```

## Rules
- One store per domain — don't put unrelated state in the same store
- Use `ref()` for state, `computed()` for derived, plain functions for actions
- Prefer `computed()` over `watch()` when possible
- Store files go in `src/stores/`, named after the domain (e.g., `tabs.ts`, `preferences.ts`)
- Avoid circular imports between stores — use lazy `import()` if needed (see tabs.ts → autoSave.ts pattern)

## Testing
- Every store must have tests in `src/__tests__/stores/`
- Test with `createPinia()` + `setActivePinia()` in `beforeEach`
- Mock Tauri APIs (`@tauri-apps/api/core` invoke) in setup.ts
- Don't test methods that directly call Tauri commands — those are integration tests

## Existing Stores
- `tabs.ts` — Tab CRUD, active tab, content persistence
- `preferences.ts` — Theme, font, editor settings with localStorage persistence
- `autoSave.ts` — Debounced save, conflict detection
- `editorMode.ts` — WYSIWYG/source mode toggle
- `sidebar.ts` — File tree visibility and folder state
- `outline.ts` — Heading extraction and navigation
- `findReplace.ts` — Search/replace panel state
- `focusMode.ts` — Focus mode toggle
- `typewriterMode.ts` — Typewriter mode toggle
- `wordCount.ts` — Word/character/line counting
- `session.ts` — Session save/restore
- `recentFiles.ts` — Recent files tracking
