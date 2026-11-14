import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import App from '../../App.vue'
import { useTabsStore } from '../../stores/tabs'

const { listeners } = vi.hoisted(() => ({ listeners: new Map<string, () => void>() }))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: () => void) => {
    listeners.set(name, handler)
    return () => {}
  }),
  emit: vi.fn().mockResolvedValue(undefined),
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

describe('App quit while background work is in flight', () => {
  let wrapper: VueWrapper
  let finishBackgroundWork: () => void
  let sessions: Array<{ state: string; inert: boolean }>

  const calls = (command: string) => mockedInvoke.mock.calls.filter(([c]) => c === command)
  const appUi = () => wrapper.find('.app-ui').element
  const requestExit = () => listeners.get('app-exit-requested')!()

  async function mountApp() {
    wrapper = mount(App, { global: { stubs }, attachTo: document.body })
    await flushPromises()
    sessions.length = 0
  }

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    listeners.clear()
    sessions = []
    const backgroundWork = new Promise<void>((resolve) => {
      finishBackgroundWork = resolve
    })
    mockedInvoke.mockReset()
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'wait_for_background_io') return backgroundWork as never
      if (command === 'save_session_state') {
        const state = (args as { state: string }).state
        const ui = document.querySelector('.app-ui')
        sessions.push({ state, inert: ui?.hasAttribute('inert') ?? false })
        return undefined as never
      }
      if (command === 'get_pending_open_files') return [] as never
      return null as never
    })
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('takes the final snapshot only after background work drains, then keeps the UI inert', async () => {
    useTabsStore().createTab(null, '# Draft')
    await mountApp()

    requestExit()
    await flushPromises()
    expect(calls('wait_for_background_io')).toHaveLength(1)
    expect(sessions).toHaveLength(0)
    expect(appUi().hasAttribute('inert')).toBe(false)

    finishBackgroundWork()
    await vi.waitFor(() => expect(calls('allow_exit')).toHaveLength(1))
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.inert).toBe(true)
    expect(appUi().hasAttribute('inert')).toBe(true)
  })

  it('captures edits made while waiting in the final recovery snapshot', async () => {
    const tabs = useTabsStore()
    const tab = tabs.createTab(null, '# Before')
    let editorText = '# Before'
    const capture = () => tabs.saveEditorState(tab.id, { markdown: editorText })
    window.addEventListener('gdown:capture-state', capture)
    try {
      await mountApp()
      requestExit()
      await flushPromises()

      editorText = '# Typed while waiting'
      finishBackgroundWork()
      await vi.waitFor(() => expect(calls('allow_exit')).toHaveLength(1))
    } finally {
      window.removeEventListener('gdown:capture-state', capture)
    }

    const finalSnapshot = JSON.parse(sessions[sessions.length - 1]!.state) as {
      tabs: Array<{ markdown: string }>
    }
    expect(finalSnapshot.tabs[0]!.markdown).toBe('# Typed while waiting')
  })

  it('restores normal editing when the quit is cancelled while waiting', async () => {
    useTabsStore().createTab(null, '# Draft')
    await mountApp()

    requestExit()
    await vi.waitFor(() => expect(wrapper.find('.finishing-work').exists()).toBe(true))
    await wrapper.find('.finishing-work .finishing-work-cancel').trigger('click')
    await flushPromises()

    expect(calls('cancel_exit')).toHaveLength(1)
    expect(calls('allow_exit')).toHaveLength(0)
    expect(sessions).toHaveLength(0)
    expect(wrapper.find('.finishing-work').exists()).toBe(false)
    expect(appUi().hasAttribute('inert')).toBe(false)

    // A later quit starts a fresh handshake.
    requestExit()
    await flushPromises()
    expect(calls('wait_for_background_io')).toHaveLength(2)
  })

  it('lets the user quit anyway past hung background work', async () => {
    useTabsStore().createTab(null, '# Draft')
    await mountApp()

    requestExit()
    await vi.waitFor(() => expect(wrapper.find('.finishing-work').exists()).toBe(true))
    await wrapper.find('.finishing-work .finishing-work-force').trigger('click')

    await vi.waitFor(() => expect(calls('allow_exit')).toHaveLength(1))
    expect(calls('allow_exit')[0]![1]).toEqual({ force: true })
    expect(sessions).toHaveLength(1)
  })

  it('still runs the dirty-document prompt after background work drains', async () => {
    const tabs = useTabsStore()
    const tab = tabs.createTab('/tmp/note.md', '# Dirty')
    tabs.setModified(tab.id, true)
    await mountApp()
    finishBackgroundWork()

    requestExit()
    await vi.waitFor(() => expect(wrapper.find('.close-prompt').exists()).toBe(true))
    expect(wrapper.find('.close-prompt').element.closest('[inert]')).toBeNull()
    const dontSave = wrapper.findAll('.close-prompt button').find((b) => b.text() === "Don't Save")!
    await dontSave.trigger('click')

    await vi.waitFor(() => expect(calls('allow_exit')).toHaveLength(1))
    expect(calls('cancel_exit')).toHaveLength(0)
  })
})
