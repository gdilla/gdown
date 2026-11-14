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
import { search, searchKeymap, openSearchPanel } from '@codemirror/search'
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
import { useOutlineStore } from '../../stores/outline'
import { buildSourceEditorSettings } from '../../codemirror/source-editor-settings'
import type { Tab } from '../../types/tab'

const tabsStore = useTabsStore()
const editorModeStore = useEditorModeStore()
const editorSettings = useEditorSettingsStore()
const outlineStore = useOutlineStore()

const editorContainer = ref<HTMLElement | null>(null)
const mathPreviewVisible = ref(false)
const mathPreviewHtml = ref('')
const cmView = shallowRef<EditorView | null>(null)
const settingsCompartment = new Compartment()

// The tab represented by this mounted editor. activeTabId can move before
// Vue unmounts the editor when switching to an image tab.
let renderedTabId: string | null = null

// Outline headings are re-scanned once edits settle, not on every keystroke.
const OUTLINE_REFRESH_MS = 150
let outlineTimer: ReturnType<typeof setTimeout> | null = null

function refreshOutline(): void {
  if (outlineTimer) clearTimeout(outlineTimer)
  outlineTimer = null
  const view = cmView.value
  if (!view) return
  outlineStore.updateFromMarkdown(view.state.doc.toString())
  outlineStore.setActiveHeading(view.state.selection.main.head)
}

function scheduleOutlineRefresh(): void {
  if (outlineTimer) clearTimeout(outlineTimer)
  outlineTimer = setTimeout(refreshOutline, OUTLINE_REFRESH_MS)
}

// Shift+Cmd+G is the app-wide "Open by Path" shortcut, so find-previous stays
// on Shift+F3 / Shift+Enter instead of shadowing it.
const sourceSearchKeymap = searchKeymap.map((binding) =>
  binding.key === 'Mod-g' ? { ...binding, shift: undefined } : binding,
)

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
    search({ top: true }),
    keymap.of([...sourceSearchKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.updateListener.of((update) => {
      // restoreContent() swaps state without firing this listener; it
      // refreshes the outline itself.
      if (update.docChanged) scheduleOutlineRefresh()
      else if (update.selectionSet) outlineStore.setActiveHeading(update.state.selection.main.head)
      if (update.docChanged) {
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
        color: 'var(--math-source-delimiter)',
        fontWeight: 'bold',
      },
      '.cm-math-inline': {
        color: 'var(--math-source-inline)',
        fontStyle: 'italic',
      },
      '.cm-math-block-delimiter': {
        color: 'var(--math-source-delimiter)',
        fontWeight: 'bold',
      },
      '.cm-math-block': {
        color: 'var(--math-source-block)',
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
 * Update editor content from tab state (e.g., on tab switch or file reload).
 * A fresh state, not a change dispatch, so Undo cannot cross into the previous
 * document: a change with addToHistory false still lets older history entries
 * replay into the new one. setState also skips the update listener.
 */
function restoreContent(content: string) {
  if (!cmView.value) return
  cmView.value.setState(EditorState.create({ doc: content, extensions: buildExtensions() }))
  refreshOutline()
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

/** Open CodeMirror's find/replace panel (App.vue routes Cmd+F / Cmd+H here). */
function openFind(): void {
  if (cmView.value) openSearchPanel(cmView.value)
}

/** Outline click: `pos` is a character offset in this document (front matter + body). */
function navigateToHeading(pos: number): void {
  const view = cmView.value
  if (!view) return
  const anchor = Math.max(0, Math.min(pos, view.state.doc.length))
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 60 }),
  })
  view.focus()
}

// Expose for parent components
defineExpose({ toggleMathPreview, openFind, navigateToHeading })

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
  refreshOutline()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('gdown:file-reloaded', handleFileReloaded)
  window.addEventListener('gdown:capture-state', handleCaptureState)
})

onBeforeUnmount(() => {
  if (renderedTabId) captureEditorState(renderedTabId)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('gdown:file-reloaded', handleFileReloaded)
  window.removeEventListener('gdown:capture-state', handleCaptureState)
  // Source offsets are meaningless to the WYSIWYG editor that mounts next.
  if (outlineTimer) clearTimeout(outlineTimer)
  outlineTimer = null
  outlineStore.clearHeadings()
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

/* CodeMirror search panel — theme variables override its light-only defaults */
.source-editor-container .cm-editor .cm-panels {
  background-color: var(--tab-bar-bg);
  color: var(--text-primary);
  border-color: var(--tab-bar-border);
}

.source-editor-container .cm-editor .cm-search input,
.source-editor-container .cm-editor .cm-search .cm-button {
  background: var(--bg-primary);
  background-image: none;
  color: var(--text-primary);
  border: 1px solid var(--sidebar-border);
  border-radius: 4px;
}

.source-editor-container .cm-editor .cm-search input:focus {
  outline: 1px solid var(--tab-active-indicator);
}

.source-editor-container .cm-editor .cm-search .cm-button:hover {
  background: var(--tab-hover-bg);
}

.source-editor-container .cm-editor .cm-search button[name='close'] {
  color: var(--tab-close-color);
}

.source-editor-container .cm-editor .cm-searchMatch {
  background-color: var(--sidebar-selected-bg);
  outline: 1px solid var(--sidebar-border);
}

.source-editor-container .cm-editor .cm-searchMatch-selected {
  background-color: var(--sidebar-selected-bg);
  outline: 1px solid var(--tab-active-indicator);
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
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.math-preview-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.math-preview-close:hover {
  color: var(--text-primary);
}

.math-preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.math-preview-empty {
  color: var(--text-faint);
  font-size: 13px;
  font-style: italic;
  text-align: center;
  padding: 20px 0;
}

.math-preview-item {
  margin-bottom: 16px;
  padding: 10px;
  border-radius: 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
}

.math-preview-label {
  font-size: 11px;
  color: var(--text-faint);
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
  border-top: 1px solid var(--border-faint);
}

.math-preview-source code {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: 'SF Mono', 'Fira Code', Menlo, monospace;
  word-break: break-all;
}

.math-preview-display {
  border-left: 3px solid var(--math-source-block);
}

.math-preview-inline {
  border-left: 3px solid var(--math-source-inline);
}

.math-error {
  color: var(--math-preview-error-text);
  background: var(--status-danger-bg);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
}
</style>
