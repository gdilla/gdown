import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorSettingsStore } from '../../stores/editorSettings'

describe('useEditorSettingsStore compatibility', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    document.documentElement.style.cssText = ''
  })

  it('migrates editor values from the legacy preferences record', () => {
    localStorage.setItem(
      'gdown-preferences',
      JSON.stringify({
        defaultEditorMode: 'source',
        showLineNumbers: false,
        spellCheckEnabled: true,
        indentSize: 2,
        fontSize: 19,
        lineHeight: 1.8,
        editorWidth: 720,
        autoSaveEnabled: false,
      }),
    )

    const store = useEditorSettingsStore()

    expect(store.defaultMode).toBe('source')
    expect(store.showLineNumbers).toBe(false)
    expect(store.spellCheck).toBe(true)
    expect(store.indentSize).toBe(2)
    expect(store.fontSize).toBe(19)
    expect(store.lineHeight).toBe(1.8)
    expect(store.maxEditorWidth).toBe(720)
    expect(store.autoSaveDelay).toBe(0)
    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('19px')
  })

  it('prefers the dedicated editor settings record when both records exist', () => {
    localStorage.setItem('gdown-preferences', JSON.stringify({ fontSize: 19 }))
    localStorage.setItem('gdown-editor-settings', JSON.stringify({ fontSize: 21 }))

    const store = useEditorSettingsStore()

    expect(store.fontSize).toBe(21)
  })
})
