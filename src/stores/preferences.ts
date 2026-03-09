import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto' | 'solarized-light' | 'solarized-dark' | 'github'
export type EditorDefaultMode = 'wysiwyg' | 'source'
export type PreferencesTab = 'general' | 'appearance' | 'editor' | 'image' | 'export' | 'advanced'

export interface PreferencesTabInfo {
  id: PreferencesTab
  label: string
  /** SF Symbols-style icon name for macOS-native feel */
  icon: string
}

export const PREFERENCES_TABS: PreferencesTabInfo[] = [
  { id: 'general', label: 'General', icon: 'gear' },
  { id: 'appearance', label: 'Appearance', icon: 'paintbrush' },
  { id: 'editor', label: 'Editor', icon: 'pencil' },
  { id: 'image', label: 'Image', icon: 'photo' },
  { id: 'export', label: 'Export', icon: 'square.and.arrow.up' },
  { id: 'advanced', label: 'Advanced', icon: 'gearshape.2' },
]

export interface PreferencesState {
  // Appearance
  theme: ThemeMode
  fontSize: number
  lineHeight: number
  editorWidth: number // max-width in px, 0 = full width

  // General
  autoSaveEnabled: boolean
  autoSaveIntervalMs: number
  spellCheckEnabled: boolean
  showLineNumbers: boolean
  showWordCount: boolean
  defaultEditorMode: EditorDefaultMode
  restoreSessionOnLaunch: boolean
  indentSize: number
  useHardLineBreaks: boolean
}

const STORAGE_KEY = 'gdown-preferences'

const DEFAULT_PREFERENCES: PreferencesState = {
  theme: 'auto',
  fontSize: 16,
  lineHeight: 1.6,
  editorWidth: 800,

  autoSaveEnabled: true,
  autoSaveIntervalMs: 1500,
  spellCheckEnabled: true,
  showLineNumbers: false,
  showWordCount: true,
  defaultEditorMode: 'wysiwyg',
  restoreSessionOnLaunch: true,
  indentSize: 4,
  useHardLineBreaks: false,
}

/**
 * Load preferences from localStorage, merging with defaults.
 */
function loadFromStorage(): PreferencesState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...DEFAULT_PREFERENCES, ...parsed }
    }
  } catch (err) {
    console.warn('Failed to load preferences from localStorage:', err)
  }
  return { ...DEFAULT_PREFERENCES }
}

/**
 * Save preferences to localStorage.
 */
function saveToStorage(prefs: PreferencesState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch (err) {
    console.warn('Failed to save preferences to localStorage:', err)
  }
}

/**
 * Detect system dark mode preference.
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export const usePreferencesStore = defineStore('preferences', () => {
  const initial = loadFromStorage()

  // Dialog state
  const visible = ref(false)
  const activeTab = ref<PreferencesTab>('general')

  // Appearance settings
  const theme = ref<ThemeMode>(initial.theme)
  const fontSize = ref(initial.fontSize)
  const lineHeight = ref(initial.lineHeight)
  const editorWidth = ref(initial.editorWidth)

  // General settings
  const autoSaveEnabled = ref(initial.autoSaveEnabled)
  const autoSaveIntervalMs = ref(initial.autoSaveIntervalMs)
  const spellCheckEnabled = ref(initial.spellCheckEnabled)
  const showLineNumbers = ref(initial.showLineNumbers)
  const showWordCount = ref(initial.showWordCount)
  const defaultEditorMode = ref<EditorDefaultMode>(initial.defaultEditorMode)
  const restoreSessionOnLaunch = ref(initial.restoreSessionOnLaunch)
  const indentSize = ref(initial.indentSize)
  const useHardLineBreaks = ref(initial.useHardLineBreaks)

  /** The resolved theme, accounting for 'auto' (which follows system preference) */
  const resolvedTheme = computed<Exclude<ThemeMode, 'auto'>>(() => {
    if (theme.value === 'auto') {
      return getSystemTheme()
    }
    return theme.value
  })

  const activeTabInfo = computed(() => {
    return PREFERENCES_TABS.find(t => t.id === activeTab.value)!
  })

  /** Auto-save interval in seconds for display */
  const autoSaveIntervalSec = computed({
    get: () => Math.round(autoSaveIntervalMs.value / 1000),
    set: (val: number) => {
      autoSaveIntervalMs.value = val * 1000
    },
  })

  // ── Dialog methods ──

  function open(tab?: PreferencesTab) {
    if (tab) {
      activeTab.value = tab
    }
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  function toggle() {
    visible.value = !visible.value
  }

  function setTab(tab: PreferencesTab) {
    activeTab.value = tab
  }

  // ── Persistence ──

  function toState(): PreferencesState {
    return {
      theme: theme.value,
      fontSize: fontSize.value,
      lineHeight: lineHeight.value,
      editorWidth: editorWidth.value,
      autoSaveEnabled: autoSaveEnabled.value,
      autoSaveIntervalMs: autoSaveIntervalMs.value,
      spellCheckEnabled: spellCheckEnabled.value,
      showLineNumbers: showLineNumbers.value,
      showWordCount: showWordCount.value,
      defaultEditorMode: defaultEditorMode.value,
      restoreSessionOnLaunch: restoreSessionOnLaunch.value,
      indentSize: indentSize.value,
      useHardLineBreaks: useHardLineBreaks.value,
    }
  }

  function persist() {
    saveToStorage(toState())
  }

  // ── Theme & style application ──

  function applyTheme() {
    const resolved = resolvedTheme.value
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(resolved)
  }

  function applyEditorStyles() {
    document.documentElement.style.setProperty('--editor-font-size', `${fontSize.value}px`)
    document.documentElement.style.setProperty('--editor-line-height', `${lineHeight.value}`)
    document.documentElement.style.setProperty(
      '--editor-max-width',
      editorWidth.value > 0 ? `${editorWidth.value}px` : '100%'
    )
  }

  function resetToDefaults() {
    theme.value = DEFAULT_PREFERENCES.theme
    fontSize.value = DEFAULT_PREFERENCES.fontSize
    lineHeight.value = DEFAULT_PREFERENCES.lineHeight
    editorWidth.value = DEFAULT_PREFERENCES.editorWidth
    autoSaveEnabled.value = DEFAULT_PREFERENCES.autoSaveEnabled
    autoSaveIntervalMs.value = DEFAULT_PREFERENCES.autoSaveIntervalMs
    spellCheckEnabled.value = DEFAULT_PREFERENCES.spellCheckEnabled
    showLineNumbers.value = DEFAULT_PREFERENCES.showLineNumbers
    showWordCount.value = DEFAULT_PREFERENCES.showWordCount
    defaultEditorMode.value = DEFAULT_PREFERENCES.defaultEditorMode
    restoreSessionOnLaunch.value = DEFAULT_PREFERENCES.restoreSessionOnLaunch
    indentSize.value = DEFAULT_PREFERENCES.indentSize
    useHardLineBreaks.value = DEFAULT_PREFERENCES.useHardLineBreaks
  }

  /**
   * Initialize: apply theme and styles, set up system theme listener.
   */
  function initialize() {
    applyTheme()
    applyEditorStyles()

    // Listen for system theme changes when using 'auto' mode
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', () => {
        if (theme.value === 'auto') {
          applyTheme()
        }
      })
    }
  }

  // ── Watchers for auto-persist and auto-apply ──

  watch(theme, () => {
    applyTheme()
    persist()
  })

  watch([fontSize, lineHeight, editorWidth], () => {
    applyEditorStyles()
    persist()
  })

  watch(
    [
      autoSaveEnabled,
      autoSaveIntervalMs,
      spellCheckEnabled,
      showLineNumbers,
      showWordCount,
      defaultEditorMode,
      restoreSessionOnLaunch,
      indentSize,
      useHardLineBreaks,
    ],
    () => {
      persist()
    }
  )

  return {
    // Dialog
    visible,
    activeTab,
    activeTabInfo,
    open,
    close,
    toggle,
    setTab,

    // Appearance
    theme,
    fontSize,
    lineHeight,
    editorWidth,
    resolvedTheme,

    // General
    autoSaveEnabled,
    autoSaveIntervalMs,
    autoSaveIntervalSec,
    spellCheckEnabled,
    showLineNumbers,
    showWordCount,
    defaultEditorMode,
    restoreSessionOnLaunch,
    indentSize,
    useHardLineBreaks,

    // Methods
    initialize,
    resetToDefaults,
    applyTheme,
    applyEditorStyles,
  }
})
