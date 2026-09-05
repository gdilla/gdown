<template>
  <div class="source-editor-wrapper">
    <div ref="editorContainer" class="source-editor-container"></div>
    <div v-if="mathPreviewVisible" ref="mathPreviewPanel" class="math-preview-panel">
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
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
} from '@codemirror/language'
import { mathHighlightPlugin, extractMathExpressions } from '../../codemirror/math-language'
import { renderMathToSvg } from '../../codemirror/mathjax-preview'
import {
  frontmatterHighlightPlugin,
  frontmatterHighlightTheme,
} from '../../codemirror/frontmatter-highlight'
import { parseFrontMatter, assembleFrontMatter } from '../../utils/frontmatter'
import { useTabsStore } from '../../stores/tabs'
import { useEditorModeStore } from '../../stores/editorMode'
import { useEditorSettingsStore } from '../../stores/editorSettings'
import { buildSourceEditorSettings } from '../../codemirror/source-editor-settings'
import type { Tab } from '../../types/tab'

const tabsStore = useTabsStore()
const editorModeStore = useEditorModeStore()
const editorSettings = useEditorSettingsStore()

const editorContainer = ref<HTMLElement | null>(null)
const mathPreviewVisible = ref(false)
const mathPreviewHtml = ref('')
const cmView = shallowRef<EditorView | null>(null)
const settingsCompartment = new Compartment()

// Flag to suppress modification tracking during content restoration
let isRestoringContent = false
// The tab represented by this mounted editor. activeTabId can move before
// Vue unmounts the editor when switching to an image tab.
let renderedTabId: string | null = null

/**
 * Build the full set of CodeMirror extensions
 */
function buildExtensions(): Extension[] {
  return [
    settingsCompartment.of(
      buildSourceEditorSettings({
        showLineNumbers: editorSettings.showLineNumbers,
        showWhitespace: editorSettings.showWhitespace,
        indentSize: editorSettings.indentSize,
        softTabs: editorSettings.softTabs,
        spellCheck: editorSettings.spellCheck,
      }),
    ),
    highlightActiveLine(),
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
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !isRestoringContent) {
        const tabId = renderedTabId
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
    EditorView.lineWrapping,
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: 'var(--editor-font-size, 16px)',
        color: 'var(--text-primary, #333)',
        backgroundColor: 'var(--bg-primary, #fff)',
      },
      '.cm-scroller': {
        fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
        lineHeight: 'var(--editor-line-height, 1.6)',
        padding: '16px 0',
      },
      '.cm-content': {
        padding: '0 clamp(16px, 5vw, 60px)',
        maxWidth: 'min(100%, var(--editor-max-width, 860px))',
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
    expressions.map((expr) => renderMathToSvg(expr.expression, expr.isBlock)),
  )

  const parts: string[] = expressions.map((expr, i) => {
    const typeLabel = expr.isBlock ? 'Display' : 'Inline'
    const wrapperClass = expr.isBlock
      ? 'math-preview-item math-preview-display'
      : 'math-preview-item math-preview-inline'
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
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

/** Capture raw content and navigation state before a tab or mode change. */
function captureEditorState(tabId: string): void {
  if (!cmView.value) return
  const content = cmView.value.state.doc.toString()
  const { rawYaml, attributes, body, hasFrontMatter } = parseFrontMatter(content)
  const { from, to } = cmView.value.state.selection.main
  tabsStore.saveEditorState(tabId, {
    markdown: body,
    doc: null,
    frontmatter: hasFrontMatter ? rawYaml : null,
    frontmatterAttributes: hasFrontMatter ? attributes : {},
    scrollTop: cmView.value.scrollDOM.scrollTop,
    selection: { from, to },
  })
}

function restoreNavigation(tab: Tab): void {
  if (!cmView.value) return
  const length = cmView.value.state.doc.length
  const from = Math.max(0, Math.min(tab.editorState.selection.from, length))
  const to = Math.max(from, Math.min(tab.editorState.selection.to, length))
  cmView.value.dispatch({ selection: { anchor: from, head: to } })
  cmView.value.scrollDOM.scrollTop = tab.editorState.scrollTop
}

function restoreTab(tab: Tab): void {
  restoreContent(assembleFrontMatter(tab.editorState.frontmatter, tab.editorState.markdown || ''))
  nextTick(() => {
    if (renderedTabId !== tab.id || tabsStore.activeTabId !== tab.id || editorModeStore.isWysiwyg) {
      return
    }
    restoreNavigation(tab)
    if (!document.activeElement?.closest('[role="tab"], [role="tablist"]')) {
      cmView.value?.focus()
    }
  })
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
    if (renderedTabId) captureEditorState(renderedTabId)
    if (newTabId) {
      const tab = tabsStore.tabs.find((t) => t.id === newTabId)
      // Image tabs (and a null active tab) unmount this editor. Keep the
      // rendered id until onBeforeUnmount captures it.
      if (tab && !tab.isImage) {
        renderedTabId = newTabId
        nextTick(() => {
          if (
            renderedTabId !== newTabId ||
            tabsStore.activeTabId !== newTabId ||
            editorModeStore.isWysiwyg
          ) {
            return
          }
          restoreTab(tab)
          if (mathPreviewVisible.value) {
            updateMathPreview(cmView.value?.state.doc.toString() || '')
          }
        })
      }
    }
  },
)

// Reconfigure the live source editor when its visible preferences change.
// The compartment preserves the current document, selection, and history.
watch(
  [
    () => editorSettings.showLineNumbers,
    () => editorSettings.showWhitespace,
    () => editorSettings.indentSize,
    () => editorSettings.softTabs,
    () => editorSettings.spellCheck,
  ],
  () => {
    if (!cmView.value) return
    cmView.value.dispatch({
      effects: settingsCompartment.reconfigure(
        buildSourceEditorSettings({
          showLineNumbers: editorSettings.showLineNumbers,
          showWhitespace: editorSettings.showWhitespace,
          indentSize: editorSettings.indentSize,
          softTabs: editorSettings.softTabs,
          spellCheck: editorSettings.spellCheck,
        }),
      ),
    })
  },
)

// Handle external file reload — push new content into live CodeMirror editor
function handleFileReloaded(e: Event) {
  const { tabId, markdown } = (e as CustomEvent<{ tabId: string; markdown: string }>).detail
  if (tabId !== renderedTabId) return
  const tab = tabsStore.tabs.find((candidate) => candidate.id === tabId)
  if (!tab) return
  const fullContent = assembleFrontMatter(tab.editorState.frontmatter, markdown)
  restoreContent(fullContent)
  nextTick(() => {
    if (renderedTabId === tabId && tabsStore.activeTabId === tabId) restoreNavigation(tab)
  })
}

function handleCaptureState() {
  if (renderedTabId) captureEditorState(renderedTabId)
}

function handleKeydown(e: KeyboardEvent) {
  // Cmd+/: switch back to WYSIWYG mode (Editor.vue handles the other direction)
  if (e.metaKey && !e.shiftKey && e.key === '/') {
    e.preventDefault()
    e.stopImmediatePropagation() // prevent any other window keydown listeners
    if (renderedTabId) captureEditorState(renderedTabId)
    editorModeStore.setMode('wysiwyg')
  }
}

onMounted(() => {
  const tab = tabsStore.activeTab
  if (tab && !tab.isImage) renderedTabId = tab.id
  initEditor()
  if (tab && !tab.isImage && cmView.value) {
    restoreNavigation(tab)
    if (!document.activeElement?.closest('[role="tab"], [role="tablist"]')) {
      cmView.value.focus()
    }
  }
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('gdown:file-reloaded', handleFileReloaded)
  window.addEventListener('gdown:capture-state', handleCaptureState)
})

onBeforeUnmount(() => {
  if (renderedTabId) captureEditorState(renderedTabId)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('gdown:file-reloaded', handleFileReloaded)
  window.removeEventListener('gdown:capture-state', handleCaptureState)
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
