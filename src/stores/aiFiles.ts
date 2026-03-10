import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'

/** Matches the Rust FileInfo struct returned by list_files_with_mtime */
export interface FileInfo {
  name: string
  path: string
  modified_at: number
}

/** Categorized AI file for display in the sidebar */
export interface AiFile {
  name: string
  path: string
  category: 'instruction' | 'session' | 'memory'
  modifiedAt?: number
}

export const useAiFilesStore = defineStore('aiFiles', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const claudeProjectPath = ref<string | null>(null)
  const instructions = ref<AiFile[]>([])
  const sessions = ref<AiFile[]>([])
  const memoryFiles = ref<AiFile[]>([])

  /** Whether any AI files were discovered */
  const hasAnyFiles = computed(
    () =>
      instructions.value.length > 0 || sessions.value.length > 0 || memoryFiles.value.length > 0,
  )

  /**
   * Discover Claude-related files for a project root path.
   * Calls three Tauri backend commands to find instruction files,
   * session/memory files in the Claude project directory.
   */
  async function discoverFiles(projectRootPath: string): Promise<void> {
    loading.value = true
    error.value = null

    try {
      // Find the Claude project directory
      const projectDir = await invoke<string | null>('find_claude_project_dir', {
        projectPath: projectRootPath,
      })
      claudeProjectPath.value = projectDir

      // Find instruction files (CLAUDE.md, AGENTS.md) in project tree + global
      const instructionPaths = await invoke<string[]>('find_instruction_files', {
        projectPath: projectRootPath,
      })
      instructions.value = instructionPaths.map((p) => ({
        name: p.split('/').pop() ?? p,
        path: p,
        category: 'instruction' as const,
      }))

      // If Claude project dir exists, list session and memory files
      if (projectDir) {
        const allFiles = await invoke<FileInfo[]>('list_files_with_mtime', {
          dirPath: projectDir,
        })

        sessions.value = allFiles
          .filter((f) => f.name.endsWith('.json') || f.name.endsWith('.jsonl'))
          .map((f) => ({
            name: f.name,
            path: f.path,
            category: 'session' as const,
            modifiedAt: f.modified_at,
          }))

        memoryFiles.value = allFiles
          .filter((f) => f.name.endsWith('.md'))
          .map((f) => ({
            name: f.name,
            path: f.path,
            category: 'memory' as const,
            modifiedAt: f.modified_at,
          }))
      } else {
        sessions.value = []
        memoryFiles.value = []
      }
    } catch (e) {
      error.value = typeof e === 'string' ? e : String(e)
      console.error('Failed to discover AI files:', e)
    } finally {
      loading.value = false
    }
  }

  /** Reset all state */
  function reset() {
    loading.value = false
    error.value = null
    claudeProjectPath.value = null
    instructions.value = []
    sessions.value = []
    memoryFiles.value = []
  }

  return {
    // State
    loading,
    error,
    claudeProjectPath,
    instructions,
    sessions,
    memoryFiles,

    // Computed
    hasAnyFiles,

    // Actions
    discoverFiles,
    reset,
  }
})
