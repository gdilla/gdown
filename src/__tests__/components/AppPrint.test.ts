import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '../../App.vue'
import { useTabsStore } from '../../stores/tabs'
import { useEditorSettingsStore } from '../../stores/editorSettings'
import { usePreferencesStore } from '../../stores/preferences'
import { printDocument, type PrintContent } from '../../utils/publishDocument'

const { listeners } = vi.hoisted(() => ({ listeners: new Map<string, () => void>() }))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: () => void) => {
    listeners.set(name, handler)
    return () => {}
  }),
  emit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../utils/publishDocument', () => ({
  printDocument: vi.fn().mockResolvedValue(undefined),
}))

// Real Editor and SourceEditor, as in AppModeSwitch.test.ts: what is printed
// depends on which of the two is mounted.
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

const mockedPrint = vi.mocked(printDocument)

async function printed(): Promise<PrintContent> {
  await vi.waitFor(() => expect(mockedPrint).toHaveBeenCalledTimes(1))
  return mockedPrint.mock.calls[0]![0]
}

describe('App print / export PDF', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    listeners.clear()
    mockedPrint.mockClear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('File > Print prints the rich editor’s rendered document', async () => {
    useTabsStore().createTab(null, '# Title\n\nSome **bold** text')
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()

    listeners.get('menu-print-pdf')!()

    const content = await printed()
    expect('html' in content && content.html).toContain('<strong>bold</strong>')
  })

  it('prints the source text, front matter included, when the source editor is active', async () => {
    useEditorSettingsStore().defaultMode = 'source'
    const tab = useTabsStore().createTab(null, '# Title\n\n<img src=x onerror="alert(1)">')
    tab.editorState.frontmatter = 'title: Notes'
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await vi.waitFor(() => expect(wrapper!.find('.cm-content').exists()).toBe(true))

    // The export dialog's PDF fallback (stores/export.ts) asks for a print this way.
    window.dispatchEvent(new Event('gdown:print'))

    expect(await printed()).toEqual({
      text: '---\ntitle: Notes\n---\n\n# Title\n\n<img src=x onerror="alert(1)">',
    })
  })

  it('does not print while a modal blocks app actions', async () => {
    useTabsStore().createTab(null, '# Title')
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    usePreferencesStore().open()

    listeners.get('menu-print-pdf')!()
    window.dispatchEvent(new Event('gdown:print'))
    await flushPromises()

    expect(mockedPrint).not.toHaveBeenCalled()
  })
})
