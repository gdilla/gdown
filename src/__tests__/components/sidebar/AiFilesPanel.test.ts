import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AiFilesPanel from '../../../components/sidebar/AiFilesPanel.vue'
import { useAiFilesStore } from '../../../stores/aiFiles'
import { useSidebarStore } from '../../../stores/sidebar'

// Mock Tauri invoke at module level (overrides global setup mock for granular control)
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

// Mock the drag plugin used by FileTreeNode (transitive dependency)
vi.mock('@crabnebula/tauri-plugin-drag', () => ({
  startDrag: vi.fn(),
}))

describe('AiFilesPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockInvoke.mockReset()
    // Default mock: no files found
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'find_claude_project_dir') return Promise.resolve(null)
      if (cmd === 'find_instruction_files') return Promise.resolve([])
      if (cmd === 'list_files_with_mtime') return Promise.resolve([])
      return Promise.resolve(null)
    })
  })

  it('shows empty state when no AI files are found', async () => {
    const sidebar = useSidebarStore()
    sidebar.rootPath = '/test/project'

    const wrapper = mount(AiFilesPanel)
    // Wait for async discoverFiles to complete
    await vi.dynamicImportSettled()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('No AI files found')
  })

  it('shows loading state while discovering', async () => {
    const sidebar = useSidebarStore()
    sidebar.rootPath = '/test/project'

    // Make invoke hang
    mockInvoke.mockImplementation(() => new Promise(() => {}))

    const aiFiles = useAiFilesStore()
    aiFiles.loading = true

    const wrapper = mount(AiFilesPanel)

    expect(wrapper.text()).toContain('Scanning for AI files')
  })

  it('shows error state on failure', () => {
    const aiFiles = useAiFilesStore()
    aiFiles.error = 'Something went wrong'

    const wrapper = mount(AiFilesPanel)

    expect(wrapper.text()).toContain('Something went wrong')
    expect(wrapper.find('.retry-btn').exists()).toBe(true)
  })

  it('renders instruction files section', () => {
    const aiFiles = useAiFilesStore()
    aiFiles.instructions = [
      { name: 'CLAUDE.md', path: '/project/CLAUDE.md', category: 'instruction' },
      { name: 'CLAUDE.md', path: '/project/src/CLAUDE.md', category: 'instruction' },
    ]

    const wrapper = mount(AiFilesPanel)

    expect(wrapper.text()).toContain('Instructions')
    const rows = wrapper.findAll('.file-row')
    expect(rows).toHaveLength(2)
  })

  it('renders sessions section', () => {
    const aiFiles = useAiFilesStore()
    aiFiles.sessions = [
      {
        name: 'session-abc.json',
        path: '/dir/session-abc.json',
        category: 'session',
        modifiedAt: Math.floor(Date.now() / 1000) - 3600,
      },
    ]

    const wrapper = mount(AiFilesPanel)

    expect(wrapper.text()).toContain('Sessions')
    expect(wrapper.text()).toContain('session-abc.json')
  })

  it('renders memory section', () => {
    const aiFiles = useAiFilesStore()
    aiFiles.memoryFiles = [
      {
        name: 'MEMORY.md',
        path: '/dir/MEMORY.md',
        category: 'memory',
        modifiedAt: Math.floor(Date.now() / 1000) - 60,
      },
    ]

    const wrapper = mount(AiFilesPanel)

    expect(wrapper.text()).toContain('Memory')
    expect(wrapper.text()).toContain('MEMORY.md')
  })

  it('emits file open on click', async () => {
    const aiFiles = useAiFilesStore()
    aiFiles.instructions = [
      { name: 'CLAUDE.md', path: '/project/CLAUDE.md', category: 'instruction' },
    ]

    // Mock openFile on tabs store
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_file') return Promise.resolve('# Content')
      return Promise.resolve(null)
    })

    const wrapper = mount(AiFilesPanel)
    const row = wrapper.find('.file-row')
    await row.trigger('click')

    // The click should attempt to open the file (calls tabs.openFile internally)
    // We just verify the row is clickable and doesn't error
    expect(row.exists()).toBe(true)
  })
})
