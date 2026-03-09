import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFocusModeStore } from '../../stores/focusMode'

describe('useFocusModeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to disabled', () => {
    const store = useFocusModeStore()

    expect(store.enabled).toBe(false)
  })

  it('toggle flips state', () => {
    const store = useFocusModeStore()

    store.toggle()
    expect(store.enabled).toBe(true)

    store.toggle()
    expect(store.enabled).toBe(false)
  })

  it('setEnabled sets a specific value', () => {
    const store = useFocusModeStore()

    store.setEnabled(true)
    expect(store.enabled).toBe(true)

    store.setEnabled(false)
    expect(store.enabled).toBe(false)
  })
})
