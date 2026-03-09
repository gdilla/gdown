<template>
  <div class="source-editor-wrapper" ref="wrapperRef">
    <div class="source-editor-container" ref="editorRef"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, HighlightStyle } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { lintKeymap } from '@codemirror/lint'
import { tags } from '@lezer/highlight'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'scroll', scrollTop: number): void
}>()

const editorRef = ref<HTMLElement | null>(null)
const view = shallowRef<EditorView | null>(null)

// Flag to prevent update loops
let isUpdatingFromProp = false

/**
 * Custom Markdown-focused highlight style (Typora source-mode aesthetic)
 */
const markdownHighlightStyle = HighlightStyle.define([
  // Headings
  { tag: tags.heading1, color: '#333', fontWeight: '700', fontSize: '1.6em' },
  { tag: tags.heading2, color: '#333', fontWeight: '600', fontSize: '1.4em' },
  { tag: tags.heading3, color: '#333', fontWeight: '600', fontSize: '1.2em' },
  { tag: tags.heading4, color: '#444', fontWeight: '600' },
  { tag: tags.heading5, color: '#444', fontWeight: '600' },
  { tag: tags.heading6, color: '#666', fontWeight: '600' },
  // Emphasis
  { tag: tags.emphasis, fontStyle: 'italic', color: '#555' },
  { tag: tags.strong, fontWeight: '700', color: '#333' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#999' },
  // Code
  { tag: tags.monospace, fontFamily: '"SF Mono", "Fira Code", Menlo, Consolas, monospace', color: '#e96900', backgroundColor: '#f5f5f5', borderRadius: '3px' },
  // Links
  { tag: tags.link, color: '#4183c4', textDecoration: 'underline' },
  { tag: tags.url, color: '#4183c4' },
  // Metadata (front matter, etc.)
  { tag: tags.meta, color: '#b58900' },
  { tag: tags.processingInstruction, color: '#6a737d' },
  // Quote
  { tag: tags.quote, color: '#6a737d', fontStyle: 'italic' },
  // List markers
  { tag: tags.list, color: '#d73a49' },
  // Separator (---, ***)
  { tag: tags.contentSeparator, color: '#d0d0d0' },
  // Comments (HTML comments in markdown)
  { tag: tags.comment, color: '#6a737d', fontStyle: 'italic' },
  // Content / default
  { tag: tags.content, color: '#333' },
])

/**
 * Create the CodeMirror EditorState with all extensions.
 */
function createEditorState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      // Line numbers and gutter
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),

      // Core editor features
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),

      // Keymaps
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),

      // Markdown language support with code block language nesting
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),

      // Syntax highlighting
      syntaxHighlighting(markdownHighlightStyle),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

      // Editor configuration
      EditorView.lineWrapping,
      EditorState.tabSize.of(4),

      // Update listener — emit content changes
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isUpdatingFromProp) {
          const newDoc = update.state.doc.toString()
          emit('update:modelValue', newDoc)
        }

        // Emit scroll position on viewport changes
        if (update.geometryChanged || update.viewportChanged) {
          const scrollDom = update.view.scrollDOM
          emit('scroll', scrollDom.scrollTop)
        }
      }),

      // Theme: Typora source-mode inspired
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '15px',
          fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, "Liberation Mono", monospace',
        },
        '.cm-content': {
          padding: '16px 0',
          fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, "Liberation Mono", monospace',
          caretColor: '#333',
        },
        '.cm-scroller': {
          overflow: 'auto',
          padding: '0 20px',
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: '#333',
          borderLeftWidth: '2px',
        },
        '&.cm-focused .cm-selectionBackground, ::selection': {
          backgroundColor: '#d7e8fc',
        },
        '.cm-selectionBackground': {
          backgroundColor: '#d7e8fc !important',
        },
        '.cm-gutters': {
          backgroundColor: '#f8f8f8',
          color: '#b0b0b0',
          border: 'none',
          borderRight: '1px solid #e8e8e8',
          minWidth: '48px',
        },
        '.cm-activeLineGutter': {
          backgroundColor: '#f0f0f0',
          color: '#666',
        },
        '.cm-activeLine': {
          backgroundColor: 'rgba(0, 122, 255, 0.04)',
        },
        '.cm-foldGutter': {
          width: '14px',
        },
        '.cm-line': {
          padding: '0 8px',
          lineHeight: '1.7',
        },
        '.cm-matchingBracket': {
          backgroundColor: '#e0f0e0',
          outline: '1px solid #b0d0b0',
        },
        '.cm-searchMatch': {
          backgroundColor: '#ffdd57',
          borderRadius: '2px',
        },
        '.cm-searchMatch.cm-searchMatch-selected': {
          backgroundColor: '#ff9632',
        },
        '.cm-tooltip': {
          border: '1px solid #ddd',
          backgroundColor: '#fff',
        },
        '.cm-tooltip-autocomplete': {
          '& > ul > li[aria-selected]': {
            backgroundColor: '#4a9eff',
            color: '#fff',
          },
        },
      }),
    ],
  })
}

/**
 * Initialize the CodeMirror editor.
 */
function initEditor() {
  if (!editorRef.value) return

  const state = createEditorState(props.modelValue)

  view.value = new EditorView({
    state,
    parent: editorRef.value,
  })
}

/**
 * Set scroll position programmatically.
 */
function setScrollTop(scrollTop: number) {
  if (!view.value) return
  view.value.scrollDOM.scrollTop = scrollTop
}

/**
 * Get current scroll position.
 */
function getScrollTop(): number {
  if (!view.value) return 0
  return view.value.scrollDOM.scrollTop
}

/**
 * Focus the editor.
 */
function focus() {
  view.value?.focus()
}

/**
 * Get current cursor position.
 */
function getCursorPosition(): number {
  if (!view.value) return 0
  return view.value.state.selection.main.head
}

/**
 * Set cursor position.
 */
function setCursorPosition(pos: number) {
  if (!view.value) return
  const docLength = view.value.state.doc.length
  const safePos = Math.min(pos, docLength)
  view.value.dispatch({
    selection: { anchor: safePos },
  })
}

// Watch for external content changes (e.g., tab switching)
watch(
  () => props.modelValue,
  (newVal) => {
    if (!view.value) return

    const currentDoc = view.value.state.doc.toString()
    if (currentDoc !== newVal) {
      isUpdatingFromProp = true
      view.value.dispatch({
        changes: {
          from: 0,
          to: view.value.state.doc.length,
          insert: newVal,
        },
      })
      isUpdatingFromProp = false
    }
  }
)

onMounted(() => {
  initEditor()
})

onBeforeUnmount(() => {
  if (view.value) {
    view.value.destroy()
    view.value = null
  }
})

// Expose methods for parent component
defineExpose({
  focus,
  setScrollTop,
  getScrollTop,
  getCursorPosition,
  setCursorPosition,
  getView: () => view.value,
})
</script>

<style>
.source-editor-wrapper {
  position: relative;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.source-editor-container {
  flex: 1;
  overflow: hidden;
}

.source-editor-container .cm-editor {
  height: 100%;
}

.source-editor-container .cm-editor.cm-focused {
  outline: none;
}
</style>
