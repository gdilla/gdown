import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { EditorView } from '@codemirror/view'
import { redo, undo, undoDepth } from '@codemirror/commands'
import SourceEditor from '../../components/source/SourceEditor.vue'
import { useTabsStore } from '../../stores/tabs'
import { useEditorModeStore } from '../../stores/editorMode'

function viewOf(wrapper: VueWrapper): EditorView {
  const view = EditorView.findFromDOM(wrapper.find('.cm-editor').element as HTMLElement)
  if (!view) throw new Error('CodeMirror view not mounted')
  return view
}

function type(view: EditorView, from: number, to: number, insert: string): void {
  view.dispatch({ changes: { from, to, insert }, userEvent: 'input.type' })
}

describe('SourceEditor undo history boundaries', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    setActivePinia(createPinia())
    useEditorModeStore().setMode('source')
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('cannot undo a tab switch into the previous tab content', async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab('/tmp/a.md', '# Alpha')
    const second = tabsStore.createTab('/tmp/b.md', '# Beta')
    tabsStore.setActiveTab(first.id)
    wrapper = mount(SourceEditor)
    const view = viewOf(wrapper)
    expect(undoDepth(view.state)).toBe(0)

    tabsStore.setActiveTab(second.id)
    await flushPromises()
    expect(view.state.doc.toString()).toBe('# Beta')
    undo(view)

    expect(view.state.doc.toString()).toBe('# Beta')
    expect(second.isModified).toBe(false)
    expect(second.editorState.markdown).toBe('# Beta')
  })

  it("does not replay the previous tab's edits into the new tab", async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab('/tmp/a.md', '# Alpha')
    const second = tabsStore.createTab('/tmp/b.md', '# Beta')
    tabsStore.setActiveTab(first.id)
    wrapper = mount(SourceEditor)
    const view = viewOf(wrapper)

    // Undoing a deletion re-inserts text, and insertions survive mapping
    // through a later whole-document replacement.
    type(view, 2, 7, '')
    tabsStore.setActiveTab(second.id)
    await flushPromises()
    undo(view)

    expect(view.state.doc.toString()).toBe('# Beta')
    expect(second.isModified).toBe(false)
    expect(second.editorState.markdown).toBe('# Beta')
    expect(first.editorState.markdown).toBe('# ')
  })

  it('cannot undo an external file reload', async () => {
    const tabsStore = useTabsStore()
    const tab = tabsStore.createTab('/tmp/a.md', '# Alpha')
    wrapper = mount(SourceEditor)
    const view = viewOf(wrapper)

    type(view, 7, 7, ' typed')
    // autoSave applies disk content to the tab before notifying the editor.
    tabsStore.saveEditorState(tab.id, { markdown: '# From disk', doc: null })
    tabsStore.setModified(tab.id, false)
    window.dispatchEvent(
      new CustomEvent('gdown:file-reloaded', {
        detail: { tabId: tab.id, markdown: '# From disk' },
      }),
    )
    await flushPromises()
    undo(view)

    expect(view.state.doc.toString()).toBe('# From disk')
    expect(tab.isModified).toBe(false)
    expect(tab.editorState.markdown).toBe('# From disk')
  })

  it('still undoes and redoes user edits made after a load', async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab('/tmp/a.md', '# Alpha')
    const second = tabsStore.createTab('/tmp/b.md', '# Beta')
    tabsStore.setActiveTab(first.id)
    wrapper = mount(SourceEditor)
    const view = viewOf(wrapper)

    tabsStore.setActiveTab(second.id)
    await flushPromises()
    type(view, 6, 6, ' two')

    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('# Beta')
    expect(undoDepth(view.state)).toBe(0)
    expect(redo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('# Beta two')
    expect(second.editorState.markdown).toBe('# Beta two')
  })
})
