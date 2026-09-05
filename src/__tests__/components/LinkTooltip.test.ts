import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, onBeforeUnmount } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import LinkTooltip from '../../components/LinkTooltip.vue'

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}))

describe('LinkTooltip', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('cleans up after its TipTap editor is destroyed by the parent', async () => {
    const Harness = defineComponent({
      setup() {
        const editor = new Editor({
          extensions: [StarterKit],
          content: '<p>Draft</p>',
        })

        onBeforeUnmount(() => editor.destroy())

        return () => h('div', [h(EditorContent, { editor }), h(LinkTooltip, { editor })])
      },
    })

    const wrapper = mount(Harness)
    await Promise.resolve()

    expect(() => wrapper.unmount()).not.toThrow()
  })
})
