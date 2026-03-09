import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { EditorMode } from './editorMode'

export type IndentSize = 2 | 4 | 8
export type FontSize = number
export type LineEnding = 'lf' | 'crlf'
export type PairMatchMode = 'always' | 'never'
export type LinkMode = 'browse' | 'edit'

export interface EditorSettings {
  /** Default editing mode when opening files */
  defaultMode: EditorMode
  /** Show line numbers in source mode */
  showLineNumbers: boolean
  /** Enable spell check */
  spellCheck: boolean
  /** Indent size (spaces) */
  indentSize: IndentSize
  /** Use soft tabs (spaces) instead of hard tabs */
  softTabs: boolean
  /** Font size in the editor (px) */
  fontSize: number
  /** Font family for the editor */
  fontFamily: string
  /** Line height multiplier */
  lineHeight: number
  /** Auto-closing brackets and quotes */
  autoPairBrackets: PairMatchMode
  /** Auto-closing markdown syntax (bold, italic, etc.) */
  autoPairMarkdownSyntax: PairMatchMode
  /** Highlight current line */
  highlightCurrentLine: boolean
  /** Word wrap in editor */
  wordWrap: boolean
  /** Show whitespace characters (source mode) */
  showWhitespace: boolean
  /** Auto-save delay in milliseconds (0 = disabled) */
  autoSaveDelay: number
  /** Default line ending */
  lineEnding: LineEnding
  /** Enable typewriter mode by default */
  defaultTypewriterMode: boolean
  /** Enable focus mode by default */
  defaultFocusMode: boolean
  /** Show front matter as YAML block */
  showFrontMatter: boolean
  /** Maximum editor width (px, 0 = unlimited) */
  maxEditorWidth: number
  /** Link click behavior: browse = single click opens URL, edit = hover tooltip */
  linkMode: LinkMode
}

const DEFAULT_SETTINGS: EditorSettings = {
  defaultMode: 'wysiwyg',
  showLineNumbers: true,
  spellCheck: false,
  indentSize: 4,
  softTabs: true,
  fontSize: 16,
  fontFamily: '',
  lineHeight: 1.6,
  autoPairBrackets: 'always',
  autoPairMarkdownSyntax: 'always',
  highlightCurrentLine: true,
  wordWrap: true,
  showWhitespace: false,
  autoSaveDelay: 1500,
  lineEnding: 'lf',
  defaultTypewriterMode: false,
  defaultFocusMode: false,
  showFrontMatter: true,
  maxEditorWidth: 860,
  linkMode: 'browse' as LinkMode,
}

const STORAGE_KEY = 'gdown-editor-settings'

function loadSettings(): EditorSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch (e) {
    console.warn('Failed to load editor settings:', e)
  }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings: EditorSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.warn('Failed to save editor settings:', e)
  }
}

export const useEditorSettingsStore = defineStore('editorSettings', () => {
  const initial = loadSettings()

  const defaultMode = ref<EditorMode>(initial.defaultMode)
  const showLineNumbers = ref(initial.showLineNumbers)
  const spellCheck = ref(initial.spellCheck)
  const indentSize = ref<IndentSize>(initial.indentSize)
  const softTabs = ref(initial.softTabs)
  const fontSize = ref(initial.fontSize)
  const fontFamily = ref(initial.fontFamily)
  const lineHeight = ref(initial.lineHeight)
  const autoPairBrackets = ref<PairMatchMode>(initial.autoPairBrackets)
  const autoPairMarkdownSyntax = ref<PairMatchMode>(initial.autoPairMarkdownSyntax)
  const highlightCurrentLine = ref(initial.highlightCurrentLine)
  const wordWrap = ref(initial.wordWrap)
  const showWhitespace = ref(initial.showWhitespace)
  const autoSaveDelay = ref(initial.autoSaveDelay)
  const lineEnding = ref<LineEnding>(initial.lineEnding)
  const defaultTypewriterMode = ref(initial.defaultTypewriterMode)
  const defaultFocusMode = ref(initial.defaultFocusMode)
  const showFrontMatter = ref(initial.showFrontMatter)
  const maxEditorWidth = ref(initial.maxEditorWidth)
  const linkMode = ref<LinkMode>(initial.linkMode ?? 'browse')

  /** Get all current settings as a plain object */
  function getSettings(): EditorSettings {
    return {
      defaultMode: defaultMode.value,
      showLineNumbers: showLineNumbers.value,
      spellCheck: spellCheck.value,
      indentSize: indentSize.value,
      softTabs: softTabs.value,
      fontSize: fontSize.value,
      fontFamily: fontFamily.value,
      lineHeight: lineHeight.value,
      autoPairBrackets: autoPairBrackets.value,
      autoPairMarkdownSyntax: autoPairMarkdownSyntax.value,
      highlightCurrentLine: highlightCurrentLine.value,
      wordWrap: wordWrap.value,
      showWhitespace: showWhitespace.value,
      autoSaveDelay: autoSaveDelay.value,
      lineEnding: lineEnding.value,
      defaultTypewriterMode: defaultTypewriterMode.value,
      defaultFocusMode: defaultFocusMode.value,
      showFrontMatter: showFrontMatter.value,
      maxEditorWidth: maxEditorWidth.value,
      linkMode: linkMode.value,
    }
  }

  /** Reset all settings to defaults */
  function resetToDefaults() {
    defaultMode.value = DEFAULT_SETTINGS.defaultMode
    showLineNumbers.value = DEFAULT_SETTINGS.showLineNumbers
    spellCheck.value = DEFAULT_SETTINGS.spellCheck
    indentSize.value = DEFAULT_SETTINGS.indentSize
    softTabs.value = DEFAULT_SETTINGS.softTabs
    fontSize.value = DEFAULT_SETTINGS.fontSize
    fontFamily.value = DEFAULT_SETTINGS.fontFamily
    lineHeight.value = DEFAULT_SETTINGS.lineHeight
    autoPairBrackets.value = DEFAULT_SETTINGS.autoPairBrackets
    autoPairMarkdownSyntax.value = DEFAULT_SETTINGS.autoPairMarkdownSyntax
    highlightCurrentLine.value = DEFAULT_SETTINGS.highlightCurrentLine
    wordWrap.value = DEFAULT_SETTINGS.wordWrap
    showWhitespace.value = DEFAULT_SETTINGS.showWhitespace
    autoSaveDelay.value = DEFAULT_SETTINGS.autoSaveDelay
    lineEnding.value = DEFAULT_SETTINGS.lineEnding
    defaultTypewriterMode.value = DEFAULT_SETTINGS.defaultTypewriterMode
    defaultFocusMode.value = DEFAULT_SETTINGS.defaultFocusMode
    showFrontMatter.value = DEFAULT_SETTINGS.showFrontMatter
    maxEditorWidth.value = DEFAULT_SETTINGS.maxEditorWidth
    linkMode.value = DEFAULT_SETTINGS.linkMode
  }

  // Auto-persist on any change
  watch(
    () => getSettings(),
    (settings) => {
      saveSettings(settings)
    },
    { deep: true }
  )

  return {
    defaultMode,
    showLineNumbers,
    spellCheck,
    indentSize,
    softTabs,
    fontSize,
    fontFamily,
    lineHeight,
    autoPairBrackets,
    autoPairMarkdownSyntax,
    highlightCurrentLine,
    wordWrap,
    showWhitespace,
    autoSaveDelay,
    lineEnding,
    defaultTypewriterMode,
    defaultFocusMode,
    showFrontMatter,
    maxEditorWidth,
    linkMode,
    getSettings,
    resetToDefaults,
  }
})
