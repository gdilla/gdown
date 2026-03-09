import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTypewriterModeStore } from '../../stores/typewriterMode'

describe('useTypewriterModeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to disabled', () => {
    const store = useTypewriterModeStore()

    expect(store.enabled).toBe(false)
  })

  it('toggle flips state', () => {
    const store = useTypewriterModeStore()

    store.toggle()
    expect(store.enabled).toBe(true)

    store.toggle()
    expect(store.enabled).toBe(false)
  })

  it('setEnabled sets a specific value', () => {
    const store = useTypewriterModeStore()

    store.setEnabled(true)
    expect(store.enabled).toBe(true)

    store.setEnabled(false)
    expect(store.enabled).toBe(false)
  })
})
