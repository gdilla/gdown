import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '../../App.vue'
import { useTabsStore } from '../../stores/tabs'
import { useEditorModeStore } from '../../stores/editorMode'
import { useEditorSettingsStore } from '../../stores/editorSettings'

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}))

// SourceEditor is loaded with defineAsyncComponent so CodeMirror stays out of
// the startup chunk. These tests use the real Editor and SourceEditor to prove
// the WYSIWYG <-> source handoff still works when the source editor resolves
// asynchronously.
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
  EditorContent: { template: '<div />' },
  LinkTooltip: true,
  InsertLinkDialog: true,
  FindReplace: true,
}

function pressCmdSlash() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }))
}

async function sourceText(wrapper: VueWrapper): Promise<string> {
  await vi.waitFor(() => expect(wrapper.find('.cm-content').exists()).toBe(true))
  return wrapper.find('.cm-content').text()
}

describe('App mode switching with an async SourceEditor', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('mounts the source editor with the tab content when default mode is source', async () => {
    useEditorSettingsStore().defaultMode = 'source'
    useTabsStore().createTab(null, '# Startup source')

    wrapper = mount(App, { global: { stubs } })
    await flushPromises()

    expect(useEditorModeStore().mode).toBe('source')
    expect(await sourceText(wrapper)).toContain('# Startup source')
  })

  it('round-trips WYSIWYG -> source -> WYSIWYG via Cmd+/ without losing content', async () => {
    const tab = useTabsStore().createTab(null, '# Round trip')
    const modeStore = useEditorModeStore()

    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    expect(modeStore.mode).toBe('wysiwyg')

    pressCmdSlash()
    await flushPromises()
    expect(modeStore.mode).toBe('source')
    expect(await sourceText(wrapper)).toContain('# Round trip')

    pressCmdSlash()
    await flushPromises()
    expect(modeStore.mode).toBe('wysiwyg')
    expect(wrapper.find('.cm-content').exists()).toBe(false)
    expect(tab.editorState.markdown).toBe('# Round trip')
  })
})
