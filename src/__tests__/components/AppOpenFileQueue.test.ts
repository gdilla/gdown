import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import App from '../../App.vue'
import { useTabsStore } from '../../stores/tabs'
import { usePreferencesStore } from '../../stores/preferences'

type Handler = (event: { payload: unknown }) => void
const handlers = new Map<string, Handler>()

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((name: string, handler: Handler) => {
    handlers.set(name, handler)
    return Promise.resolve(() => handlers.delete(name))
  }),
  emit: vi.fn().mockResolvedValue(undefined),
}))

const mockedInvoke = vi.mocked(invoke)

describe('App open-file events while a modal blocks app actions', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(async () => {
    handlers.clear()
    mockedInvoke.mockReset()
    mockedInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === 'get_pending_open_files' ? [] : null),
    )
    setActivePinia(createPinia())
    wrapper = shallowMount(App)
    await flushPromises()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  function emitTauri(name: string, payload: unknown): void {
    const handler = handlers.get(name)
    expect(handler, `listener for ${name}`).toBeDefined()
    handler!({ payload })
  }

  it('opens files immediately when nothing blocks', () => {
    const openFile = vi.spyOn(useTabsStore(), 'openFile').mockResolvedValue(null)
    emitTauri('open-file', '/docs/a.md')
    expect(openFile).toHaveBeenCalledWith('/docs/a.md')
  })

  it('queues open-file and open-files while Preferences is open, then opens them on close', async () => {
    const preferences = usePreferencesStore()
    const openFile = vi.spyOn(useTabsStore(), 'openFile').mockResolvedValue(null)
    preferences.open()
    await flushPromises()

    emitTauri('open-file', '/docs/a.md')
    emitTauri('open-files', ['/docs/b.md', '/docs/c.md'])
    expect(openFile).not.toHaveBeenCalled()

    preferences.close()
    await flushPromises()

    expect(openFile.mock.calls.map((call) => call[0])).toEqual([
      '/docs/a.md',
      '/docs/b.md',
      '/docs/c.md',
    ])
  })

  it('does not open queued files once the app exit is approved', async () => {
    const tabsStore = useTabsStore()
    const openFile = vi.spyOn(tabsStore, 'openFile').mockResolvedValue(null)
    let finishClose: (ok: boolean) => void = () => {}
    vi.spyOn(tabsStore, 'prepareCloseAll').mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishClose = resolve
      }),
    )

    emitTauri('app-exit-requested', null)
    await flushPromises()
    emitTauri('open-file', '/docs/late.md')
    finishClose(true)
    await flushPromises()

    expect(openFile).not.toHaveBeenCalled()
    expect(mockedInvoke).toHaveBeenCalledWith('allow_exit')
  })

  it('opens files queued during an exit that the user cancels', async () => {
    const tabsStore = useTabsStore()
    const openFile = vi.spyOn(tabsStore, 'openFile').mockResolvedValue(null)
    let finishClose: (ok: boolean) => void = () => {}
    vi.spyOn(tabsStore, 'prepareCloseAll').mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishClose = resolve
      }),
    )

    emitTauri('app-exit-requested', null)
    await flushPromises()
    emitTauri('open-file', '/docs/kept.md')
    finishClose(false)
    await flushPromises()

    expect(mockedInvoke).toHaveBeenCalledWith('cancel_exit')
    expect(openFile).toHaveBeenCalledWith('/docs/kept.md')
  })
})
