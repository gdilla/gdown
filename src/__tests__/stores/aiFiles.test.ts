import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiFilesStore } from '../../stores/aiFiles'

// Mock Tauri invoke
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

describe('useAiFilesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockInvoke.mockReset()
  })

  it('has correct initial state', () => {
    const store = useAiFilesStore()

    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.claudeProjectPath).toBeNull()
    expect(store.instructions).toEqual([])
    expect(store.memoryFiles).toEqual([])
  })

  describe('hasAnyFiles', () => {
    it('returns false when no files are discovered', () => {
      const store = useAiFilesStore()

      expect(store.hasAnyFiles).toBe(false)
    })

    it('returns true when instructions exist', () => {
      const store = useAiFilesStore()

      store.instructions = [
        { name: 'CLAUDE.md', path: '/project/CLAUDE.md', category: 'instruction' },
      ]

      expect(store.hasAnyFiles).toBe(true)
    })

    it('returns true when memory files exist', () => {
      const store = useAiFilesStore()

      store.memoryFiles = [
        { name: 'MEMORY.md', path: '/dir/MEMORY.md', category: 'memory', modifiedAt: 1000 },
      ]

      expect(store.hasAnyFiles).toBe(true)
    })
  })

  describe('reset', () => {
    it('resets all state to defaults', () => {
      const store = useAiFilesStore()

      store.loading = true
      store.error = 'some error'
      store.claudeProjectPath = '/some/path'
      store.instructions = [
        { name: 'CLAUDE.md', path: '/project/CLAUDE.md', category: 'instruction' },
      ]
      store.memoryFiles = [
        { name: 'MEMORY.md', path: '/dir/MEMORY.md', category: 'memory', modifiedAt: 1000 },
      ]

      store.reset()

      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
      expect(store.claudeProjectPath).toBeNull()
      expect(store.instructions).toEqual([])
      expect(store.memoryFiles).toEqual([])
    })
  })

  describe('discoverFiles', () => {
    it('populates instructions when found', async () => {
      const store = useAiFilesStore()

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'find_claude_project_dir') return Promise.resolve(null)
        if (cmd === 'find_instruction_files')
          return Promise.resolve(['/project/CLAUDE.md', '/project/src/CLAUDE.md'])
        return Promise.resolve([])
      })

      await store.discoverFiles('/project')

      expect(store.loading).toBe(false)
      expect(store.instructions).toHaveLength(2)
      expect(store.instructions[0]!.name).toBe('CLAUDE.md')
      expect(store.instructions[0]!.category).toBe('instruction')
    })

    it('populates memory files when claude project dir exists', async () => {
      const store = useAiFilesStore()

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'find_claude_project_dir')
          return Promise.resolve('/home/user/.claude/projects/Users-test-project')
        if (cmd === 'find_instruction_files') return Promise.resolve([])
        if (cmd === 'list_files_with_mtime')
          return Promise.resolve([
            { name: 'MEMORY.md', path: '/dir/MEMORY.md', modified_at: 1000 },
            { name: 'notes.md', path: '/dir/notes.md', modified_at: 2000 },
          ])
        return Promise.resolve([])
      })

      await store.discoverFiles('/test/project')

      expect(store.claudeProjectPath).toBe('/home/user/.claude/projects/Users-test-project')
      expect(store.memoryFiles).toHaveLength(2)
      expect(store.memoryFiles[0]!.name).toBe('MEMORY.md')
    })

    it('sets error on failure', async () => {
      const store = useAiFilesStore()

      mockInvoke.mockRejectedValue('Backend error')

      await store.discoverFiles('/project')

      expect(store.loading).toBe(false)
      expect(store.error).toBe('Backend error')
    })

    it('clears memory when no claude project dir', async () => {
      const store = useAiFilesStore()

      // Pre-populate
      store.memoryFiles = [
        { name: 'old.md', path: '/old/old.md', category: 'memory', modifiedAt: 1 },
      ]

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'find_claude_project_dir') return Promise.resolve(null)
        if (cmd === 'find_instruction_files') return Promise.resolve([])
        return Promise.resolve([])
      })

      await store.discoverFiles('/project')

      expect(store.memoryFiles).toEqual([])
    })
  })
})
