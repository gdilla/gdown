import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { Editor as TiptapEditor } from '@tiptap/core'
import Editor from '../../components/Editor.vue'
import { useTabsStore } from '../../stores/tabs'
import { useFocusModeStore } from '../../stores/focusMode'
import { focusModePluginKey } from '../../extensions/FocusMode'

function mountEditor(): VueWrapper {
  return mount(Editor, {
    global: {
      stubs: {
        LinkTooltip: true,
        InsertLinkDialog: true,
        FindReplace: true,
      },
    },
  })
}

function richEditorOf(wrapper: VueWrapper): TiptapEditor {
  const richEditor = (wrapper.vm as unknown as { getEditor: () => TiptapEditor }).getEditor()
  // EditorContent is rendered for real so history runs against a mounted EditorView.
  if (richEditor.isDestroyed) throw new Error('TipTap view not mounted')
  return richEditor
}

describe('Editor undo history boundaries', () => {
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

  it('cannot undo the mount-time load of a freshly opened file', async () => {
    const tabsStore = useTabsStore()
    const tab = tabsStore.createTab('/tmp/a.md', '# Alpha')
    wrapper = mountEditor()
    await nextTick()
    const richEditor = richEditorOf(wrapper)

    expect(richEditor.can().undo()).toBe(false)
    richEditor.commands.undo()
    vi.advanceTimersByTime(200)

    expect(richEditor.getText().trim()).toBe('Alpha')
    expect(tab.isModified).toBe(false)
    expect(tab.editorState.markdown.trimEnd()).toBe('# Alpha')
  })

  it('cannot undo a tab switch into an empty document', async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab('/tmp/a.md', '# Alpha')
    const second = tabsStore.createTab('/tmp/b.md', '# Beta')
    tabsStore.setActiveTab(first.id)
    wrapper = mountEditor()
    await nextTick()
    const richEditor = richEditorOf(wrapper)

    tabsStore.setActiveTab(second.id)
    await nextTick()
    expect(richEditor.can().undo()).toBe(false)
    richEditor.commands.undo()
    vi.advanceTimersByTime(200)

    expect(richEditor.getText().trim()).toBe('Beta')
    expect(second.isModified).toBe(false)
    expect(second.editorState.markdown.trimEnd()).toBe('# Beta')
  })

  it("does not replay the previous tab's whole-document edit into the new tab", async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab('/tmp/a.md', '# Alpha')
    const second = tabsStore.createTab('/tmp/b.md', '# Beta')
    tabsStore.setActiveTab(first.id)
    wrapper = mountEditor()
    await nextTick()
    const richEditor = richEditorOf(wrapper)

    // Select-all replacement spans the whole document, so its undo step survives
    // a mapping through a later whole-document replacement.
    richEditor.chain().selectAll().insertContent('<p>Alpha edited</p>').run()
    tabsStore.setActiveTab(second.id)
    await nextTick()
    richEditor.commands.undo()
    vi.advanceTimersByTime(200)

    expect(richEditor.getText().trim()).toBe('Beta')
    expect(second.isModified).toBe(false)
    expect(second.editorState.markdown.trimEnd()).toBe('# Beta')
    expect(first.editorState.markdown.trimEnd()).toBe('Alpha edited')
  })

  it('cannot undo an external file reload', async () => {
    const tabsStore = useTabsStore()
    const tab = tabsStore.createTab('/tmp/a.md', '# Alpha')
    wrapper = mountEditor()
    await nextTick()
    const richEditor = richEditorOf(wrapper)

    richEditor.commands.insertContent('typed ')
    vi.advanceTimersByTime(200)
    // autoSave applies disk content to the tab before notifying the editor.
    tabsStore.saveEditorState(tab.id, { markdown: '# From disk', doc: null })
    tabsStore.setModified(tab.id, false)
    window.dispatchEvent(
      new CustomEvent('gdown:file-reloaded', {
        detail: { tabId: tab.id, markdown: '# From disk' },
      }),
    )

    expect(richEditor.can().undo()).toBe(false)
    richEditor.commands.undo()
    vi.advanceTimersByTime(200)

    expect(richEditor.getText().trim()).toBe('From disk')
    expect(tab.isModified).toBe(false)
    expect(tab.editorState.markdown.trimEnd()).toBe('# From disk')
  })

  it('keeps other editor plugin state when the undo history is reset', async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab('/tmp/a.md', '# Alpha')
    const second = tabsStore.createTab('/tmp/b.md', '# Beta')
    tabsStore.setActiveTab(first.id)
    wrapper = mountEditor()
    await nextTick()
    const richEditor = richEditorOf(wrapper)

    useFocusModeStore().setEnabled(true)
    await nextTick()
    tabsStore.setActiveTab(second.id)
    await nextTick()

    expect(focusModePluginKey.getState(richEditor.state)?.enabled).toBe(true)
  })

  it('still undoes and redoes user edits made after a load', async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab('/tmp/a.md', '# Alpha')
    const second = tabsStore.createTab('/tmp/b.md', '# Beta')
    tabsStore.setActiveTab(first.id)
    wrapper = mountEditor()
    await nextTick()
    const richEditor = richEditorOf(wrapper)

    tabsStore.setActiveTab(second.id)
    await nextTick()
    richEditor.commands.insertContentAt(5, ' two')
    expect(richEditor.getText().trim()).toBe('Beta two')

    expect(richEditor.commands.undo()).toBe(true)
    expect(richEditor.getText().trim()).toBe('Beta')
    expect(richEditor.can().undo()).toBe(false)

    expect(richEditor.commands.redo()).toBe(true)
    expect(richEditor.getText().trim()).toBe('Beta two')
    vi.advanceTimersByTime(200)
    expect(second.editorState.markdown.trimEnd()).toBe('# Beta two')
  })
})
