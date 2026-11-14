import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { Editor as TiptapEditor } from '@tiptap/core'
import Editor from '../../components/Editor.vue'
import { htmlToMarkdown, markdownToHtml } from '../../utils/markdownConverter'

/** Small deterministic PRNG so failures reproduce. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Pieces chosen to collide with markdown syntax: brackets, parens, dollars,
// emphasis, headings, setext/thematic lines, quotes, tables, escapes, code.
const PIECES = [
  'a',
  'word',
  'x_y',
  '[',
  ']',
  '(',
  ')',
  '[t](u)',
  '$',
  '$x$',
  '$5',
  '*',
  '**',
  '_',
  '#',
  '=',
  '===',
  '-',
  '---',
  '>',
  '|',
  '\\',
  '`',
  '``',
  '1.',
  '2)',
  '~~',
  '<',
  '!',
  '[ ]',
  '[x]',
  ' https://e.com ',
  'e.com',
]
const PREFIXES = ['', '', '- ', '1. ', '> ', '# ', '- [ ] ']

function sample(random: () => number): string {
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!
  const blocks = Array.from({ length: 1 + Math.floor(random() * 3) }, () => {
    const words = Array.from({ length: 1 + Math.floor(random() * 7) }, () => pick(PIECES))
    return pick(PREFIXES) + words.join(random() < 0.6 ? ' ' : '')
  })
  return blocks.join('\n\n')
}

describe('markdown round-trip sweep', () => {
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('loads save(load(x)) as the same document as load(x) for generated input', async () => {
    setActivePinia(createPinia())
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
    const load = (markdown: string) => {
      editor.commands.setContent(markdownToHtml(markdown), { emitUpdate: false })
      return editor.getHTML()
    }
    // A list whose items each hold one block has no markdown spelling for
    // "loose", so tightness is only compared where blank lines can carry it.
    const structure = (source: string) => {
      const template = document.createElement('template')
      template.innerHTML = source
      for (const list of template.content.querySelectorAll('[data-tight]')) {
        const items = Array.from(list.children)
        if (
          items.every((item) => item.querySelectorAll(':scope > p, :scope > div > p').length <= 1)
        ) {
          list.removeAttribute('data-tight')
        }
      }
      // An unclosed fence at the end of a file has no final newline; once
      // written with its closing fence it gains one. Markdown cannot say otherwise.
      // Emphasis on the spaces next to it is written outside the delimiters
      // (`*a* b`), which renders the same; compare marks without edge spaces.
      let html = template.innerHTML.replace(/\n<\/code><\/pre>/g, '</code></pre>')
      for (let previous = ''; previous !== html; ) {
        previous = html
        html = html
          .replace(/<(em|strong)>(\s+)/g, '$2<$1>')
          .replace(/(\s+)<\/(em|strong)>/g, '</$2>$1')
          .replace(/<\/(em|strong)>(\s*)<\1>/g, '$2')
          .replace(/<(em|strong)><\/\1>/g, '')
      }
      return html
    }

    const random = mulberry32(Number(import.meta.env.VITE_SWEEP_SEED ?? 20261114))
    const failures: string[] = []
    for (let i = 0; i < Number(import.meta.env.VITE_SWEEP_SAMPLES ?? 400); i++) {
      const source = sample(random)
      const first = load(source)
      const saved = htmlToMarkdown(first)
      const second = load(saved)
      if (structure(second) !== structure(first)) {
        failures.push(
          `${JSON.stringify(source)}\n  saved ${JSON.stringify(saved)}\n  ${first}\n  ${second}`,
        )
      }
    }
    expect(failures.slice(0, 15).join('\n')).toBe('')
  }, 60_000)
})
