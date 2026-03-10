/**
 * Publish Store — manages document publishing state
 *
 * Handles HTML export, rich text copy, and PDF print with
 * status feedback and auto-reset timers.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export type PublishStatus = 'idle' | 'working' | 'success' | 'error'

export const usePublishStore = defineStore('publish', () => {
  const status = ref<PublishStatus>('idle')
  const statusMessage = ref('')
  const lastOutputPath = ref<string | null>(null)

  let resetTimer: ReturnType<typeof setTimeout> | null = null

  function clearResetTimer() {
    if (resetTimer !== null) {
      clearTimeout(resetTimer)
      resetTimer = null
    }
  }

  function setStatus(newStatus: PublishStatus, message = '') {
    clearResetTimer()
    status.value = newStatus
    statusMessage.value = message

    // Auto-reset after success (3s) or error (5s)
    if (newStatus === 'success') {
      resetTimer = setTimeout(() => {
        status.value = 'idle'
        statusMessage.value = ''
      }, 3000)
    } else if (newStatus === 'error') {
      resetTimer = setTimeout(() => {
        status.value = 'idle'
        statusMessage.value = ''
      }, 5000)
    }
  }

  /**
   * Export current document as standalone HTML file.
   * Dynamically imports publishDocument to keep bundle lean.
   */
  async function exportHtml(getHtml: () => string, title: string, fileName: string): Promise<void> {
    setStatus('working', 'Exporting HTML...')
    try {
      const { exportToHtml } = await import('../utils/publishDocument')
      const path = await exportToHtml(getHtml(), title, fileName)
      lastOutputPath.value = path
      setStatus('success', `Exported to ${path.split('/').pop() ?? path}`)
    } catch (err) {
      if (err instanceof Error && err.message === 'Export cancelled by user') {
        setStatus('idle')
        return
      }
      setStatus('error', err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Copy document as rich text (HTML) to clipboard.
   */
  async function copyRichText(getHtml: () => string, title: string): Promise<void> {
    setStatus('working', 'Copying rich text...')
    try {
      const { copyAsRichText } = await import('../utils/publishDocument')
      await copyAsRichText(getHtml(), title)
      setStatus('success', 'Copied as rich text')
    } catch (err) {
      setStatus('error', err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Trigger native print dialog (Save as PDF on macOS).
   */
  async function printToPdf(): Promise<void> {
    try {
      const { triggerPrint } = await import('../utils/publishDocument')
      triggerPrint()
    } catch (err) {
      setStatus('error', err instanceof Error ? err.message : String(err))
    }
  }

  return {
    // State
    status,
    statusMessage,
    lastOutputPath,

    // Actions
    setStatus,
    exportHtml,
    copyRichText,
    printToPdf,
  }
})
