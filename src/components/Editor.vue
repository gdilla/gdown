<template>
  <div
    ref="editorWrapper"
    class="editor-wrapper"
    :class="{
      'focus-mode': focusModeStore.enabled,
      'typewriter-mode': typewriterModeStore.enabled,
    }"
  >
    <!-- WYSIWYG mode (TipTap) -->
    <div
      v-show="editorModeStore.isWysiwyg"
      ref="editorContainer"
      class="editor-container"
      @scroll.passive="handleScroll"
    >
      <editor-content :editor="editor" class="editor-content" />
    </div>
    <LinkTooltip v-if="editor && editorModeStore.isWysiwyg" :editor="editor" />
    <InsertLinkDialog v-if="editor && editorModeStore.isWysiwyg" :editor="editor" />

    <!-- Source mode (CodeMirror 6) -->
    <SourceEditor
      v-show="editorModeStore.isSource"
      ref="sourceEditorRef"
      v-model="sourceContent"
      @change="onSourceChange"
    />

    <!-- Mode indicator overlay (brief flash on toggle) -->
    <Transition name="mode-indicator">
      <div v-if="showModeIndicator" class="mode-indicator-overlay">
        <span class="mode-indicator-text">{{
          editorModeStore.isWysiwyg ? 'WYSIWYG' : 'Source'
        }}</span>
      </div>
    </Transition>

    <!-- Find and Replace panel -->
    <FindReplace
      @search="handleFindSearch"
      @next="handleFindNext"
      @prev="handleFindPrev"
      @replace="handleFindReplace"
      @replace-all="handleFindReplaceAll"
      @close="handleFindClose"
    />

    <!-- Mode toggle button in bottom-right -->
    <div class="editor-mode-indicator" title="Toggle Source/WYSIWYG (⌘/)" @click="handleToggleMode">
      <span class="mode-icon">{{ editorModeStore.isWysiwyg ? '&lt;/&gt;' : '◉' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useEditorModeStore } from '../stores/editorMode'
import { useOutlineStore } from '../stores/outline'
import { useFocusModeStore } from '../stores/focusMode'
import { useTypewriterModeStore } from '../stores/typewriterMode'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { GdownLink } from '../extensions/GdownLink'
import { GdownImage } from '../extensions/GdownImage'
import {
  GdownBold,
  GdownItalic,
  GdownStrike,
  GdownCode,
  GdownUnderline,
  GdownHighlight,
} from '../extensions/InlineFormatting'
import { GdownHeading } from '../extensions/GdownHeading'
import { GdownBlockquote } from '../extensions/GdownBlockquote'
import { GdownHorizontalRule } from '../extensions/GdownHorizontalRule'
import { GdownCodeBlock } from '../extensions/GdownCodeBlock'
import { GdownBulletList, GdownListItem } from '../extensions/GdownBulletList'
import { GdownOrderedList } from '../extensions/GdownOrderedList'
import { GdownTaskList, GdownTaskItem } from '../extensions/GdownTaskList'
import { GdownTable, TableRow, TableCell, TableHeader } from '../extensions/GdownTable'
import { MathInline } from '../extensions/MathInline'
import { MathBlock } from '../extensions/MathBlock'
import { MermaidBlock } from '../extensions/MermaidBlock'
import { FrontMatter } from '../extensions/FrontMatter'
import { FocusMode } from '../extensions/FocusMode'
import { TypewriterMode } from '../extensions/TypewriterMode'
import { SearchHighlight, getSearchState } from '../extensions/SearchHighlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import LinkTooltip from './LinkTooltip.vue'
import InsertLinkDialog from './InsertLinkDialog.vue'
import FindReplace from './FindReplace.vue'
import SourceEditor from './SourceEditor.vue'
import { useFindReplaceStore } from '../stores/findReplace'
import { useEditorSettingsStore } from '../stores/editorSettings'
import { useTabsStore } from '../stores/tabs'
import { htmlToMarkdown, markdownToHtml } from '../utils/markdownConverter'
import { resolveImagePaths, unresolveImagePaths, getDocumentDir } from '../utils/imagePathResolver'
import { assembleFrontMatter, parseFrontMatter } from '../utils/frontmatter'
import { useAutoSave } from '../services/autoSave'
import type { EditorState } from '../types/tab'

const tabsStore = useTabsStore()
const editorModeStore = useEditorModeStore()
const outlineStore = useOutlineStore()
const focusModeStore = useFocusModeStore()
const typewriterModeStore = useTypewriterModeStore()
const findReplaceStore = useFindReplaceStore()
const editorSettings = useEditorSettingsStore()

// Initialize auto-save service (editor ref is set up below, so we use a getter)
let editorRef: { getHTML: () => string } | null = null
const autoSave = useAutoSave(() => editorRef, { delay: 2000, enabled: true })

const editorContainer = ref<HTMLElement | null>(null)
const sourceEditorRef = ref<InstanceType<typeof SourceEditor> | null>(null)

// Mode indicator flash on toggle
const showModeIndicator = ref(false)
let modeIndicatorTimer: ReturnType<typeof setTimeout> | null = null

// Source mode content (synced with CodeMirror via v-model)
const sourceContent = ref('')

// Flag to suppress modification tracking during content restore
let isRestoringContent = false
// Flag to prevent feedback loops during mode switching
let isSwitchingMode = false

// ──────────────────────────────────────────────────────
// Image path resolution helpers
// ──────────────────────────────────────────────────────

/** Get the directory of the active document for resolving relative image paths. */
function activeDocDir(): string | null {
  return getDocumentDir(tabsStore.activeTab?.filePath ?? null)
}

/** Convert markdown to HTML with local image paths resolved to asset:// URLs. */
function mdToHtml(md: string): string {
  const html = markdownToHtml(md)
  const dir = activeDocDir()
  return dir ? resolveImagePaths(html, dir) : html
}

/** Convert HTML to markdown, unresolving asset:// URLs back to relative paths first. */
function htmlToMd(html: string): string {
  const dir = activeDocDir()
  const cleanHtml = dir ? unresolveImagePaths(html, dir) : html
  return htmlToMarkdown(cleanHtml)
}

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit.configure({
      // Disable built-in marks — we use our enhanced Gdown* versions
      bold: false,
      italic: false,
      strike: false,
      code: false,
      // Disable built-in block nodes — we use custom Gdown* versions
      heading: false,
      blockquote: false,
      horizontalRule: false,
      codeBlock: false,
      // Disable built-in list nodes — we use custom Gdown* versions
      bulletList: false,
      orderedList: false,
      listItem: false,
    }),
    // Custom block-level extensions with Typora-like input rules
    GdownHeading,
    GdownBlockquote,
    GdownHorizontalRule,
    GdownCodeBlock,
    // Custom list extensions with Typora-like input rules and nesting
    GdownBulletList,
    GdownOrderedList,
    GdownListItem,
    GdownTaskList,
    GdownTaskItem,
    // Table support (GFM tables)
    GdownTable,
    TableRow,
    TableCell,
    TableHeader,
    // Custom inline formatting marks with Typora-exact shortcuts & input rules
    GdownBold,
    GdownItalic,
    GdownStrike,
    GdownCode,
    GdownUnderline,
    GdownHighlight.configure({ multicolor: false }),
    Subscript,
    Superscript,
    // Math rendering (KaTeX)
    MathInline,
    MathBlock,
    // Diagram rendering (Mermaid)
    MermaidBlock,
    // Front-matter (YAML metadata) — collapsible panel at top of document
    FrontMatter,
    // Focus mode — dims non-active blocks (Typora's View > Focus Mode)
    FocusMode.configure({
      enabled: focusModeStore.enabled,
    }),
    // Typewriter mode — keeps cursor vertically centered (Typora's View > Typewriter Mode)
    TypewriterMode.configure({
      enabled: typewriterModeStore.enabled,
    }),
    // Links & images
    GdownLink.configure({
      openOnClick: false,
      linkOnPaste: true,
      autolink: true,
    }),
    GdownImage.configure({
      inline: true,
      allowBase64: true,
    }),
    Placeholder.configure({
      placeholder: 'Start writing with Markdown...',
    }),
    // Search highlighting — ProseMirror decorations for find/replace
    SearchHighlight,
  ],
  editorProps: {
    attributes: {
      class: 'gdown-editor',
      spellcheck: 'true',
    },
    handleClick: (_view, _pos, event) => {
      const target = event.target as HTMLElement
      const link = target.closest('a.gdown-link') as HTMLAnchorElement | null
      if (link) {
        const href = link.getAttribute('href')
        if (href) {
          const isBrowseMode = editorSettings.linkMode === 'browse'
          const isModClick = event.metaKey || event.ctrlKey
          if (isBrowseMode || isModClick) {
            openUrl(href).catch(() => window.open(href, '_blank'))
            event.preventDefault()
            return true
          }
        }
      }
      return false
    },
    handleDOMEvents: {
      // Show pointer cursor on links when Cmd is held
      mouseover: (_view, event) => {
        const target = event.target as HTMLElement
        if (target.tagName === 'A' && target.classList.contains('gdown-link')) {
          target.style.cursor = 'pointer'
        }
        return false
      },
    },
  },
  onUpdate: ({ editor: ed }) => {
    // Don't mark as modified during content restoration or mode switching
    if (isRestoringContent || isSwitchingMode) return

    const tabId = tabsStore.activeTabId
    if (tabId) {
      tabsStore.setModified(tabId, true)
      // Persist document content AND markdown to the tab's editor state.
      // Markdown is needed for auto-save to disk.
      const markdownStr = htmlToMd(ed.getHTML())
      tabsStore.saveEditorState(tabId, {
        doc: ed.getJSON(),
        markdown: markdownStr,
      })
    }

    // Update outline headings whenever document changes
    outlineStore.updateFromEditor(ed)
  },
  onSelectionUpdate: ({ editor: ed }) => {
    if (isRestoringContent || isSwitchingMode) return

    const tabId = tabsStore.activeTabId
    if (tabId) {
      const { from, to } = ed.state.selection
      tabsStore.saveEditorState(tabId, {
        selection: { from, to },
      })
    }

    // Update active heading in outline based on cursor position
    const { from } = ed.state.selection
    outlineStore.setActiveHeading(from)
  },
})

// ──────────────────────────────────────────────────────
// Mode toggling: synchronize document state between modes
// ──────────────────────────────────────────────────────

/**
 * Toggle between WYSIWYG and Source modes.
 * Converts document state on each switch:
 *   WYSIWYG → Source: serialize TipTap HTML to Markdown via Turndown
 *   Source → WYSIWYG: parse Markdown to HTML via markdown-it, load into TipTap
 */
function handleToggleMode(): void {
  isSwitchingMode = true

  try {
    // Show mode indicator briefly
    showModeIndicator.value = true
    if (modeIndicatorTimer) clearTimeout(modeIndicatorTimer)
    modeIndicatorTimer = setTimeout(() => {
      showModeIndicator.value = false
    }, 800)

    if (editorModeStore.isWysiwyg) {
      // ─── Switching TO Source mode ───
      // Serialize TipTap HTML → Markdown, with fallback to tab state
      let bodyMd = ''
      if (editor.value) {
        const html = editor.value.getHTML()
        bodyMd = htmlToMd(html)
      } else {
        // Editor ref not available — fall back to what onUpdate already persisted
        bodyMd = tabsStore.activeTab?.editorState.markdown ?? ''
      }

      const tab = tabsStore.activeTab
      const fm = tab?.editorState.frontmatter ?? null
      sourceContent.value = assembleFrontMatter(fm, bodyMd)

      // Explicitly persist to tab state before mode change so source/SourceEditor.vue
      // reads the correct content on mount regardless of captureState ordering.
      const tabId = tabsStore.activeTabId
      if (tabId) {
        tabsStore.saveEditorState(tabId, { markdown: bodyMd })
      }

      editorModeStore.setMode('source')

      // Focus the source editor after DOM updates
      nextTick(() => {
        sourceEditorRef.value?.focus()
      })
    } else {
      // ─── Switching TO WYSIWYG mode ───
      // Parse front-matter out of source content before loading into TipTap
      const fullSource = sourceContent.value
      const { rawYaml, attributes, body, hasFrontMatter } = parseFrontMatter(fullSource)

      const html = mdToHtml(body)

      editorModeStore.setMode('wysiwyg')

      if (editor.value) {
        isRestoringContent = true
        try {
          editor.value.commands.setContent(html, { emitUpdate: false })
        } finally {
          isRestoringContent = false
        }

        // Persist the updated state to the tab (body-only markdown + front-matter)
        const tabId = tabsStore.activeTabId
        if (tabId) {
          tabsStore.saveEditorState(tabId, {
            doc: editor.value.getJSON(),
            markdown: body,
            frontmatter: hasFrontMatter ? rawYaml : null,
            frontmatterAttributes: hasFrontMatter ? attributes : {},
          })
        }
      }

      // Focus the WYSIWYG editor after DOM updates
      nextTick(() => {
        editor.value?.commands.focus()
      })
    }
  } finally {
    isSwitchingMode = false
  }
}

/**
 * Handle changes from the source editor (CodeMirror).
 * Mark the tab as modified and persist markdown.
 * Parses front-matter out of the full source content so that
 * the body and front-matter are stored separately in the tab state.
 */
function onSourceChange(value: string): void {
  if (isSwitchingMode) return

  const tabId = tabsStore.activeTabId
  if (tabId) {
    // Parse front-matter from the full source content
    const { rawYaml, attributes, body, hasFrontMatter } = parseFrontMatter(value)

    tabsStore.setModified(tabId, true)
    tabsStore.saveEditorState(tabId, {
      markdown: body,
      frontmatter: hasFrontMatter ? rawYaml : null,
      frontmatterAttributes: hasFrontMatter ? attributes : {},
    })
  }
}

// ──────────────────────────────────────────────────────
// Tab state capture & restore
// ──────────────────────────────────────────────────────

/**
 * Capture the full editor state for a given tab before switching away.
 */
function captureState(tabId: string): void {
  if (editorModeStore.isWysiwyg) {
    if (!editor.value) return

    const { from, to } = editor.value.state.selection
    const scrollTop = editorContainer.value?.scrollTop ?? 0

    // Also generate markdown for round-trip fidelity
    const markdownStr = htmlToMd(editor.value.getHTML())

    tabsStore.saveEditorState(tabId, {
      doc: editor.value.getJSON(),
      markdown: markdownStr,
      scrollTop,
      selection: { from, to },
    })
  } else {
    // In source mode, parse front-matter out and save body + front-matter separately.
    // Guard: only overwrite markdown if sourceContent is non-empty. If it's empty
    // (e.g. mode was toggled via status bar without going through handleToggleMode),
    // the onUpdate-persisted markdown in tab state is already correct — don't clobber it.
    const { rawYaml, attributes, body, hasFrontMatter } = parseFrontMatter(sourceContent.value)
    const update: Partial<import('../types/tab').EditorState> = {
      scrollTop: sourceEditorRef.value?.getScrollTop() ?? 0,
    }
    if (body.trim() || hasFrontMatter) {
      update.markdown = body
      update.frontmatter = hasFrontMatter ? rawYaml : null
      update.frontmatterAttributes = hasFrontMatter ? attributes : {}
    }
    tabsStore.saveEditorState(tabId, update)
  }
}

/**
 * Restore editor state from a tab's saved state.
 */
function restoreState(state: EditorState): void {
  if (editorModeStore.isWysiwyg) {
    restoreWysiwygState(state)
  } else {
    restoreSourceState(state)
  }
}

/**
 * Restore WYSIWYG (TipTap) editor state.
 */
function restoreWysiwygState(state: EditorState): void {
  if (!editor.value) return

  isRestoringContent = true

  try {
    if (state.doc) {
      editor.value.commands.setContent(state.doc, { emitUpdate: false })
    } else if (state.markdown) {
      const html = mdToHtml(state.markdown)
      editor.value.commands.setContent(html, { emitUpdate: false })
    } else {
      editor.value.commands.setContent('', { emitUpdate: false })
    }
  } finally {
    isRestoringContent = false
  }

  // Update outline after content restore
  if (editor.value) {
    outlineStore.updateFromEditor(editor.value)
  }

  // Restore cursor and scroll after DOM settles
  nextTick(() => {
    if (!editor.value) return

    // Restore cursor/selection
    try {
      const docSize = editor.value.state.doc.content.size
      const from = Math.min(state.selection.from, docSize)
      const to = Math.min(state.selection.to, docSize)
      if (from >= 0 && to >= 0) {
        editor.value.commands.setTextSelection({ from, to })
      }
    } catch {
      try {
        editor.value.commands.setTextSelection(0)
      } catch {
        // ignore
      }
    }

    // Restore scroll position
    if (editorContainer.value) {
      editorContainer.value.scrollTop = state.scrollTop
    }

    // Focus the editor
    editor.value.commands.focus()
  })
}

/**
 * Restore source (CodeMirror) editor state.
 * Includes front-matter (if present) so it's visible and editable in source mode.
 */
function restoreSourceState(state: EditorState): void {
  let bodyMd = ''

  // Prefer stored markdown; otherwise serialize from doc
  if (state.markdown) {
    bodyMd = state.markdown
  } else if (state.doc && editor.value) {
    // Temporarily load the doc into TipTap to serialize it to markdown
    isRestoringContent = true
    try {
      editor.value.commands.setContent(state.doc, { emitUpdate: false })
      bodyMd = htmlToMd(editor.value.getHTML())
    } finally {
      isRestoringContent = false
    }
  }

  // Prepend front-matter if present
  sourceContent.value = assembleFrontMatter(state.frontmatter, bodyMd)

  nextTick(() => {
    sourceEditorRef.value?.setScrollTop(state.scrollTop)
    sourceEditorRef.value?.focus()
  })
}

/**
 * Persist scroll position on WYSIWYG scroll events.
 */
function handleScroll(): void {
  const tabId = tabsStore.activeTabId
  if (tabId && editorContainer.value) {
    tabsStore.saveEditorState(tabId, {
      scrollTop: editorContainer.value.scrollTop,
    })
  }
}

// ──────────────────────────────────────────────────────
// Focus mode: sync store state → ProseMirror extension
// ──────────────────────────────────────────────────────
watch(
  () => focusModeStore.enabled,
  (enabled) => {
    if (!editor.value) return
    // Dispatch a transaction with meta to toggle ProseMirror focus mode decorations
    editor.value.commands.setFocusMode(enabled)
  },
)

// ──────────────────────────────────────────────────────
// Typewriter mode: sync store state → ProseMirror extension
// ──────────────────────────────────────────────────────
watch(
  () => typewriterModeStore.enabled,
  (enabled) => {
    if (!editor.value) return
    editor.value.commands.setTypewriterMode(enabled)
  },
)

// ──────────────────────────────────────────────────────
// Tab switching: save outgoing tab state, restore incoming
// ──────────────────────────────────────────────────────
watch(
  () => tabsStore.activeTabId,
  (newTabId, oldTabId) => {
    if (newTabId === oldTabId) return

    // Save state from the tab we're leaving
    if (oldTabId) {
      captureState(oldTabId)
    }

    // Restore state for the newly active tab
    if (newTabId) {
      const tab = tabsStore.tabs.find((t) => t.id === newTabId)
      if (tab) {
        restoreState(tab.editorState)
      }
    }
  },
)

// Handle external file reload — push new content into live TipTap editor
function handleFileReloaded(e: Event) {
  const { tabId, markdown } = (e as CustomEvent<{ tabId: string; markdown: string }>).detail
  if (tabId !== tabsStore.activeTabId || !editor.value) return
  const html = mdToHtml(markdown)
  isRestoringContent = true
  try {
    editor.value.commands.setContent(html, { emitUpdate: false })
  } finally {
    isRestoringContent = false
  }
  outlineStore.updateFromEditor(editor.value)
}

// Handle insert-image event
function handleInsertImage() {
  const url = prompt('Enter image URL or local path:')
  if (url && editor.value) {
    editor.value.chain().focus().setImage({ src: url, alt: 'Image' }).run()
  }
}

// Handle keyboard shortcut for mode toggle (Cmd+/ — Typora's shortcut)
function handleKeydown(e: KeyboardEvent): void {
  if (e.metaKey && e.key === '/') {
    e.preventDefault()
    handleToggleMode()
  }
}

// ──────────────────────────────────────────────────────
// Find and Replace — decoration-based search in the editor
// Uses the SearchHighlight ProseMirror extension to highlight
// ALL matches with decorations and track the current match.
// ──────────────────────────────────────────────────────

/**
 * Sync the SearchHighlight plugin state → findReplaceStore.
 * Called after any search command to keep the UI in sync.
 */
function syncSearchState(): void {
  if (!editor.value) return
  const pluginState = getSearchState(editor.value.state)
  if (pluginState) {
    findReplaceStore.setMatchInfo(pluginState.results.length, pluginState.currentIndex)
  }
}

/**
 * Scroll the current match into view by setting the text selection
 * to the current match position and calling scrollIntoView.
 */
function scrollToCurrentMatch(): void {
  if (!editor.value) return
  const pluginState = getSearchState(editor.value.state)
  if (!pluginState || pluginState.results.length === 0 || pluginState.currentIndex < 0) return

  const match = pluginState.results[pluginState.currentIndex]
  if (match) {
    // Use setTextSelection to move cursor to match, then scroll into view
    editor.value.commands.setTextSelection({ from: match.from, to: match.to })
    editor.value.commands.scrollIntoView()
  }
}

function handleFindSearch(query: string, caseSensitive: boolean, useRegex: boolean): void {
  if (!editor.value) return
  // Dispatch setSearchTerm command which recomputes all matches and decorations
  editor.value.commands.setSearchTerm(query, caseSensitive, useRegex)
  syncSearchState()
  scrollToCurrentMatch()
}

function handleFindNext(): void {
  if (!editor.value) return
  const pluginState = getSearchState(editor.value.state)
  if (!pluginState || pluginState.results.length === 0) return

  const nextIndex = (pluginState.currentIndex + 1) % pluginState.results.length
  editor.value.commands.setSearchIndex(nextIndex)
  syncSearchState()
  scrollToCurrentMatch()
}

function handleFindPrev(): void {
  if (!editor.value) return
  const pluginState = getSearchState(editor.value.state)
  if (!pluginState || pluginState.results.length === 0) return

  const prevIndex =
    (pluginState.currentIndex - 1 + pluginState.results.length) % pluginState.results.length
  editor.value.commands.setSearchIndex(prevIndex)
  syncSearchState()
  scrollToCurrentMatch()
}

function handleFindReplace(replacement: string): void {
  if (!editor.value) return
  editor.value.commands.replaceCurrent(replacement)
  syncSearchState()
  scrollToCurrentMatch()
}

function handleFindReplaceAll(replacement: string): void {
  if (!editor.value) return
  editor.value.commands.replaceAll(replacement)
  syncSearchState()
}

function handleFindClose(): void {
  if (!editor.value) return
  // Clear all search decorations
  editor.value.commands.clearSearch()
  syncSearchState()
  // Collapse selection and refocus
  const { from } = editor.value.state.selection
  editor.value.commands.setTextSelection(from)
  editor.value.commands.focus()
}

/**
 * Navigate to a heading by its ProseMirror position.
 * Used by the Outline panel to scroll to and focus a heading.
 */
function navigateToHeading(pos: number): void {
  if (!editor.value || !editorContainer.value) return

  try {
    const docSize = editor.value.state.doc.content.size
    const safePos = Math.min(pos, docSize)

    // Set cursor at the beginning of the heading
    editor.value.commands.setTextSelection(safePos + 1)
    editor.value.commands.focus()

    // Scroll the heading into view
    nextTick(() => {
      // Use ProseMirror's coordsAtPos to find the DOM position
      try {
        const coords = editor.value!.view.coordsAtPos(safePos + 1)
        const containerRect = editorContainer.value!.getBoundingClientRect()
        const scrollOffset = coords.top - containerRect.top - 60 // 60px offset from top
        editorContainer.value!.scrollTop += scrollOffset
      } catch {
        // Fallback: use scrollIntoView on the resolved DOM node
        const domNode = editor.value!.view.domAtPos(safePos + 1)
        if (domNode?.node) {
          const element =
            domNode.node instanceof HTMLElement ? domNode.node : domNode.node.parentElement
          element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    })

    // Update active heading
    outlineStore.setActiveHeading(safePos)
  } catch (e) {
    console.warn('Failed to navigate to heading:', e)
  }
}

// Expose for parent components (App.vue uses this for outline navigation)
defineExpose({
  navigateToHeading,
  getEditor: () => editor.value,
})

onMounted(() => {
  // Load active tab's content into editor on mount
  if (tabsStore.activeTab) {
    restoreState(tabsStore.activeTab.editorState)
  }

  // Wire up the editor reference for auto-save serialization
  editorRef = editor.value ?? null

  // Initial outline extraction
  if (editor.value) {
    outlineStore.updateFromEditor(editor.value)
  }

  window.addEventListener('gdown:insert-image', handleInsertImage)
  window.addEventListener('gdown:toggle-mode', handleToggleMode as EventListener)
  window.addEventListener('gdown:file-reloaded', handleFileReloaded)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  // Save current tab state before unmount
  if (tabsStore.activeTabId) {
    captureState(tabsStore.activeTabId)
  }

  // Clean up auto-save service
  autoSave.dispose()
  editorRef = null

  if (modeIndicatorTimer) clearTimeout(modeIndicatorTimer)
  window.removeEventListener('gdown:insert-image', handleInsertImage)
  window.removeEventListener('gdown:toggle-mode', handleToggleMode as EventListener)
  window.removeEventListener('gdown:file-reloaded', handleFileReloaded)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style>
.editor-wrapper {
  position: relative;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-container {
  flex: 1;
  overflow-y: auto;
  padding: 40px 60px;
}

.editor-content {
  max-width: 860px;
  margin: 0 auto;
}

/* TipTap/ProseMirror editor styles */
.gdown-editor {
  outline: none;
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-primary, #333);
}

.gdown-editor:focus {
  outline: none;
}

/* === HEADINGS (Typora-like) === */
.gdown-editor h1 {
  font-size: 2em;
  font-weight: 700;
  margin: 0.67em 0 0.3em 0;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--sidebar-border, #eee);
  line-height: 1.3;
}

.gdown-editor h2 {
  font-size: 1.5em;
  font-weight: 600;
  margin: 0.83em 0 0.2em 0;
  padding-bottom: 0.2em;
  border-bottom: 1px solid var(--sidebar-border, #eee);
  line-height: 1.35;
}

.gdown-editor h3 {
  font-size: 1.25em;
  font-weight: 600;
  margin: 1em 0 0.2em 0;
  line-height: 1.4;
}

.gdown-editor h4 {
  font-size: 1.1em;
  font-weight: 600;
  margin: 1em 0 0.2em 0;
}

.gdown-editor h5 {
  font-size: 1em;
  font-weight: 600;
  margin: 1em 0 0.2em 0;
}

.gdown-editor h6 {
  font-size: 0.9em;
  font-weight: 600;
  margin: 1em 0 0.2em 0;
  color: var(--sidebar-title-color, #777);
}

/* Paragraphs */
.gdown-editor p {
  margin: 0.5em 0;
}

/* Links - Typora-like styling */
.gdown-editor a.gdown-link {
  color: #4183c4;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
  cursor: text;
}

.gdown-editor a.gdown-link:hover {
  border-bottom-color: #4183c4;
  cursor: pointer;
}

/* Images - Typora-like inline preview */
.gdown-editor img.gdown-image,
.gdown-editor img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
  display: block;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  cursor: default;
  transition: box-shadow 0.2s;
}

.gdown-editor img:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Selected image */
.gdown-editor img.ProseMirror-selectednode {
  outline: 2px solid #4183c4;
  outline-offset: 2px;
}

/* Image loading/error states */
.gdown-editor img[src=''],
.gdown-editor img:not([src]) {
  min-height: 60px;
  min-width: 200px;
  background: #f0f0f0;
  border: 2px dashed #ccc;
  border-radius: 4px;
}

/* Image with alt text caption effect */
.gdown-editor img[alt]:not([alt='']) {
  cursor: default;
}

/* Code */
.gdown-editor code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
  font-size: 0.9em;
  color: #e96900;
}

/* === CODE BLOCKS with syntax highlighting (GitHub-like theme) === */

/* Lowlight / highlight.js syntax highlighting tokens */
.gdown-editor .hljs-comment,
.gdown-editor .hljs-quote {
  color: #6a737d;
  font-style: italic;
}

.gdown-editor .hljs-keyword,
.gdown-editor .hljs-selector-tag,
.gdown-editor .hljs-addition {
  color: #d73a49;
}

.gdown-editor .hljs-string,
.gdown-editor .hljs-meta .hljs-meta-string,
.gdown-editor .hljs-literal,
.gdown-editor .hljs-doctag,
.gdown-editor .hljs-regexp {
  color: #032f62;
}

.gdown-editor .hljs-number {
  color: #005cc5;
}

.gdown-editor .hljs-title,
.gdown-editor .hljs-section,
.gdown-editor .hljs-name,
.gdown-editor .hljs-selector-id,
.gdown-editor .hljs-selector-class {
  color: #6f42c1;
}

.gdown-editor .hljs-variable,
.gdown-editor .hljs-template-variable,
.gdown-editor .hljs-attr {
  color: #005cc5;
}

.gdown-editor .hljs-type,
.gdown-editor .hljs-built_in,
.gdown-editor .hljs-builtin-name,
.gdown-editor .hljs-params {
  color: #e36209;
}

.gdown-editor .hljs-symbol,
.gdown-editor .hljs-bullet,
.gdown-editor .hljs-link,
.gdown-editor .hljs-meta,
.gdown-editor .hljs-deletion {
  color: #22863a;
}

.gdown-editor .hljs-emphasis {
  font-style: italic;
}

.gdown-editor .hljs-strong {
  font-weight: bold;
}

.gdown-editor .hljs-function {
  color: #6f42c1;
}

.gdown-editor .hljs-tag {
  color: #22863a;
}

.gdown-editor .hljs-subst {
  color: #24292e;
}

.gdown-editor .hljs-formula {
  color: #005cc5;
}

.gdown-editor .hljs-operator {
  color: #d73a49;
}

.gdown-editor .hljs-property {
  color: #005cc5;
}

.gdown-editor .hljs-punctuation {
  color: #24292e;
}

/* === LISTS — Typora-like styling === */
.gdown-editor ul,
.gdown-editor ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.gdown-editor li {
  margin: 0.25em 0;
}

/* Nested lists — tighter spacing */
.gdown-editor li > ul,
.gdown-editor li > ol {
  margin: 0.15em 0;
}

/* Ordered list nesting styles */
.gdown-editor ol {
  list-style-type: decimal;
}

.gdown-editor ol ol {
  list-style-type: lower-alpha;
}

.gdown-editor ol ol ol {
  list-style-type: lower-roman;
}

/* === TASK LIST — Typora-like checkbox styling === */
.gdown-editor ul[data-type='taskList'] {
  list-style: none;
  padding-left: 0;
}

.gdown-editor ul[data-type='taskList'] li {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
  margin: 0.25em 0;
}

.gdown-editor ul[data-type='taskList'] li > label {
  flex-shrink: 0;
  user-select: none;
  margin-top: 0.3em;
}

.gdown-editor ul[data-type='taskList'] li > label input[type='checkbox'] {
  cursor: pointer;
  width: 16px;
  height: 16px;
  accent-color: #4183c4;
  border-radius: 3px;
}

.gdown-editor ul[data-type='taskList'] li > div {
  flex: 1;
  min-width: 0;
}

/* Checked task item — strikethrough + dim text like Typora */
.gdown-editor ul[data-type='taskList'] li[data-checked='true'] > div {
  text-decoration: line-through;
  color: #999;
}

/* Nested task lists */
.gdown-editor ul[data-type='taskList'] ul[data-type='taskList'] {
  padding-left: 1.5em;
}
/* === BLOCKQUOTES (Typora-like) === */
.gdown-editor blockquote {
  border-left: 4px solid #dfe2e5;
  padding: 0 16px;
  color: #6a737d;
  margin: 1em 0;
}

.gdown-editor blockquote > * + * {
  margin-top: 0.5em;
}

.gdown-editor blockquote blockquote {
  border-left-color: #ccc;
}

/* === HORIZONTAL RULE (Typora-like) === */
.gdown-editor hr {
  border: none;
  height: 2px;
  background-color: #e7e7e7;
  margin: 24px 0;
  overflow: hidden;
}

.gdown-editor hr.ProseMirror-selectednode {
  outline: 2px solid #4183c4;
  outline-offset: 2px;
}

/* Strong and emphasis */
.gdown-editor strong {
  font-weight: 600;
}

.gdown-editor em {
  font-style: italic;
}

/* Placeholder */
.gdown-editor p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #aaa;
  pointer-events: none;
  height: 0;
}

/* === MODE INDICATOR OVERLAY === */
.mode-indicator-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  pointer-events: none;
  z-index: 100;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.mode-indicator-enter-active {
  transition: opacity 0.15s ease;
}

.mode-indicator-leave-active {
  transition: opacity 0.4s ease;
}

.mode-indicator-enter-from,
.mode-indicator-leave-to {
  opacity: 0;
}

/* === MODE TOGGLE BUTTON (bottom-right) === */
.editor-mode-indicator {
  position: absolute;
  bottom: 12px;
  right: 16px;
  z-index: 50;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  color: #888;
  font-size: 12px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  user-select: none;
  transition:
    background 0.15s,
    color 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.editor-mode-indicator:hover {
  background: rgba(0, 0, 0, 0.12);
  color: #555;
}

.mode-icon {
  font-size: 11px;
}

/* ============================================================
   FOCUS MODE — Typora-like paragraph dimming
   When focus mode is active, all blocks except the one with
   the cursor are dimmed. Transition is smooth for a polished feel.
   ============================================================ */

/* All top-level blocks in the editor get a base transition */
.focus-mode .gdown-editor > * {
  transition:
    opacity 0.25s ease,
    filter 0.25s ease;
}

/* Dimmed blocks — reduced opacity */
.focus-mode .gdown-editor .focus-dimmed {
  opacity: 0.25;
  filter: none;
  transition: opacity 0.25s ease;
}

/* Active block — full opacity */
.focus-mode .gdown-editor .focus-active {
  opacity: 1;
  filter: none;
  transition: opacity 0.15s ease;
}

/* When focus mode is off, ensure no residual dimming */
.editor-wrapper:not(.focus-mode) .gdown-editor .focus-dimmed,
.editor-wrapper:not(.focus-mode) .gdown-editor .focus-active {
  opacity: 1;
  filter: none;
}

/* ============================================================
   TYPEWRITER MODE — keeps cursor vertically centered
   Extra top/bottom padding allows the first/last lines to
   scroll to the centre of the viewport.
   ============================================================ */

.typewriter-mode .editor-container {
  /* Generous vertical padding so every line can reach center */
  padding-top: 45vh;
  padding-bottom: 45vh;
}

/* Smooth scroll behaviour while navigating (typing uses instant scroll) */
.typewriter-mode .editor-container {
  scroll-behavior: auto;
}

/* ============================================================
   SEARCH HIGHLIGHT — ProseMirror decoration-based highlighting
   All matches get a yellow background. The current (active) match
   gets an orange/amber background to stand out clearly.
   ============================================================ */

.gdown-editor .search-highlight {
  background-color: rgba(255, 223, 93, 0.5);
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(255, 193, 7, 0.3);
}

.gdown-editor .search-highlight.search-highlight-current {
  background-color: rgba(255, 152, 0, 0.6);
  box-shadow: 0 0 0 1px rgba(255, 152, 0, 0.5);
}

/* === TABLES (GFM-style) === */
.gdown-editor table.gdown-table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  overflow: hidden;
}

.gdown-editor table.gdown-table th,
.gdown-editor table.gdown-table td {
  border: 1px solid var(--sidebar-border, #e0e0e0);
  padding: 6px 12px;
  text-align: left;
  vertical-align: top;
  min-width: 80px;
}

.gdown-editor table.gdown-table th {
  background: var(--sidebar-bg, #f5f5f5);
  font-weight: 600;
}

.gdown-editor table.gdown-table tr:nth-child(even) td {
  background: var(--tab-hover-bg, rgba(0, 0, 0, 0.02));
}

.gdown-editor table.gdown-table .selectedCell {
  background: var(--sidebar-selected-bg, rgba(0, 122, 255, 0.08));
}
</style>
