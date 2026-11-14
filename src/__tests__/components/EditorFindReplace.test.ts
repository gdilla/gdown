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
