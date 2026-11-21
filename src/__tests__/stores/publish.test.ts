import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePublishStore } from '../../stores/publish'
import { printDocument } from '../../utils/publishDocument'

vi.mock('../../utils/publishDocument', () => ({
  printDocument: vi.fn(),
}))

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

  it('printToPdf hands the document to the print pipeline', async () => {
    vi.mocked(printDocument).mockResolvedValue()
    const store = usePublishStore()

    await store.printToPdf({ html: '<p>Hi</p>' })

    expect(printDocument).toHaveBeenCalledWith({ html: '<p>Hi</p>' })
    expect(store.status).toBe('idle')
  })

  it('printToPdf reports a refused print instead of failing silently', async () => {
    vi.mocked(printDocument).mockRejectedValue('webview.print not allowed')
    const store = usePublishStore()

    await store.printToPdf({ html: '<p>Hi</p>' })

    expect(store.status).toBe('error')
    expect(store.statusMessage).toBe('Print failed: webview.print not allowed')
  })

  it('printToPdf ignores a second request while one is being prepared', async () => {
    let finish!: () => void
    vi.mocked(printDocument).mockClear()
    vi.mocked(printDocument).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const store = usePublishStore()

    const first = store.printToPdf({ html: '<p>One</p>' })
    await vi.waitFor(() => expect(printDocument).toHaveBeenCalledTimes(1))
    await store.printToPdf({ html: '<p>Two</p>' })
    expect(printDocument).toHaveBeenCalledTimes(1)

    finish()
    await first
    vi.mocked(printDocument).mockResolvedValue()
    await store.printToPdf({ html: '<p>Three</p>' })
    expect(printDocument).toHaveBeenCalledTimes(2)
  })
})
