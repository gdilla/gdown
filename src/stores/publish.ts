/**
 * Publish Store — manages document publishing state
 *
 * Handles HTML export, rich text copy, and PDF print with
 * status feedback and auto-reset timers.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PrintContent } from '../utils/publishDocument'

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

  let printing = false

  /**
   * Print the document through the native print sheet (Save as PDF on macOS).
   * A request made while one is still being prepared is ignored: they share
   * one print root, and each would open its own sheet.
   * Resolves to whether this request was handed to the print sheet.
   */
  async function printToPdf(content: PrintContent): Promise<boolean> {
    if (printing) return false
    printing = true
    try {
      const { printDocument } = await import('../utils/publishDocument')
      await printDocument(content)
      return true
    } catch (err) {
      setStatus('error', `Print failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    } finally {
      printing = false
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
