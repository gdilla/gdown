import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useAutoSaveStore } from '../../stores/autoSave'
import { usePreferencesStore } from '../../stores/preferences'
import { useTabsStore } from '../../stores/tabs'
import { assembleFrontMatter } from '../../utils/frontmatter'

const mockedInvoke = vi.mocked(invoke)

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function disableAutoSave() {
  usePreferencesStore().autoSaveEnabled = false
}

describe('useAutoSaveStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedInvoke.mockReset()
  })

  it('writes one complete file from body and frontmatter state', async () => {
    const tabsStore = useTabsStore()
    const autoSaveStore = useAutoSaveStore()
    disableAutoSave()

    const tab = tabsStore.createTab('/tmp/note.md', '# Body')
    tabsStore.saveEditorState(tab.id, {
      frontmatter: 'title: Note',
      frontmatterAttributes: { title: 'Note' },
    })
    tabsStore.setModified(tab.id, true)
    mockedInvoke
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(101)

    await expect(autoSaveStore.saveTab(tab.id)).resolves.toBe(true)

    const write = mockedInvoke.mock.calls.find(([command]) => command === 'write_file')
    expect(write?.[1]).toEqual({
      path: '/tmp/note.md',
      content: assembleFrontMatter('title: Note', '# Body'),
    })
    expect(tabsStore.tabs[0]?.isModified).toBe(false)
  })

  it('flushes the live editor before reading a save snapshot', async () => {
    const tabsStore = useTabsStore()
    const autoSaveStore = useAutoSaveStore()
    disableAutoSave()

    const tab = tabsStore.createTab('/tmp/note.md', '# Before')
    tabsStore.setModified(tab.id, true)
    const capture = () => {
      tabsStore.saveEditorState(tab.id, { markdown: '# Latest' })
      tabsStore.setModified(tab.id, true)
    }
    window.addEventListener('gdown:capture-state', capture)
    mockedInvoke
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(101)

    try {
      await expect(autoSaveStore.saveTab(tab.id)).resolves.toBe(true)
    } finally {
      window.removeEventListener('gdown:capture-state', capture)
    }

    expect(mockedInvoke).toHaveBeenCalledWith('write_file', {
      path: '/tmp/note.md',
      content: '# Latest',
    })
  })

  it('keeps edits made while a write is in flight dirty', async () => {
    const tabsStore = useTabsStore()
    const autoSaveStore = useAutoSaveStore()
    disableAutoSave()

    const tab = tabsStore.createTab('/tmp/note.md', '# Before')
    tabsStore.setModified(tab.id, true)
    const write = deferred<void>()
    mockedInvoke
      .mockResolvedValueOnce(100)
      .mockReturnValueOnce(write.promise)
      .mockResolvedValueOnce(101)

    const saving = autoSaveStore.saveTab(tab.id)
    await vi.waitFor(() => {
      expect(mockedInvoke.mock.calls.some(([command]) => command === 'write_file')).toBe(true)
    })

    tabsStore.saveEditorState(tab.id, { markdown: '# After' })
    tabsStore.setModified(tab.id, true)
    write.resolve()

    await expect(saving).resolves.toBe(false)
    expect(tabsStore.tabs[0]?.editorState.markdown).toBe('# After')
    expect(tabsStore.tabs[0]?.isModified).toBe(true)
  })

  it('serializes writes for separate tabs behind one save lane', async () => {
    const tabsStore = useTabsStore()
    const autoSaveStore = useAutoSaveStore()
    disableAutoSave()

    const firstTab = tabsStore.createTab('/tmp/first.md', '# First')
    const secondTab = tabsStore.createTab('/tmp/second.md', '# Second')
    tabsStore.setModified(firstTab.id, true)
    tabsStore.setModified(secondTab.id, true)
    const firstWrite = deferred<void>()
    let writeCount = 0
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'get_file_modified_time') return 100
      if (command === 'write_file') {
        writeCount += 1
        if (writeCount === 1) return firstWrite.promise
      }
      return undefined
    })

    const firstSave = autoSaveStore.saveTab(firstTab.id)
    const secondSave = autoSaveStore.saveTab(secondTab.id)
    await vi.waitFor(() => expect(writeCount).toBe(1))
    expect(writeCount).toBe(1)

    firstWrite.resolve()
    await Promise.all([firstSave, secondSave])
    expect(writeCount).toBe(2)
  })

  it('writes once after Keep mine resolves an external dirty conflict', async () => {
    const tabsStore = useTabsStore()
    const autoSaveStore = useAutoSaveStore()
    disableAutoSave()

    const tab = tabsStore.createTab('/tmp/note.md', '# Local')
    tabsStore.setModified(tab.id, true)
    autoSaveStore.knownModifiedTimes['/tmp/note.md'] = 100

    let writeCount = 0
    let modifiedTime = 200
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'get_file_modified_time') return modifiedTime
      if (command === 'read_file') return '# External'
      if (command === 'write_file') {
        writeCount += 1
        modifiedTime = 201
      }
      return undefined
    })

    const scan = autoSaveStore.checkForExternalChanges()
    await vi.waitFor(() => expect(autoSaveStore.conflictDialog).not.toBeNull())
    expect(writeCount).toBe(0)

    autoSaveStore.resolveConflict('overwrite')
    await expect(scan).resolves.toBeUndefined()

    expect(writeCount).toBe(1)
    expect(autoSaveStore.conflictDialog).toBeNull()
    expect(tabsStore.tabs[0]?.isModified).toBe(false)
  })

  it('keeps a Keep mine write visible to close until deferred IPC finishes', async () => {
    const tabsStore = useTabsStore()
    const autoSaveStore = useAutoSaveStore()
    disableAutoSave()

    const tab = tabsStore.createTab('/tmp/note.md', '# Local')
    tabsStore.setModified(tab.id, true)
    autoSaveStore.knownModifiedTimes['/tmp/note.md'] = 100
    const write = deferred<void>()
    let writeCount = 0
    let modifiedTime = 200
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'get_file_modified_time') return modifiedTime
      if (command === 'read_file') return '# External'
      if (command === 'write_file') {
        writeCount += 1
        return write.promise
      }
      return undefined
    })

    const scan = autoSaveStore.checkForExternalChanges()
    await vi.waitFor(() => expect(autoSaveStore.conflictDialog).not.toBeNull())
    autoSaveStore.resolveConflict('overwrite')
    await expect(scan).resolves.toBeUndefined()
    await vi.waitFor(() => expect(writeCount).toBe(1))

    const closing = tabsStore.closeTab(tab.id)
    let closeSettled = false
    void closing.then(() => {
      closeSettled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(closeSettled).toBe(false)

    modifiedTime = 201
    write.resolve()
    await expect(closing).resolves.toBe(true)
    expect(tabsStore.tabs).toHaveLength(0)
  })

  it('coalesces repeated Save As requests while the native dialog is open', async () => {
    const tabsStore = useTabsStore()
    const autoSaveStore = useAutoSaveStore()
    disableAutoSave()

    const tab = tabsStore.createTab(null, '# Draft')
    tabsStore.setModified(tab.id, true)
    const dialog = deferred<string | null>()
    let dialogCount = 0
    let writeCount = 0
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'save_file_dialog') {
        dialogCount += 1
        return dialog.promise
      }
      if (command === 'write_file') writeCount += 1
      return command === 'get_file_modified_time' ? 100 : undefined
    })

    const first = autoSaveStore.saveTabAs(tab.id)
    await vi.waitFor(() => expect(dialogCount).toBe(1))
    const second = autoSaveStore.saveTabAs(tab.id)
    expect(dialogCount).toBe(1)

    dialog.resolve('/tmp/draft.md')
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(dialogCount).toBe(1)
    expect(writeCount).toBe(1)
  })

  it('does not blindly write a recovered dirty file when disk verification fails', async () => {
    const tabsStore = useTabsStore()
    const autoSaveStore = useAutoSaveStore()
    disableAutoSave()

    const tab = tabsStore.createTab('/tmp/recovered.md', '# Recovered')
    tabsStore.setModified(tab.id, true)
    autoSaveStore.markRecoveryTab(tab.id)
    mockedInvoke.mockRejectedValue(new Error('permission denied'))

    await expect(autoSaveStore.saveTab(tab.id)).resolves.toBe(false)
    expect(mockedInvoke.mock.calls.some(([command]) => command === 'write_file')).toBe(false)
    expect(tabsStore.tabs[0]?.isModified).toBe(true)
  })
})
