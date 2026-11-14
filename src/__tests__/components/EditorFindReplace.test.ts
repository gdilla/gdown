import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { Editor as TiptapEditor } from '@tiptap/core'
import Editor from '../../components/Editor.vue'
import FindReplace from '../../components/FindReplace.vue'
import { useTabsStore } from '../../stores/tabs'
import { useFindReplaceStore } from '../../stores/findReplace'

describe('Editor find/replace store sync', () => {
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

  async function mountEditor() {
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
    const richEditor = (wrapper.vm as unknown as { getEditor: () => TiptapEditor }).getEditor()
    const panel = wrapper.findComponent(FindReplace)
    return { richEditor, panel }
  }

  it('updates the match count when the document is edited with the panel open', async () => {
    const tabsStore = useTabsStore()
    tabsStore.createTab(null, 'foo bar foo')
    const store = useFindReplaceStore()
    const { richEditor, panel } = await mountEditor()

    panel.vm.$emit('search', 'foo', false, false)
    expect(store.matchCount).toBe(2)

    richEditor.commands.insertContentAt(1, 'foo ')
    expect(store.matchCount).toBe(3)
    expect(store.currentMatchIndex).toBe(1)
  })

  it('a search arriving while the editor has focus does not move the caret', async () => {
    const tabsStore = useTabsStore()
    tabsStore.createTab(null, 'foo bar foo tail')
    const { richEditor, panel } = await mountEditor()

    // The user clicked at the end of the document before the debounced search fired.
    const end = richEditor.state.doc.content.size - 1
    richEditor.commands.setTextSelection(end)
    vi.spyOn(richEditor.view, 'hasFocus').mockReturnValue(true)
    panel.vm.$emit('search', 'foo', false, false)
    richEditor.commands.insertContent('!')

    expect(richEditor.getText()).toBe('foo bar foo tail!')
    expect(useFindReplaceStore().matchCount).toBe(2)
  })

  it('a search from the focused panel still selects the first match', async () => {
    const tabsStore = useTabsStore()
    tabsStore.createTab(null, 'x foo')
    const { richEditor, panel } = await mountEditor()

    vi.spyOn(richEditor.view, 'hasFocus').mockReturnValue(false)
    panel.vm.$emit('search', 'foo', false, false)

    const { from, to } = richEditor.state.selection
    expect(richEditor.state.doc.textBetween(from, to)).toBe('foo')
  })

  it('updates the match count when switching tabs with the panel open', async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab(null, 'foo foo foo')
    const second = tabsStore.createTab(null, 'foo')
    tabsStore.setActiveTab(first.id)
    const store = useFindReplaceStore()
    const { panel } = await mountEditor()

    panel.vm.$emit('search', 'foo', false, false)
    expect(store.matchCount).toBe(3)

    tabsStore.setActiveTab(second.id)
    await nextTick()
    expect(store.matchCount).toBe(1)
    expect(store.currentMatchIndex).toBe(0)
  })
})
