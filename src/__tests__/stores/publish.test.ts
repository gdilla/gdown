import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePublishStore } from '../../stores/publish'

describe('usePublishStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has idle initial status', () => {
    const store = usePublishStore()
    expect(store.status).toBe('idle')
    expect(store.statusMessage).toBe('')
    expect(store.lastOutputPath).toBeNull()
  })

  it('status resets to idle after 3s on success', () => {
    const store = usePublishStore()

    // Simulate a success state
    store.setStatus('success', 'Exported!')

    expect(store.status).toBe('success')
    expect(store.statusMessage).toBe('Exported!')

    // Advance 3 seconds
    vi.advanceTimersByTime(3000)

    expect(store.status).toBe('idle')
    expect(store.statusMessage).toBe('')
  })

  it('status resets to idle after 5s on error', () => {
    const store = usePublishStore()

    store.setStatus('error', 'Something failed')

    expect(store.status).toBe('error')

    // At 3s, should still be error
    vi.advanceTimersByTime(3000)
    expect(store.status).toBe('error')

    // At 5s, should reset
    vi.advanceTimersByTime(2000)
    expect(store.status).toBe('idle')
  })

  it('working status does not auto-reset', () => {
    const store = usePublishStore()

    store.setStatus('working', 'Exporting...')
    expect(store.status).toBe('working')

    vi.advanceTimersByTime(10000)
    expect(store.status).toBe('working')
  })

  it('setStatus clears previous timer when called again', () => {
    const store = usePublishStore()

    store.setStatus('success', 'First')
    vi.advanceTimersByTime(1000)

    // Set new status before first timer fires
    store.setStatus('error', 'Second')
    vi.advanceTimersByTime(2000) // 3s from first — should NOT have reset

    expect(store.status).toBe('error')

    // 5s from second call should reset
    vi.advanceTimersByTime(3000)
    expect(store.status).toBe('idle')
  })
})
