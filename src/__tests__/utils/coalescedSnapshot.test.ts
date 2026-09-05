import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCoalescedSnapshotScheduler } from '../../utils/coalescedSnapshot'

describe('createCoalescedSnapshotScheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces an edit burst into one delayed capture', () => {
    vi.useFakeTimers()
    const capture = vi.fn()
    const scheduler = createCoalescedSnapshotScheduler(capture, 200)

    scheduler.schedule()
    scheduler.schedule()
    scheduler.schedule()

    vi.advanceTimersByTime(199)
    expect(capture).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(capture).toHaveBeenCalledOnce()
  })

  it('resets the debounce window when another edit arrives', () => {
    vi.useFakeTimers()
    const capture = vi.fn()
    const scheduler = createCoalescedSnapshotScheduler(capture, 200)

    scheduler.schedule()
    vi.advanceTimersByTime(150)
    scheduler.schedule()
    vi.advanceTimersByTime(199)
    expect(capture).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(capture).toHaveBeenCalledOnce()
  })

  it.each(['save', 'tab switch', 'mode switch', 'close'])(
    'flushes immediately at the %s boundary and cancels the timer',
    () => {
      vi.useFakeTimers()
      const capture = vi.fn()
      const scheduler = createCoalescedSnapshotScheduler(capture, 200)

      scheduler.schedule()
      scheduler.flush()

      expect(capture).toHaveBeenCalledOnce()
      vi.advanceTimersByTime(1_000)
      expect(capture).toHaveBeenCalledOnce()
    },
  )

  it('captures at an explicit boundary even without a pending edit', () => {
    const capture = vi.fn()
    const scheduler = createCoalescedSnapshotScheduler(capture)

    scheduler.flush()

    expect(capture).toHaveBeenCalledOnce()
  })

  it('cancels a pending capture without invoking it', () => {
    vi.useFakeTimers()
    const capture = vi.fn()
    const scheduler = createCoalescedSnapshotScheduler(capture, 200)

    scheduler.schedule()
    scheduler.cancel()
    vi.advanceTimersByTime(1_000)

    expect(capture).not.toHaveBeenCalled()
  })
})
