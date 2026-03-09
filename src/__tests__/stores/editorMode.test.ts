import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorModeStore } from '../../stores/editorMode'

describe('useEditorModeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to wysiwyg mode', () => {
    const store = useEditorModeStore()

    expect(store.mode).toBe('wysiwyg')
  })

  it('toggleMode switches from wysiwyg to source', () => {
    const store = useEditorModeStore()

    store.toggleMode()

    expect(store.mode).toBe('source')
  })

  it('toggleMode switches from source back to wysiwyg', () => {
    const store = useEditorModeStore()

    store.toggleMode()
    store.toggleMode()

    expect(store.mode).toBe('wysiwyg')
  })

  it('setMode sets a specific mode', () => {
    const store = useEditorModeStore()

    store.setMode('source')

    expect(store.mode).toBe('source')
  })

  it('isWysiwyg is true in wysiwyg mode', () => {
    const store = useEditorModeStore()

    expect(store.isWysiwyg).toBe(true)
    expect(store.isSource).toBe(false)
  })

  it('isSource is true in source mode', () => {
    const store = useEditorModeStore()

    store.setMode('source')

    expect(store.isSource).toBe(true)
    expect(store.isWysiwyg).toBe(false)
  })
})
