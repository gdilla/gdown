import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { frontmatterHighlightPlugin } from '../../codemirror/frontmatter-highlight'

let view: EditorView | undefined

afterEach(() => {
  view?.destroy()
  view = undefined
  vi.restoreAllMocks()
})

function mountView(doc: string): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [frontmatterHighlightPlugin] }),
    parent: document.body.appendChild(document.createElement('div')),
  })
  return view
}

/** Decorations as [covered text, token kind] pairs, in document order. */
function tokens(target: EditorView): Array<[string, string]> {
  const plugin = target.plugin(frontmatterHighlightPlugin)
  if (!plugin) throw new Error('front-matter highlight plugin was not installed')
  const out: Array<[string, string]> = []
  plugin.decorations.between(0, target.state.doc.length, (from, to, deco) => {
    const cls = String(deco.spec.class).replace('cm-frontmatter-', '')
    out.push([target.state.doc.sliceString(from, to), cls])
  })
  return out
}

describe('frontmatterHighlightPlugin decorations', () => {
  it('classifies every front-matter token type and ignores the body', () => {
    const doc = [
      '---',
      'title: "Hi"',
      "alt: 'single'",
      '# note',
      'count: -3.5',
      'draft: TRUE',
      'empty:',
      'tags:',
      '  - a',
      '\t- b',
      '',
      'plain: text here',
      '---',
      'Body: not front matter',
      '---',
    ].join('\n')

    expect(tokens(mountView(doc))).toEqual([
      ['---', 'delimiter'],
      ['title', 'key'],
      ['"Hi"', 'string'],
      ['alt', 'key'],
      ["'single'", 'string'],
      ['# note', 'comment'],
      ['count', 'key'],
      ['-3.5', 'number'],
      ['draft', 'key'],
      ['TRUE', 'bool'],
      ['empty', 'key'],
      ['tags', 'key'],
      ['- a', 'value'],
      ['- b', 'value'],
      ['plain', 'key'],
      ['text here', 'value'],
      ['---', 'delimiter'],
    ])
  })

  it('accepts trailing whitespace on delimiters and a closing line at end of document', () => {
    expect(tokens(mountView('---  \na: b\n --- '))).toEqual([
      ['---  ', 'delimiter'],
      ['a', 'key'],
      ['b', 'value'],
      [' --- ', 'delimiter'],
    ])
  })

  it.each([
    ['no front matter', 'title: x\n---\n'],
    ['unclosed front matter', '---\ntitle: x\nmore: y\n'],
    ['a lone delimiter', '---'],
    ['an indented opening delimiter', ' ---\na: b\n---'],
    ['text after the opening dashes', '---x\na: b\n---'],
  ])('produces no decorations for %s', (_label, doc) => {
    expect(tokens(mountView(doc))).toEqual([])
  })

  it('updates decorations when front matter is added and removed', () => {
    const target = mountView('Body')
    target.dispatch({ changes: { from: 0, insert: '---\na: 1\n---\n' } })
    expect(tokens(target)).toEqual([
      ['---', 'delimiter'],
      ['a', 'key'],
      ['1', 'number'],
      ['---', 'delimiter'],
    ])

    target.dispatch({ changes: { from: 0, to: 1 } })
    expect(tokens(target)).toEqual([])
  })

  it('does not copy the whole document on each edit', () => {
    const body = Array.from({ length: 5_000 }, (_, i) => `Line ${i} of the body`).join('\n')
    const target = mountView(`---\ntitle: Big\n---\n${body}`)
    const toString = vi.spyOn(Text.prototype, 'toString')
    // sliceString is implemented on the concrete Text subclass (a tree node for big docs).
    const textNode = Object.getPrototypeOf(target.state.doc) as Text
    const sliceString = vi.spyOn(textNode, 'sliceString')

    target.dispatch({ changes: { from: target.state.doc.length, insert: 'x' } })

    expect(toString).not.toHaveBeenCalled()
    const fullCopies = sliceString.mock.calls.filter(
      ([from, to]) => from === 0 && (to === undefined || to >= target.state.doc.length),
    )
    expect(fullCopies).toHaveLength(0)
    expect(tokens(target)).toEqual([
      ['---', 'delimiter'],
      ['title', 'key'],
      ['Big', 'value'],
      ['---', 'delimiter'],
    ])
  })
})
