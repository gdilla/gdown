# Source Editor — CodeMirror 6

## Architecture
`SourceEditor.vue` is the CodeMirror-based raw markdown editor. It is a **completely separate component** from `Editor.vue` (Tiptap). They are never mounted simultaneously — App.vue uses `v-if` to switch.

## Mode Switching (CRITICAL)
- **Source → WYSIWYG:** SourceEditor.vue handles Cmd+/ via a window keydown listener with `stopImmediatePropagation`. `captureEditorState()` saves body markdown, front-matter and `doc: null` to tab state, then it calls `editorModeStore.setMode('wysiwyg')`.
- **WYSIWYG → Source:** Editor.vue handles this (not SourceEditor). The markdown is already saved to tab state before SourceEditor mounts.
- **On mount:** SourceEditor assembles `tab.editorState.frontmatter` + `tab.editorState.markdown` to initialize CodeMirror content.
- **Undo boundary:** tab switches and file reloads go through `restoreContent()`, which replaces the whole `EditorState` (`view.setState`) so Undo cannot reach the previous document. Do not load content with `dispatch({ changes })` — even with `addToHistory: false`, older history entries replay into the new document.
- **NEVER** add Cmd+/ handling to App.vue — it causes double-fire bugs.

## CodeMirror Extensions
Custom extensions are in `src/codemirror/`:
- Math highlight and preview
- Frontmatter detection
- MathJax inline preview

## Conventions
- Use CodeMirror 6 API (not legacy CM5)
- Extensions go in `src/codemirror/`
- State updates flow through Pinia stores, not direct DOM manipulation
