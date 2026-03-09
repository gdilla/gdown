<template>
  <div class="source-editor-wrapper">
    <div class="source-editor-container" ref="editorContainer"></div>
    <div
      v-if="mathPreviewVisible"
      class="math-preview-panel"
      ref="mathPreviewPanel"
    >
      <div class="math-preview-header">
        <span class="math-preview-title">Math Preview</span>
        <button class="math-preview-close" @click="mathPreviewVisible = false">&times;</button>
      </div>
      <div class="math-preview-content" v-html="mathPreviewHtml"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, shallowRef } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language'
import { mathHighlightPlugin, extractMathExpressions } from '../../codemirror/math-language'
import { renderMathToSvg } from '../../codemirror/mathjax-preview'
import { frontmatterHighlightPlugin, frontmatterHighlightTheme } from '../../codemirror/frontmatter-highlight'
import { parseFrontMatter, assembleFrontMatter } from '../../utils/frontmatter'
import { useTabsStore } from '../../stores/tabs'
import { useEditorModeStore } from '../../stores/editorMode'

const tabsStore = useTabsStore()
const editorModeStore = useEditorModeStore()

const editorContainer = ref<HTMLElement | null>(null)
const mathPreviewVisible = ref(false)
const mathPreviewHtml = ref('')
const cmView = shallowRef<EditorView | null>(null)

// Flag to suppress modification tracking during content restoration
let isRestoringContent = false

/**
 * Build the full set of CodeMirror extensions
 */
function buildExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    bracketMatching(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
    }),
    mathHighlightPlugin,
    frontmatterHighlightPlugin,
    frontmatterHighlightTheme,
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !isRestoringContent) {
        const tabId = tabsStore.activeTabId
        if (tabId) {
          const content = update.state.doc.toString()
          // Parse front-matter out so body and front-matter are stored separately
          const { rawYaml, attributes, body, hasFrontMatter } = parseFrontMatter(content)
          tabsStore.setModified(tabId, true)
          tabsStore.saveEditorState(tabId, {
            markdown: body,
            doc: null, // source mode works with raw markdown
            frontmatter: hasFrontMatter ? rawYaml : null,
            frontmatterAttributes: hasFrontMatter ? attributes : {},
          })
          // Update math preview if visible
          if (mathPreviewVisible.value) {
            updateMathPreview(content)
          }
        }
      }
    }),
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '14px',
        color: 'var(--text-primary, #333)',
        backgroundColor: 'var(--bg-primary, #fff)',
      },
      '.cm-scroller': {
        fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
        lineHeight: '1.6',
        padding: '16px 0',
      },
      '.cm-content': {
        padding: '0 60px',
        maxWidth: '920px',
        caretColor: 'var(--text-primary, #333)',
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        border: 'none',
        color: 'var(--sidebar-title-color, #999)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'var(--text-primary, #333)',
      },
      // Math delimiter styles
      '.cm-math-delimiter': {
        color: '#b5bd68',
        fontWeight: 'bold',
      },
      '.cm-math-inline': {
        color: '#81a2be',
        fontStyle: 'italic',
      },
      '.cm-math-block-delimiter': {
        color: '#b5bd68',
        fontWeight: 'bold',
      },
      '.cm-math-block': {
        color: '#8abeb7',
      },
    }),
  ]
}

/**
 * Update the math preview panel with rendered math expressions.
 */
async function updateMathPreview(text: string) {
  const expressions = extractMathExpressions(text)
  if (expressions.length === 0) {
    mathPreviewHtml.value = '<p class="math-preview-empty">No math expressions found</p>'
    return
  }

  const renderedSvgs = await Promise.all(
    expressions.map(expr => renderMathToSvg(expr.expression, expr.isBlock))
  )

  const parts: string[] = expressions.map((expr, i) => {
    const typeLabel = expr.isBlock ? 'Display' : 'Inline'
    const wrapperClass = expr.isBlock ? 'math-preview-item math-preview-display' : 'math-preview-item math-preview-inline'
    return `
      <div class="${wrapperClass}">
        <div class="math-preview-label">${typeLabel} (line ${getLineNumber(text, expr.from)})</div>
        <div class="math-preview-rendered">${renderedSvgs[i]}</div>
        <div class="math-preview-source"><code>${escapeHtml(expr.expression)}</code></div>
      </div>
    `
  })
  mathPreviewHtml.value = parts.join('')
}

function getLineNumber(text: string, pos: number): number {
  let line = 1
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Get the full content (front-matter + body) from the active tab
 * for display in source mode.
 */
function getActiveContent(): string {
  const tab = tabsStore.activeTab
  if (!tab) return ''
  return assembleFrontMatter(tab.editorState.frontmatter, tab.editorState.markdown || '')
}

/**
 * Set up the CodeMirror editor.
 */
function initEditor() {
  if (!editorContainer.value) return

  const content = getActiveContent()

  const state = EditorState.create({
    doc: content,
    extensions: buildExtensions(),
  })

  cmView.value = new EditorView({
    state,
    parent: editorContainer.value,
  })
}

/**
 * Update editor content from tab state (e.g., on tab switch).
 */
function restoreContent(content: string) {
  if (!cmView.value) return
  isRestoringContent = true
  try {
    const currentDoc = cmView.value.state.doc.toString()
    if (currentDoc !== content) {
      cmView.value.dispatch({
        changes: {
          from: 0,
          to: cmView.value.state.doc.length,
          insert: content,
        },
      })
    }
  } finally {
    isRestoringContent = false
  }
}

/**
 * Toggle math preview panel.
 */
function toggleMathPreview() {
  mathPreviewVisible.value = !mathPreviewVisible.value
  if (mathPreviewVisible.value) {
    const content = cmView.value?.state.doc.toString() || ''
    updateMathPreview(content)
  }
}

// Expose toggle for parent components
defineExpose({ toggleMathPreview })

// Watch for active tab changes
watch(
  () => tabsStore.activeTabId,
  (newTabId, oldTabId) => {
    if (newTabId === oldTabId) return
    if (newTabId) {
      const tab = tabsStore.tabs.find(t => t.id === newTabId)
      if (tab) {
        nextTick(() => {
          const fullContent = assembleFrontMatter(tab.editorState.frontmatter, tab.editorState.markdown || '')
          restoreContent(fullContent)
          if (mathPreviewVisible.value) {
            updateMathPreview(fullContent)
          }
        })
      }
    }
  }
)

// Handle external file reload — push new content into live CodeMirror editor
function handleFileReloaded(e: Event) {
  const { tabId, markdown } = (e as CustomEvent<{ tabId: string; markdown: string }>).detail
  if (tabId !== tabsStore.activeTabId) return
  const tab = tabsStore.activeTab
  const fullContent = assembleFrontMatter(tab?.editorState.frontmatter ?? null, markdown)
  restoreContent(fullContent)
}

function handleKeydown(e: KeyboardEvent) {
  // Cmd+/: switch back to WYSIWYG mode (Editor.vue handles the other direction)
  if (e.metaKey && !e.shiftKey && e.key === '/') {
    e.preventDefault()
    e.stopImmediatePropagation() // prevent any other window keydown listeners
    editorModeStore.setMode('wysiwyg')
  }
}

onMounted(() => {
  initEditor()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('gdown:file-reloaded', handleFileReloaded)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('gdown:file-reloaded', handleFileReloaded)
  if (cmView.value) {
    cmView.value.destroy()
    cmView.value = null
  }
})
</script>

<style>
.source-editor-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.source-editor-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.source-editor-container .cm-editor {
  height: 100%;
  overflow: auto;
}

/* Math Preview Panel */
.math-preview-panel {
  width: 320px;
  border-left: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary, #fafafa);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.math-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.math-preview-close {
  background: none;
  border: none;
  font-size: 18px;
  color: #999;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.math-preview-close:hover {
  color: #333;
}

.math-preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.math-preview-empty {
  color: #999;
  font-size: 13px;
  font-style: italic;
  text-align: center;
  padding: 20px 0;
}

.math-preview-item {
  margin-bottom: 16px;
  padding: 10px;
  border-radius: 6px;
  background: white;
  border: 1px solid #e8e8e8;
}

.math-preview-label {
  font-size: 11px;
  color: #999;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.math-preview-rendered {
  text-align: center;
  padding: 8px 0;
  overflow-x: auto;
}

.math-preview-rendered mjx-container {
  margin: 0 auto;
}

.math-preview-rendered svg {
  max-width: 100%;
  height: auto;
}

.math-preview-source {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #f0f0f0;
}

.math-preview-source code {
  font-size: 11px;
  color: #666;
  font-family: 'SF Mono', 'Fira Code', Menlo, monospace;
  word-break: break-all;
}

.math-preview-display {
  border-left: 3px solid #8abeb7;
}

.math-preview-inline {
  border-left: 3px solid #81a2be;
}

.math-error {
  color: #c0392b;
  background: #fce4ec;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
}
</style>
