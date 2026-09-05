import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore, type SessionState } from '../../stores/session'
import { useTabsStore } from '../../stores/tabs'
import { useAutoSaveStore } from '../../stores/autoSave'
import { usePreferencesStore } from '../../stores/preferences'

const mockedInvoke = vi.mocked(invoke)

function sessionState(overrides: Partial<SessionState['tabs'][number]>): SessionState {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    tabs: [
      {
        filePath: '/tmp/note.md',
        title: 'note.md',
        isUntitled: false,
        isModified: false,
        scrollTop: 0,
        selection: { from: 0, to: 0 },
        markdown: '',
        frontmatter: null,
        frontmatterAttributes: {},
        ...overrides,
      },
    ],
    activeTabIndex: 0,
    sidebarFolderPath: null,
    sidebarVisible: false,
  }
}

describe('useSessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedInvoke.mockReset()
  })

  afterEach(() => {
    useSessionStore().stopAutoSave()
  })

  it('restores dirty named files from the recovery snapshot without rereading disk', async () => {
    const session = useSessionStore()
    const state = sessionState({
      isModified: true,
      markdown: '# Recovered work',
      frontmatter: 'title: Recovered',
      frontmatterAttributes: { title: 'Recovered' },
      scrollTop: 120,
      selection: { from: 3, to: 5 },
    })
    mockedInvoke.mockResolvedValueOnce(JSON.stringify(state))

    await expect(session.restoreSession()).resolves.toBe(true)

    const tabsStore = useTabsStore()
    const tab = tabsStore.tabs[0]
    expect(tab?.isModified).toBe(true)
    expect(tab?.editorState.markdown).toBe('# Recovered work')
    expect(tab?.editorState.frontmatter).toBe('title: Recovered')
    expect(tab?.editorState.scrollTop).toBe(120)
    expect(mockedInvoke.mock.calls.some(([command]) => command === 'read_file')).toBe(false)
  })

  it('requires an explicit disk decision before saving a recovered dirty file', async () => {
    const session = useSessionStore()
    const state = sessionState({ isModified: true, markdown: '# Recovered work' })
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'load_session_state') return JSON.stringify(state)
      if (command === 'get_file_modified_time') return 200
      if (command === 'read_file') return '# Changed while closed'
      return undefined
    })

    await expect(session.restoreSession()).resolves.toBe(true)

    usePreferencesStore().autoSaveEnabled = false
    const tab = useTabsStore().tabs[0]!
    const autoSaveStore = useAutoSaveStore()
    const save = autoSaveStore.saveTab(tab.id)
    await vi.waitFor(() => expect(autoSaveStore.conflictDialog).not.toBeNull())

    expect(mockedInvoke.mock.calls.some(([command]) => command === 'write_file')).toBe(false)
    autoSaveStore.resolveConflict('cancel')
    await expect(save).resolves.toBe(false)
    expect(tab.isModified).toBe(true)
  })

  it('rereads clean named files and restores their full file contract', async () => {
    const session = useSessionStore()
    const state = sessionState({ markdown: '# Stale session body' })
    const diskContent = `---
title: From disk
---
# Fresh body`
    mockedInvoke.mockResolvedValueOnce(JSON.stringify(state)).mockResolvedValueOnce(diskContent)

    await expect(session.restoreSession()).resolves.toBe(true)

    const tabsStore = useTabsStore()
    expect(tabsStore.tabs[0]?.isModified).toBe(false)
    expect(tabsStore.tabs[0]?.editorState.markdown).toBe('# Fresh body')
    expect(tabsStore.tabs[0]?.editorState.frontmatter).toBe('title: From disk')
    expect(mockedInvoke).toHaveBeenCalledWith('read_file', { path: '/tmp/note.md' })
  })

  it('keeps an explicitly dirty blank untitled document for recovery', async () => {
    const session = useSessionStore()
    const state = sessionState({
      filePath: null,
      title: 'Untitled-7',
      isUntitled: true,
      isModified: true,
      markdown: '',
    })
    mockedInvoke.mockResolvedValueOnce(JSON.stringify(state))

    await expect(session.restoreSession()).resolves.toBe(true)

    const tab = useTabsStore().tabs[0]
    expect(tab?.isUntitled).toBe(true)
    expect(tab?.isModified).toBe(true)
    expect(tab?.editorState.markdown).toBe('')
  })

  it('does not resurrect an untitled draft discarded during quit', async () => {
    const session = useSessionStore()
    const tabsStore = useTabsStore()
    const tab = tabsStore.createTab(null, '# Live draft')
    tabsStore.setModified(tab.id, true)
    tabsStore.setCloseDecisionHandler(async () => 'discard')

    // App captures the live editor before asking for discard decisions.
    expect(session.captureSessionState().tabs[0]?.markdown).toBe('# Live draft')
    await expect(tabsStore.prepareCloseAll()).resolves.toBe(true)
    expect(tabsStore.tabs[0]?.editorState.markdown).toBe('')

    mockedInvoke.mockResolvedValueOnce(undefined)
    await session.saveSession()
    const saveCall = mockedInvoke.mock.calls.find(([command]) => command === 'save_session_state')
    const savedState = JSON.parse((saveCall?.[1] as { state: string }).state) as SessionState
    expect(savedState.tabs).toHaveLength(1)
    expect(savedState.tabs[0]?.isModified).toBe(false)
    expect(savedState.tabs[0]?.markdown).toBe('')

    setActivePinia(createPinia())
    const restoredSession = useSessionStore()
    mockedInvoke.mockReset().mockResolvedValueOnce(JSON.stringify(savedState))
    await expect(restoredSession.restoreSession()).resolves.toBe(false)
    expect(useTabsStore().tabs).toHaveLength(0)
  })
})
