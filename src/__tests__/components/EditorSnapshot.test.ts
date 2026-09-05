import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import Editor from '../../components/Editor.vue'
import { invoke } from '@tauri-apps/api/core'
import { useTabsStore } from '../../stores/tabs'
import { useEditorModeStore } from '../../stores/editorMode'

const mockedInvoke = vi.mocked(invoke)

describe('Editor rich snapshot boundaries', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  it('keeps a typed edit out of markdown serialization until the burst settles', async () => {
    const tabsStore = useTabsStore()
    const tab = tabsStore.createTab(null, '# Before')
    wrapper = mount(Editor, {
      global: {
        stubs: {
          EditorContent: { template: '<div />' },
          LinkTooltip: true,
          InsertLinkDialog: true,
          FindReplace: true,
        },
      },
    })
    await nextTick()

    const richEditor = (wrapper.vm as { getEditor: () => any }).getEditor()
    expect(richEditor).toBeTruthy()
    richEditor.commands.setContent('<p>Latest</p>')

    expect(tab.isModified).toBe(true)
    expect(tab.contentRevision).toBe(1)
    expect(tab.editorState.markdown).toBe('# Before')

    vi.advanceTimersByTime(199)
    expect(tab.editorState.markdown).toBe('# Before')
    vi.advanceTimersByTime(1)
    expect(tab.editorState.markdown).toBe('Latest')
  })

  it('flushes the outgoing rich snapshot before a tab switch', async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab(null, '# First')
    const second = tabsStore.createTab(null, '# Second')
    tabsStore.setActiveTab(first.id)
    wrapper = mount(Editor, {
      global: {
        stubs: {
          EditorContent: { template: '<div />' },
          LinkTooltip: true,
          InsertLinkDialog: true,
          FindReplace: true,
        },
      },
    })
    await nextTick()

    const richEditor = (wrapper.vm as { getEditor: () => any }).getEditor()
    richEditor.commands.setContent('<p>First latest</p>')
    tabsStore.setActiveTab(second.id)
    await nextTick()

    expect(first.editorState.markdown).toBe('First latest')
    expect(tabsStore.activeTabId).toBe(second.id)
  })

  it('flushes the pending snapshot before the WYSIWYG to source handoff', async () => {
    const tabsStore = useTabsStore()
    const modeStore = useEditorModeStore()
    const tab = tabsStore.createTab(null, '# Before')
    wrapper = mount(Editor, {
      global: {
        stubs: {
          EditorContent: { template: '<div />' },
          LinkTooltip: true,
          InsertLinkDialog: true,
          FindReplace: true,
        },
      },
    })
    await nextTick()

    const richEditor = (wrapper.vm as { getEditor: () => any }).getEditor()
    richEditor.commands.setContent('<p>Mode latest</p>')
    window.dispatchEvent(new Event('gdown:toggle-mode'))

    expect(modeStore.isWysiwyg).toBe(false)
    expect(tab.editorState.markdown).toBe('Mode latest')
    expect(tab.editorState.doc).toBeNull()
  })

  it('flushes the pending snapshot before saving a tab during close', async () => {
    const tabsStore = useTabsStore()
    const tab = tabsStore.createTab('/tmp/close.md', '# Before')
    tabsStore.setCloseDecisionHandler(async () => 'save')
    wrapper = mount(Editor, {
      global: {
        stubs: {
          EditorContent: { template: '<div />' },
          LinkTooltip: true,
          InsertLinkDialog: true,
          FindReplace: true,
        },
      },
    })
    await nextTick()

    const richEditor = (wrapper.vm as { getEditor: () => any }).getEditor()
    richEditor.commands.setContent('<p>Close latest</p>')
    mockedInvoke
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(101)

    await expect(tabsStore.closeTab(tab.id)).resolves.toBe(true)

    expect(tabsStore.tabs).toHaveLength(0)
    expect(mockedInvoke).toHaveBeenCalledWith('write_file', {
      path: '/tmp/close.md',
      content: 'Close latest',
    })
  })
})
