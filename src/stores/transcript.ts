import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { parseTranscript, type ParsedTranscript } from '../utils/transcriptParser'

export const useTranscriptStore = defineStore('transcript', () => {
  const transcript = ref<ParsedTranscript | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentFilePath = ref<string | null>(null)

  async function loadTranscript(filePath: string): Promise<void> {
    // Skip re-fetch if already loaded
    if (currentFilePath.value === filePath) return

    loading.value = true
    error.value = null

    try {
      const content = await invoke<string>('read_file', { path: filePath })
      transcript.value = parseTranscript(content)
      currentFilePath.value = filePath
    } catch (err) {
      transcript.value = null
      error.value = err instanceof Error ? err.message : 'Failed to load transcript'
    } finally {
      loading.value = false
    }
  }

  function clear(): void {
    transcript.value = null
    currentFilePath.value = null
    error.value = null
    loading.value = false
  }

  return {
    transcript,
    loading,
    error,
    currentFilePath,
    loadTranscript,
    clear,
  }
})
