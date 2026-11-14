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

// Inline pieces chosen to collide with markdown syntax: brackets, parens,
// dollars, emphasis, heading/setext/thematic markers, quotes, table pipes,
// escapes, code, links (inline, reference, auto), images, entities, hard
// breaks and unusual Unicode (private use, zero-width, BOM, line/paragraph
// separators, astral).
const INLINE = [
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
  '[X]',
  ' https://e.com ',
  'e.com',
  '<https://e.com/a>',
  '<me@e.com>',
  '[t][r]',
  '[r]',
  '[x][]',
  '![a $x$](i.png)',
  '![b [c]](i.png)',
  '![`c` d](i.png)',
  '![*e* f](<my i.png>)',
  '![p](a(1).png)',
  '![q](<a).png>)',
  '![r\\]](s%5D.png)',
  '&amp;',
  '&#36;',
  '&#x5B;',
  '&nbsp;',
  '&copy;',
  '&lt;b&gt;',
  '',
  '',
  '',
  '',
  '‍',
  '​',
  '﻿',
  ' ',
  ' ',
  '\u{1F600}',
  '  \nnext',
  '\\\nnext',
]
const PUNCTUATION = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'

function sample(random: () => number): string {
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!
  const inline = (max = 7) =>
    Array.from({ length: 1 + Math.floor(random() * max) }, () =>
      random() < 0.1 ? `\\${pick([...PUNCTUATION])}` : pick(INLINE),
    ).join(random() < 0.6 ? ' ' : '')
  const oneLine = () => inline(4).replace(/\n/g, ' ')
  const BLOCKS: Array<() => string> = [
    () => inline(),
    () => `${'#'.repeat(1 + Math.floor(random() * 3))} ${oneLine()}`,
    () => {
      const marker = pick(['- ', '* ', '1. ', '- [ ] ', '- [x] ', '- [X] '])
      return Array.from({ length: 1 + Math.floor(random() * 3) }, () => marker + oneLine()).join(
        random() < 0.7 ? '\n' : '\n\n',
      )
    },
    () => `${pick(['> ', '> > ', '> - '])}${inline()}`,
    () => `\`\`\`${pick(['', 'js', 'x_y'])}\n${oneLine()}\n${oneLine()}\n\`\`\``,
    () => `$$\n${oneLine()}\n$$`,
    () =>
      `| ${oneLine()} | b |\n| ${pick(['---', ':--', ':-:', '--:'])} | --- |\n` +
      `| ${pick(['a \\| b', '$x$', '`c \\| d`', oneLine()])} | ${pick(['$5', '**e**', 'x'])} |`,
    () => pick(['[r]: /u', '[x]: /url', '[X]: /X "t"', '[ ]: /blank', '[t]: <a b>']),
    () => `> - a\n>   \`\`\`\n>   ${oneLine()}\n>   \`\`\``,
    () => `- ${oneLine()}\n  > ${oneLine()}`,
    () => `1. ${oneLine()}\n   - ${oneLine()}`,
  ]
  const blocks = Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick(BLOCKS)())
  const frontMatter = random() < 0.15 ? `---\ntitle: ${pick(['a', '', '$x$ [t]'])}\n---\n` : ''
  return frontMatter + blocks.join('\n\n')
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
      // Differences that render identically, or that markdown cannot express:
      // - an unclosed fence at the end of a file has no final newline; once
      //   written with its closing fence it gains one;
      // - spaces at the edge of emphasis or a link are written outside it
      //   (`*a* b`), and a space before a hard break is not kept;
      // - empty paragraphs (blank lines) are not preserved.
      let html = template.innerHTML
        .replace(/\n<\/code><\/pre>/g, '</code></pre>')
        .replace(/\s+<br>/g, '<br>')
        .replace(/<p><\/p>/g, '')
      for (let previous = ''; previous !== html; ) {
        previous = html
        html = html
          .replace(/<(em|strong|s|a\b[^>]*)>(\s+)/g, '$2<$1>')
          .replace(/(\s+)<\/(em|strong|s|a)>/g, '</$2>$1')
          .replace(/<\/(em|strong|s)>(\s*)<\1>/g, '$2')
          .replace(/<(em|strong|s)><\/\1>/g, '')
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
