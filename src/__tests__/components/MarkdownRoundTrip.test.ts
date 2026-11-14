import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { Editor as TiptapEditor } from '@tiptap/core'
import Editor from '../../components/Editor.vue'
import { useTabsStore } from '../../stores/tabs'
import { serializeTabToFile } from '../../stores/autoSave'
import { markdownToHtml } from '../../utils/markdownConverter'
import { convertFileSrc } from '@tauri-apps/api/core'
import claudeMd from '../../../CLAUDE.md?raw'
import readmeMd from '../../../README.md?raw'

const fixtures = import.meta.glob<string>('../fixtures/roundtrip/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const DOC_PATH = '/Users/me/notes/doc.md'

/**
 * Load markdown into the real Editor component, type and delete one character
 * (letting the coalesced snapshot run after each), and return what the app
 * would write to disk.
 */
async function roundTrip(markdown: string): Promise<string> {
  setActivePinia(createPinia())
  const tabsStore = useTabsStore()
  const tab = tabsStore.createTab(DOC_PATH, markdown)
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

  const editor = (
    wrapper.vm as unknown as { getEditor: () => TiptapEditor | undefined }
  ).getEditor()
  if (!editor) throw new Error('editor did not mount')
  let pos = -1
  editor.state.doc.descendants((node, nodePos) => {
    if (pos === -1 && node.isTextblock) pos = nodePos + 1
    return pos === -1
  })
  // Tiptap skips update events for no-op transactions, so type and then undo
  // the character as two real edits, each settling its own snapshot.
  editor.view.dispatch(editor.state.tr.insertText('x', pos))
  vi.advanceTimersByTime(200)
  editor.view.dispatch(editor.state.tr.delete(pos, pos + 1))
  vi.advanceTimersByTime(200)
  // Proves captureState() really serialized the rich document.
  expect(tab.editorState.doc).not.toBeNull()

  const saved = serializeTabToFile(tab)
  wrapper.unmount()
  wrapper = undefined
  return saved
}

let wrapper: VueWrapper | undefined

async function mountEditor(): Promise<TiptapEditor> {
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
  const editor = (
    wrapper.vm as unknown as { getEditor: () => TiptapEditor | undefined }
  ).getEditor()
  if (!editor) throw new Error('editor did not mount')
  return editor
}

describe('WYSIWYG markdown round-trip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  const names = Object.keys(fixtures).sort()

  it('has fixtures', () => {
    expect(names.length).toBeGreaterThanOrEqual(8)
  })

  for (const name of names) {
    it(`round-trips ${name.split('/').pop()} byte-for-byte`, async () => {
      const source = fixtures[name]!
      expect(await roundTrip(source)).toBe(source)
    })
  }

  it('serializes lists, tasks, math and autolinks created in WYSIWYG', async () => {
    setActivePinia(createPinia())
    const tab = useTabsStore().createTab(DOC_PATH, '')
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
    const editor = (
      wrapper.vm as unknown as { getEditor: () => TiptapEditor | undefined }
    ).getEditor()!
    const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
    const item = (type: string, text: string, attrs = {}) => ({
      type,
      attrs,
      content: [paragraph(text)],
    })
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            item('taskItem', 'todo', { checked: false }),
            item('taskItem', 'done', { checked: true }),
          ],
        },
        paragraph('then'),
        { type: 'bulletList', content: [item('listItem', 'a'), item('listItem', 'b')] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'see ' },
            { type: 'mathInline', attrs: { latex: 'x^2' } },
            { type: 'text', text: ' and ' },
            {
              type: 'text',
              text: 'CLAUDE.md',
              marks: [{ type: 'link', attrs: { href: 'http://CLAUDE.md' } }],
            },
          ],
        },
      ],
    })
    vi.advanceTimersByTime(200)

    expect(serializeTabToFile(tab)).toBe(
      '- [ ] todo\n- [x] done\n\nthen\n\n- a\n- b\n\nsee $x^2$ and [CLAUDE.md](http://CLAUDE.md)\n',
    )
  })

  it('serializes images inserted in WYSIWYG so they reload with the same alt and path', async () => {
    setActivePinia(createPinia())
    const tab = useTabsStore().createTab(DOC_PATH, '')
    const editor = await mountEditor()
    const image = (name: string, alt: string) => ({
      type: 'image',
      attrs: { src: convertFileSrc(`/Users/me/notes/${name}`), alt },
    })
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            image('scan].png', 'scan]'),
            { type: 'text', text: ' ' },
            image('a).png', 'a)'),
            { type: 'text', text: ' ' },
            image('assets/x.png', 'x'),
          ],
        },
      ],
    })
    vi.advanceTimersByTime(200)

    const saved = serializeTabToFile(tab)
    expect(saved).toBe('![scan\\]](scan%5D.png) ![a)](<a).png>) ![x](assets/x.png)\n')
    const template = document.createElement('template')
    template.innerHTML = markdownToHtml(saved)
    expect(
      Array.from(template.content.querySelectorAll('img'), (img) => [
        img.getAttribute('alt'),
        decodeURI(img.getAttribute('src') ?? ''),
      ]),
    ).toEqual([
      ['scan]', 'scan].png'],
      ['a)', 'a).png'],
      ['x', 'assets/x.png'],
    ])
  })

  for (const [name, source] of [
    ['CLAUDE.md', claudeMd],
    ['README.md', readmeMd],
  ] as const) {
    it(`is idempotent on the repo ${name}`, async () => {
      const first = await roundTrip(source)
      const second = await roundTrip(first)
      expect(second).toBe(first)
    })
  }
})
