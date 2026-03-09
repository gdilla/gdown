import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePreferencesStore } from '../../stores/preferences'

describe('usePreferencesStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    // Ensure document.documentElement exists and has methods we need
    document.documentElement.setAttribute('data-theme', '')
    document.documentElement.className = ''
    document.documentElement.style.cssText = ''
  })

  it('has correct default values', () => {
    const store = usePreferencesStore()

    expect(store.theme).toBe('auto')
    expect(store.fontSize).toBe(16)
    expect(store.lineHeight).toBe(1.6)
    expect(store.editorWidth).toBe(800)
    expect(store.autoSaveEnabled).toBe(true)
    expect(store.autoSaveIntervalMs).toBe(1500)
    expect(store.spellCheckEnabled).toBe(true)
    expect(store.showLineNumbers).toBe(false)
    expect(store.showWordCount).toBe(true)
    expect(store.defaultEditorMode).toBe('wysiwyg')
    expect(store.restoreSessionOnLaunch).toBe(true)
    expect(store.indentSize).toBe(4)
    expect(store.useHardLineBreaks).toBe(false)
  })

  it('theme can be changed', () => {
    const store = usePreferencesStore()

    store.theme = 'dark'

    expect(store.theme).toBe('dark')
  })

  it('resolvedTheme returns actual theme for non-auto values', () => {
    const store = usePreferencesStore()

    store.theme = 'solarized-dark'

    expect(store.resolvedTheme).toBe('solarized-dark')
  })

  it('resolvedTheme resolves auto to light or dark', () => {
    const store = usePreferencesStore()

    store.theme = 'auto'

    // In jsdom, matchMedia defaults to not matching, so system theme should be 'light'
    expect(['light', 'dark']).toContain(store.resolvedTheme)
  })

  it('resetToDefaults restores all defaults', () => {
    const store = usePreferencesStore()

    // Change several values
    store.theme = 'dark'
    store.fontSize = 20
    store.lineHeight = 2.0
    store.editorWidth = 1200
    store.autoSaveEnabled = false
    store.indentSize = 2

    store.resetToDefaults()

    expect(store.theme).toBe('auto')
    expect(store.fontSize).toBe(16)
    expect(store.lineHeight).toBe(1.6)
    expect(store.editorWidth).toBe(800)
    expect(store.autoSaveEnabled).toBe(true)
    expect(store.indentSize).toBe(4)
  })

  it('fontSize is reactive', () => {
    const store = usePreferencesStore()

    store.fontSize = 24

    expect(store.fontSize).toBe(24)
  })

  it('lineHeight is reactive', () => {
    const store = usePreferencesStore()

    store.lineHeight = 2.0

    expect(store.lineHeight).toBe(2.0)
  })

  it('editorWidth is reactive', () => {
    const store = usePreferencesStore()

    store.editorWidth = 1000

    expect(store.editorWidth).toBe(1000)
  })

  it('persists to localStorage on theme change', async () => {
    const store = usePreferencesStore()

    store.theme = 'github'

    // Wait for watcher to fire
    await vi.dynamicImportSettled()

    const stored = localStorage.getItem('gdown-preferences')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).theme).toBe('github')
  })
})
