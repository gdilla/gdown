Create a new Vue component: $ARGUMENTS

Steps:
1. Search `src/components/` to make sure this component doesn't already exist
2. If it exists, show the user what's there and ask if they want to extend it instead
3. If it's new, create it in `src/components/ComponentName.vue` (or a subfolder if it fits an existing group like `editor/`, `sidebar/`, `tabs/`):
   - Use `<script setup lang="ts">`, TypeScript prop interfaces with defaults
   - No hardcoded colors — use CSS custom properties
   - Follow existing component patterns (see `Editor.vue` or `StatusBar.vue` as reference)
4. If the component wraps a Tiptap extension, also create `src/extensions/ComponentNameExtension.ts`
5. Show the user all file paths created and a summary of what was built
