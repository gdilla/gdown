import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useAutoSaveStore } from '../../stores/autoSave'
import { usePreferencesStore } from '../../stores/preferences'
import { useTabsStore } from '../../stores/tabs'
import { assembleFrontMatter } from '../../utils/frontmatter'
import { MAX_OPEN_BYTES, MAX_RICH_CHARS } from '../../utils/documentLimits'

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
    // get_file_modified_time, then write_file returning the written mtime
    mockedInvoke.mockResolvedValueOnce(100).mockResolvedValueOnce(101)

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
    // get_file_modified_time, then write_file returning the written mtime
    mockedInvoke.mockResolvedValueOnce(100).mockResolvedValueOnce(101)

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
    const write = deferred<number>()
    mockedInvoke.mockResolvedValueOnce(100).mockReturnValueOnce(write.promise)

    const saving = autoSaveStore.saveTab(tab.id)
    await vi.waitFor(() => {
      expect(mockedInvoke.mock.calls.some(([command]) => command === 'write_file')).toBe(true)
    })

    tabsStore.saveEditorState(tab.id, { markdown: '# After' })
    tabsStore.setModified(tab.id, true)
    write.resolve(101)

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
    const firstWrite = deferred<number>()
    let writeCount = 0
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'get_file_modified_time') return 100
      if (command === 'write_file') {
        writeCount += 1
        if (writeCount === 1) return firstWrite.promise
        return 100
      }
      return undefined
    })

    const firstSave = autoSaveStore.saveTab(firstTab.id)
    const secondSave = autoSaveStore.saveTab(secondTab.id)
    await vi.waitFor(() => expect(writeCount).toBe(1))
    expect(writeCount).toBe(1)

    firstWrite.resolve(100)
    await Promise.all([firstSave, secondSave])
    expect(writeCount).toBe(2)
  })

  it('flushes a queued tab again when its save lane reaches the write boundary', async () => {
    const tabsStore = useTabsStore()
    const autoSaveStore = useAutoSaveStore()
    disableAutoSave()

    const firstTab = tabsStore.createTab('/tmp/first.md', '# First')
    const secondTab = tabsStore.createTab('/tmp/second.md', '# Second')
    tabsStore.setModified(firstTab.id, true)
    tabsStore.setModified(secondTab.id, true)
    const firstWrite = deferred<number>()
    const writes: Array<{ path: string; content: string }> = []
    let writeCount = 0
    let queuedEditReady = false
    const capture = () => {
      if (queuedEditReady) {
        tabsStore.saveEditorState(secondTab.id, { markdown: '# Second latest' })
        tabsStore.setModified(secondTab.id, true)
      }
    }
    window.addEventListener('gdown:capture-state', capture)
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'get_file_modified_time') return 100
      if (command === 'write_file') {
        writes.push(args as { path: string; content: string })
        writeCount += 1
        if (writeCount === 1) return firstWrite.promise
        return 100
      }
      return undefined
    })

    try {
      const firstSave = autoSaveStore.saveTab(firstTab.id)
      const secondSave = autoSaveStore.saveTab(secondTab.id)
      await vi.waitFor(() => expect(writeCount).toBe(1))

      // Model a rich edit after the queued save's initial capture. The
      // mounted Editor's capture listener publishes it at performSave().
      queuedEditReady = true
      tabsStore.markContentChanged(secondTab.id)
      tabsStore.setModified(secondTab.id, true)
      firstWrite.resolve(100)

      await Promise.all([firstSave, secondSave])
    } finally {
      window.removeEventListener('gdown:capture-state', capture)
    }

    expect(writes).toEqual([
      { path: '/tmp/first.md', content: '# First' },
      { path: '/tmp/second.md', content: '# Second latest' },
    ])
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
        return modifiedTime
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
    const write = deferred<number>()
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
    write.resolve(modifiedTime)
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
      if (command === 'write_file') {
        writeCount += 1
        return 100
      }
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

  describe('modified-time baseline', () => {
    function mockDisk(initialTime: number) {
      const disk = { time: initialTime, content: '# External', writes: 0, reads: 0 }
      mockedInvoke.mockImplementation(async (command) => {
        if (command === 'get_file_modified_time') return disk.time
        if (command === 'read_file') {
          disk.reads += 1
          return disk.content
        }
        if (command === 'write_file') {
          disk.writes += 1
          disk.time += 10
          return disk.time
        }
        return undefined
      })
      return disk
    }

    it('trusts the mtime write_file returns, so a write right after ours is detected', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      disableAutoSave()
      const tab = tabsStore.createTab('/tmp/note.md', '# Local')
      tabsStore.setModified(tab.id, true)
      const disk = { time: 100, content: '# External' }
      mockedInvoke.mockImplementation(async (command) => {
        if (command === 'get_file_modified_time') return disk.time
        if (command === 'read_file') return disk.content
        if (command === 'write_file') {
          // Another tool writes the file before Leaf can stat it.
          disk.time = 160
          return 150
        }
        return undefined
      })

      await expect(autoSaveStore.saveTab(tab.id)).resolves.toBe(true)
      expect(autoSaveStore.knownModifiedTimes['/tmp/note.md']).toBe(150)

      await autoSaveStore.checkForExternalChanges()
      expect(tabsStore.tabs[0]?.editorState.markdown).toBe('# External')
      expect(autoSaveStore.knownModifiedTimes['/tmp/note.md']).toBe(160)
    })

    it('never re-reads an open file without the open-size limit', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      disableAutoSave()
      const clean = tabsStore.createTab('/tmp/clean.md', '# Clean')
      const dirty = tabsStore.createTab('/tmp/dirty.md', '# Dirty')
      tabsStore.setModified(dirty.id, true)
      autoSaveStore.knownModifiedTimes['/tmp/clean.md'] = 100
      autoSaveStore.knownModifiedTimes['/tmp/dirty.md'] = 100
      const reads: unknown[] = []
      mockedInvoke.mockImplementation(async (command, args) => {
        if (command === 'get_file_modified_time') return 200
        if (command === 'read_file') {
          reads.push(args)
          // A file that outgrew the limit while open is refused, not loaded.
          throw "'x' is too large to open (900.0 MB; Leaf opens text files up to 4.0 MB)."
        }
        return undefined
      })

      // External-change scan (clean tab) and the pre-save conflict check (dirty tab).
      await autoSaveStore.checkForExternalChanges()
      await expect(autoSaveStore.saveTab(dirty.id)).resolves.toBe(false)

      expect(reads).toEqual([
        { path: '/tmp/clean.md', maxBytes: MAX_OPEN_BYTES },
        { path: '/tmp/dirty.md', maxBytes: MAX_OPEN_BYTES },
        { path: '/tmp/dirty.md', maxBytes: MAX_OPEN_BYTES },
      ])
      expect(clean.editorState.markdown).toBe('# Clean')
      expect(dirty.editorState.markdown).toBe('# Dirty')
      // The blocked save names the real reason.
      expect(autoSaveStore.saveNotification?.message).toBe(
        "Could not verify /tmp/dirty.md ('x' is too large to open (900.0 MB; Leaf opens text files up to 4.0 MB).); use Save As to choose a destination.",
      )
    })

    // The copy on screen is stale and still marked saved; that must not be silent.
    it('says once per disk revision that a changed file could not be reloaded', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      disableAutoSave()
      const tab = tabsStore.createTab('/tmp/grown.csv', 'a,b\n')
      autoSaveStore.knownModifiedTimes['/tmp/grown.csv'] = 100
      let modifiedTime = 200
      const tooLarge =
        "'grown.csv' is too large to open (9.0 MB; Leaf opens text files up to 4.0 MB)."
      mockedInvoke.mockImplementation(async (command) => {
        if (command === 'get_file_modified_time') return modifiedTime
        if (command === 'read_file') throw tooLarge
        return undefined
      })
      const stale = {
        message: `grown.csv changed on disk and could not be reloaded: ${tooLarge}`,
        type: 'error',
      }

      await autoSaveStore.checkForExternalChanges()
      expect(autoSaveStore.saveNotification).toEqual(stale)
      expect(tab.editorState.markdown).toBe('a,b\n')

      // The same revision is not announced again on later scans.
      autoSaveStore.saveNotification = null
      await autoSaveStore.checkForExternalChanges()
      expect(autoSaveStore.saveNotification).toBeNull()

      // A newer revision that still cannot be read is.
      modifiedTime = 300
      await autoSaveStore.checkForExternalChanges()
      expect(autoSaveStore.saveNotification).toEqual(stale)
    })

    it('stays quiet when a watched file has simply gone away', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      disableAutoSave()
      tabsStore.createTab('/tmp/gone.md', '# Gone')
      autoSaveStore.knownModifiedTimes['/tmp/gone.md'] = 100
      mockedInvoke.mockImplementation(async (command) => {
        if (command === 'get_file_modified_time') throw 'No such file or directory'
        return undefined
      })

      await autoSaveStore.checkForExternalChanges()

      expect(autoSaveStore.saveNotification).toBeNull()
    })

    it('decides a reloaded document the way opening it does: front matter counts', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      disableAutoSave()
      const tab = tabsStore.createTab('/tmp/notes.md', 'short')
      autoSaveStore.knownModifiedTimes['/tmp/notes.md'] = 100
      const disk = mockDisk(200)
      // The body alone is at the limit; front matter takes the document over it.
      disk.content = `---\ntitle: ${'t'.repeat(1000)}\n---\n${'x'.repeat(MAX_RICH_CHARS)}`

      await autoSaveStore.checkForExternalChanges()
      expect(tab.sourceOnly).toBe('too-large')
      expect(autoSaveStore.serializeTabToFile(tab)).toBe(disk.content)

      // Opening the same content gives the same answer.
      const opened = await tabsStore.openFile('/tmp/notes-copy.md')
      expect(opened?.sourceOnly).toBe('too-large')
    })

    it('reloads a plain-text file that starts with --- without treating it as front matter', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      disableAutoSave()
      const tab = tabsStore.createTab('/tmp/k8s.yaml', 'a: 0\n')
      autoSaveStore.knownModifiedTimes['/tmp/k8s.yaml'] = 100
      const disk = mockDisk(200)
      disk.content = '---\na: 1\n---\n\nb: 2\n'

      await autoSaveStore.checkForExternalChanges()

      expect(tab.editorState.frontmatter).toBeNull()
      expect(tab.editorState.markdown).toBe(disk.content)
      expect(autoSaveStore.serializeTabToFile(tab)).toBe(disk.content)
    })

    it('makes a tab source-only when its file outgrows the rich editor on disk', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      disableAutoSave()
      const tab = tabsStore.createTab('/tmp/log.txt', 'short')
      autoSaveStore.knownModifiedTimes['/tmp/log.txt'] = 100
      const disk = mockDisk(200)
      disk.content = 'x'.repeat(MAX_RICH_CHARS + 1)

      await autoSaveStore.checkForExternalChanges()
      expect(tab.editorState.markdown).toBe(disk.content)
      expect(tab.sourceOnly).toBe('too-large')

      // And rich editing comes back when it shrinks again.
      disk.time = 300
      disk.content = 'short again'
      await autoSaveStore.checkForExternalChanges()
      expect(tab.sourceOnly).toBeNull()
    })

    it('reloads a clean tab when the disk mtime moves backwards', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      tabsStore.createTab('/tmp/note.md', '# Local')
      autoSaveStore.knownModifiedTimes['/tmp/note.md'] = 200
      const disk = mockDisk(100) // git checkout / rsync -t restore an older mtime

      await autoSaveStore.checkForExternalChanges()

      expect(disk.reads).toBe(1)
      expect(tabsStore.tabs[0]?.editorState.markdown).toBe('# External')
    })

    it('raises a conflict before saving over a file whose mtime moved backwards', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      disableAutoSave()
      const tab = tabsStore.createTab('/tmp/note.md', '# Local')
      tabsStore.setModified(tab.id, true)
      autoSaveStore.knownModifiedTimes['/tmp/note.md'] = 200
      const disk = mockDisk(100)

      const save = autoSaveStore.saveTab(tab.id)
      await vi.waitFor(() => expect(autoSaveStore.conflictDialog).not.toBeNull())
      expect(disk.writes).toBe(0)
      autoSaveStore.resolveConflict('cancel')
      await expect(save).resolves.toBe(false)
    })

    it('never treats its own consecutive saves as an external change', async () => {
      const tabsStore = useTabsStore()
      const autoSaveStore = useAutoSaveStore()
      disableAutoSave()
      const tab = tabsStore.createTab('/tmp/note.md', '# One')
      tabsStore.setModified(tab.id, true)
      const disk = mockDisk(100)

      await expect(autoSaveStore.saveTab(tab.id)).resolves.toBe(true)
      await autoSaveStore.checkForExternalChanges()
      tabsStore.saveEditorState(tab.id, { markdown: '# Two' })
      tabsStore.setModified(tab.id, true)
      await expect(autoSaveStore.saveTab(tab.id)).resolves.toBe(true)
      await autoSaveStore.checkForExternalChanges()

      expect(disk.writes).toBe(2)
      expect(disk.reads).toBe(0)
      expect(autoSaveStore.conflictDialog).toBeNull()
      expect(tabsStore.tabs[0]?.editorState.markdown).toBe('# Two')
    })
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
