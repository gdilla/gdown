export interface CoalescedSnapshotScheduler {
  /** Schedule a snapshot after the debounce window. */
  schedule(): void
  /** Capture immediately, including when no timer is pending. */
  flush(): void
  /** Drop a pending snapshot without capturing it. */
  cancel(): void
}

/**
 * Coalesce rich-editor snapshot work while keeping explicit synchronous
 * boundaries available for save, tab, mode, and close operations.
 */
export function createCoalescedSnapshotScheduler(
  capture: () => void,
  delayMs = 200,
): CoalescedSnapshotScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function flush(): void {
    clearTimer()
    capture()
  }

  return {
    schedule(): void {
      clearTimer()
      timer = setTimeout(flush, delayMs)
    },
    flush,
    cancel: clearTimer,
  }
}
