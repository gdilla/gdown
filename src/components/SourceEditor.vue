<template>
  <div class="source-editor-wrapper">
    <div class="source-editor-container" ref="editorContainer">
      <div ref="cmContainer" class="source-editor-cm"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { languages } from '@codemirror/language-data'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
} from '@codemirror/language'
import { frontmatterHighlightPlugin, frontmatterHighlightTheme } from '../codemirror/frontmatter-highlight'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
}>()

const cmContainer = ref<HTMLElement | null>(null)

let view: EditorView | null = null
let isExternalUpdate = false

/**
 * Create the CodeMirror theme to match gdown's styling.
 */
function createGdownTheme() {
  return EditorView.theme({
    '&': {
      fontSize: '14px',
      fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
      height: '100%',
    },
    '.cm-content': {
      padding: '40px 60px',
      maxWidth: '860px',
      margin: '0 auto',
      caretColor: '#333',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#ccc',
      paddingLeft: '8px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      fontSize: '12px',
      minWidth: '3em',
      padding: '0 8px 0 0',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(0, 122, 255, 0.04)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: '#999',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(0, 122, 255, 0.15) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(0, 122, 255, 0.2) !important',
    },
    '.cm-cursor': {
      borderLeftColor: '#333',
      borderLeftWidth: '1.5px',
    },
    '.cm-foldGutter': {
      width: '14px',
    },
    // Markdown-specific syntax highlighting
    '.cm-header-1': { fontSize: '1.6em', fontWeight: '700' },
    '.cm-header-2': { fontSize: '1.4em', fontWeight: '600' },
    '.cm-header-3': { fontSize: '1.2em', fontWeight: '600' },
    '.cm-header-4': { fontSize: '1.1em', fontWeight: '600' },
    '.cm-header-5': { fontWeight: '600' },
    '.cm-header-6': { fontWeight: '600', color: '#777' },
  })
}

function createEditorState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      drawSelection(),
      bracketMatching(),
      foldGutter(),
      indentOnInput(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      frontmatterHighlightPlugin,
      frontmatterHighlightTheme,
      createGdownTheme(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isExternalUpdate) {
          const newContent = update.state.doc.toString()
          emit('update:modelValue', newContent)
          emit('change', newContent)
        }
      }),
    ],
  })
}

/**
 * Set the CodeMirror content programmatically (e.g. when switching tabs or modes).
 */
function setContent(content: string): void {
  if (!view) return
  const currentContent = view.state.doc.toString()
  if (currentContent === content) return

  isExternalUpdate = true
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: content,
    },
  })
  isExternalUpdate = false
}

/**
 * Get the current content from CodeMirror.
 */
function getContent(): string {
  if (!view) return props.modelValue
  return view.state.doc.toString()
}

/**
 * Focus the CodeMirror editor.
 */
function focus(): void {
  view?.focus()
}

/**
 * Get the current scroll position.
 */
function getScrollTop(): number {
  return view?.scrollDOM.scrollTop ?? 0
}

/**
 * Set the scroll position.
 */
function setScrollTop(top: number): void {
  if (view) {
    view.scrollDOM.scrollTop = top
  }
}

// Watch for external content changes (e.g. tab switches)
watch(
  () => props.modelValue,
  (newValue) => {
    if (view) {
      const currentContent = view.state.doc.toString()
      if (currentContent !== newValue) {
        setContent(newValue)
      }
    }
  }
)

onMounted(() => {
  if (!cmContainer.value) return

  const state = createEditorState(props.modelValue)
  view = new EditorView({
    state,
    parent: cmContainer.value,
  })

  // Focus the editor
  view.focus()
})

onBeforeUnmount(() => {
  if (view) {
    view.destroy()
    view = null
  }
})

// Expose methods for parent component
defineExpose({
  setContent,
  getContent,
  focus,
  getScrollTop,
  setScrollTop,
})
</script>

<style>
.source-editor-wrapper {
  position: relative;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.source-editor-container {
  flex: 1;
  overflow: hidden;
}

.source-editor-cm {
  height: 100%;
}

.source-editor-cm .cm-editor {
  height: 100%;
  outline: none;
}

.source-editor-cm .cm-scroller {
  overflow: auto;
}
</style>
