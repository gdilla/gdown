import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import App from '../../App.vue'
import { useExportStore } from '../../stores/export'
import { useTabsStore } from '../../stores/tabs'
import type { ExportConfig } from '../../types/export'

const { listeners } = vi.hoisted(() => ({ listeners: new Map<string, () => void>() }))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: () => void) => {
    listeners.set(name, handler)
    return () => {}
  }),
  emit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../services/export', () => ({
  getExportConfig: vi.fn(async () => ({ extra_args: [] }) as unknown as ExportConfig),
}))

const stubs = {
  TabBar: true,
  Sidebar: true,
  OutlinePanel: true,
  StatusBar: true,
  RecentFiles: true,
  ConflictDialog: true,
  SaveNotification: true,
  PreferencesWindow: true,
  ExportDialog: true,
  ExportToast: true,
  QuickOpenDialog: true,
  ImageViewer: true,
  Editor: true,
}

const mockedInvoke = vi.mocked(invoke)
const calls = (command: string) => mockedInvoke.mock.calls.filter(([c]) => c === command)

describe('App quit during an export', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    listeners.clear()
    mockedInvoke.mockReset()
    mockedInvoke.mockImplementation(async (command) => {
      // Pandoc never finishes within this test.
      if (command === 'export_document') return new Promise(() => {}) as never
      if (command === 'get_pending_open_files') return [] as never
      return null as never
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('quits through the normal handshake without waiting for the export', async () => {
    // Pandoc writes to a hidden temp file that is renamed only on success
    // (export.rs run_pandoc_export), so abandoning it leaves the destination as it was.
    useTabsStore().createTab('/tmp/notes.md', '# Notes')
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()

    const exportStore = useExportStore()
    exportStore.formats = [{ id: 'html', label: 'HTML', extension: 'html' }]
    exportStore.pandocInfo = { path: '/usr/bin/pandoc', version: '3.7' }
    exportStore.selectedFormatId = 'html'
    exportStore.customOutputPath = '/tmp/notes.html'
    void exportStore.performExport()
    await vi.waitFor(() => expect(calls('export_document')).toHaveLength(1))

    listeners.get('app-exit-requested')!()

    await vi.waitFor(() => expect(calls('allow_exit')).toHaveLength(1))
    expect(calls('save_session_state').length).toBeGreaterThan(0)
    expect(calls('cancel_exit')).toHaveLength(0)
    expect(exportStore.isExporting).toBe(true)
  })
})
