# Extensions — Tiptap Custom Extensions

## Naming
All custom extensions use the `Gdown` prefix: `GdownTable`, `GdownMermaid`, `MathBlock`, etc.

## Creating a New Extension

1. Create file in `src/extensions/` named after the extension
2. Use `Node.create()` or `Mark.create()` from `@tiptap/core`
3. Define `name`, `group`, `content`, `parseHTML`, `renderHTML`
4. Register in `Editor.vue`'s `useEditor()` extensions array
5. Add corresponding Turndown rule in `src/utils/markdownConverter.ts` for HTML→MD
6. Add markdown-it plugin/rule if needed for MD→HTML
7. Write tests in `src/__tests__/extensions/`

## Conventions
- Extensions should be self-contained — all schema, commands, and input rules in one file
- Use `addAttributes()` for configurable node attributes
- Use `addKeyboardShortcuts()` for extension-specific shortcuts
- Heavy dependencies (Mermaid, MathJax) MUST be lazy-loaded via dynamic `import()`
- Never import `mermaid` or `mathjax-full` at the top level

## Testing
- Test the extension's schema (can it parse expected HTML?)
- Test markdown round-trip (MD → HTML → MD preserves content)
