import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MathInline } from '../../extensions/MathInline'
import { SearchHighlight, getSearchState } from '../../extensions/SearchHighlight'

let editor: Editor | undefined

function para(...content: JSONContent[]): JSONContent {
  return { type: 'paragraph', content }
}
const text = (t: string): JSONContent => ({ type: 'text', text: t })
const math = (latex: string): JSONContent => ({ type: 'mathInline', attrs: { latex } })

function makeEditor(...paragraphs: JSONContent[]): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, MathInline, SearchHighlight],
    content: { type: 'doc', content: paragraphs },
  })
  return editor
}

function search(ed: Editor, term: string, caseSensitive = false, useRegex = false) {
  ed.commands.setSearchTerm(term, caseSensitive, useRegex)
  return getSearchState(ed.state)!
}

function matchedTexts(ed: Editor): string[] {
  return getSearchState(ed.state)!.results.map((r) => ed.state.doc.textBetween(r.from, r.to))
}

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

describe('SearchHighlight — inline atom boundaries', () => {
  it('does not match across an inline math node', () => {
    const ed = makeEditor(para(text('ab'), math('x^2'), text('cd')))
    expect(search(ed, 'bc').results).toHaveLength(0)
  })

  it('Replace All never deletes an inline math node', () => {
    const ed = makeEditor(para(text('ab'), math('x^2'), text('cd bc')))
    search(ed, 'bc')
    ed.commands.replaceAll('Z')

    const nodes = ed.state.doc.firstChild!.children
    expect(nodes.map((n) => n.type.name)).toEqual(['text', 'mathInline', 'text'])
    expect(nodes[1]!.attrs.latex).toBe('x^2')
    expect(nodes[0]!.text).toBe('ab')
    expect(nodes[2]!.text).toBe('cd Z')
  })

  it('still matches across adjacent text nodes with different marks', () => {
    const ed = makeEditor(
      para(text('a'), { type: 'text', text: 'b', marks: [{ type: 'bold' }] }, text('c')),
    )
    expect(search(ed, 'abc').results).toHaveLength(1)
  })

  it('does not match across paragraphs', () => {
    const ed = makeEditor(para(text('ab')), para(text('cd')))
    expect(search(ed, 'bc').results).toHaveLength(0)
    expect(search(ed, 'b\\nc', false, true).results).toHaveLength(0)
  })
})

describe('SearchHighlight — regex matching per text run', () => {
  it('keeps optional whitespace matches beside an inline math node', () => {
    const ed = makeEditor(para(text('foo '), math('x'), text(' bar')))
    search(ed, 'foo\\s*', false, true)
    expect(matchedTexts(ed)).toEqual(['foo '])
    search(ed, '\\s*bar', false, true)
    expect(matchedTexts(ed)).toEqual([' bar'])
  })

  it('finds trailing whitespace at the end of a paragraph', () => {
    const ed = makeEditor(para(text('a  ')), para(text('b')))
    search(ed, '\\s+', false, true)
    expect(matchedTexts(ed)).toEqual(['  '])
  })

  it('does not lose matches of negated classes next to a boundary', () => {
    const ed = makeEditor(para(text('xa')), para(text('yz')))
    search(ed, '[^a]+', false, true)
    expect(matchedTexts(ed)).toEqual(['x', 'yz'])
  })

  it('anchors ^ and $ at each line: paragraph edges, inline nodes and code-block lines', () => {
    const ed = makeEditor(
      para(text('ab')),
      para(text('bc')),
      para(text('foo'), math('x'), text('bar')),
      { type: 'codeBlock', content: [text('one\ntwo')] },
    )
    search(ed, '^b', false, true) // 'bc' and 'bar' (a run starts after the math node)
    expect(getSearchState(ed.state)!.results.map((r) => r.from)).toEqual([5, 13])
    search(ed, 'b$', false, true) // only 'ab'
    expect(getSearchState(ed.state)!.results.map((r) => r.from)).toEqual([2])
    search(ed, '^bar$', false, true)
    expect(matchedTexts(ed)).toEqual(['bar'])
    search(ed, '^two$', false, true)
    expect(matchedTexts(ed)).toEqual(['two'])
  })
})

describe('SearchHighlight — regex replacement', () => {
  it('expands capture groups in Replace All', () => {
    const ed = makeEditor(para(text('foo bar foo')))
    search(ed, '(foo)', false, true)
    ed.commands.replaceAll('$1!')
    expect(ed.getText()).toBe('foo! bar foo!')
  })

  it('expands $& and $$ in Replace', () => {
    const ed = makeEditor(para(text('cat dog')))
    search(ed, 'c(a)t', false, true)
    ed.commands.replaceCurrent('[$&|$1|$$]')
    expect(ed.getText()).toBe('[cat|a|$] dog')
  })

  it('expands named groups and respects lookahead context', () => {
    const ed = makeEditor(para(text('foobar foobaz')))
    search(ed, '(?<w>foo)(?=bar)', false, true)
    expect(getSearchState(ed.state)!.results).toHaveLength(1)
    ed.commands.replaceAll('<$<w>>')
    expect(ed.getText()).toBe('<foo>bar foobaz')
  })

  it("keeps $` and $' literal and leaves unknown group references literal", () => {
    const ed = makeEditor(para(text('ab')))
    search(ed, '(b)', false, true)
    ed.commands.replaceAll("[$`|$'|$2|$10|$0]")
    expect(ed.getText()).toBe("a[$`|$'|$2|b0|$0]")
  })

  it("never copies surrounding document text into a replacement ($')", () => {
    const ed = makeEditor(para(text('cost USD 5')), para(text('more USD text')))
    search(ed, 'USD', false, true)
    ed.commands.replaceAll("'$'")
    expect(ed.getText()).toBe("cost '$' 5\n\nmore '$' text")
  })

  it('Replace All in regex mode costs about the same as plain mode', () => {
    // 2000 matches in ~4 MB of index text. Expansion work proportional to the
    // document per match (the old sticky-regex copy) made regex mode several
    // times slower than plain mode here; comparing the two keeps the check
    // independent of machine speed.
    const paragraphs = () =>
      Array.from({ length: 2000 }, () => para(text('x1' + ' lorem'.repeat(333))))
    function timeReplaceAll(term: string, useRegex: boolean, replacement: string): number {
      const ed = makeEditor(...paragraphs())
      search(ed, term, false, useRegex)
      expect(getSearchState(ed.state)!.results).toHaveLength(2000)
      const started = performance.now()
      ed.commands.replaceAll(replacement)
      const elapsed = performance.now() - started
      expect(ed.state.doc.firstChild!.textContent.startsWith('y1 lorem')).toBe(true)
      ed.destroy()
      editor = undefined
      return elapsed
    }

    const plainMs = timeReplaceAll('x1', false, 'y1')
    const regexMs = timeReplaceAll('x(\\d)', true, 'y$1')
    expect(regexMs).toBeLessThan(plainMs * 2 + 250)
  })

  it('keeps the replacement literal in plain mode', () => {
    const ed = makeEditor(para(text('(foo)')))
    search(ed, '(foo)')
    ed.commands.replaceAll('$1!')
    expect(ed.getText()).toBe('$1!')
  })
})

describe('SearchHighlight — edge cases', () => {
  it('treats an invalid regex as no results instead of throwing', () => {
    const ed = makeEditor(para(text('a(b')))
    expect(() => search(ed, '(', false, true)).not.toThrow()
    expect(getSearchState(ed.state)!.results).toHaveLength(0)
  })

  it('terminates on a regex that matches the empty string and ignores empty matches', () => {
    const ed = makeEditor(para(text('aXbX')))
    expect(search(ed, 'X*', false, true).results).toHaveLength(2)
    expect(search(ed, '^', false, true).results).toHaveLength(0)
  })

  it('honours the case-sensitivity toggle', () => {
    const ed = makeEditor(para(text('Foo foo FOO')))
    expect(search(ed, 'foo').results).toHaveLength(3)
    expect(search(ed, 'foo', true).results).toHaveLength(1)
    expect(search(ed, 'f.o', true, true).results).toHaveLength(1)
  })

  it('Replace All with a replacement containing the term replaces each match once', () => {
    const ed = makeEditor(para(text('a b a')))
    search(ed, 'a')
    ed.commands.replaceAll('aa')
    expect(ed.getText()).toBe('aa b aa')
  })

  it('Replace with a replacement containing the term moves to the following match', () => {
    const ed = makeEditor(para(text('a b a')))
    search(ed, 'a')
    ed.commands.replaceCurrent('aa')
    expect(ed.getText()).toBe('aa b a')
    ed.commands.replaceCurrent('aa')
    expect(ed.getText()).toBe('aa b aa')
  })

  it('after Replace the current match is the following one', () => {
    const ed = makeEditor(para(text('x1 x2 x3')))
    search(ed, 'x\\d', false, true)
    ed.commands.setSearchIndex(1)
    ed.commands.replaceCurrent('y')
    const state = getSearchState(ed.state)!
    expect(ed.getText()).toBe('x1 y x3')
    expect(matchedTexts(ed)[state.currentIndex]).toBe('x3')
  })

  it('keeps the current match when the document is edited before it', () => {
    const ed = makeEditor(para(text('foo foo foo')))
    search(ed, 'foo')
    ed.commands.setSearchIndex(2)
    ed.commands.insertContentAt(1, 'foo ')
    const state = getSearchState(ed.state)!
    expect(state.results).toHaveLength(4)
    expect(state.currentIndex).toBe(3)
  })
})

/**
 * Which match is current after X. Rule: an ordinary edit keeps the match that
 * contains the current match's (mapped) start, else the next one, else wraps to
 * the first; Replace moves to the first match after the inserted text (wrapping);
 * Replace All and a new search (incl. toggling case/regex) start at the first.
 */
describe('SearchHighlight — current match tracking', () => {
  type Case = {
    name: string
    doc: string
    term: string
    regex?: boolean
    start: number // current index before the action
    act: (ed: Editor) => void
    expected: string | null // text of the current match afterwards (null = none)
    expectedIndex: number
  }
  // In 'one two three' the second word spans positions 5..8.
  const cases: Case[] = [
    {
      name: 'edit before the match',
      doc: 'one two three',
      term: '\\w+',
      regex: true,
      start: 1,
      act: (ed) => ed.commands.insertContentAt(1, 'A '),
      expected: 'two',
      expectedIndex: 2,
    },
    {
      name: 'insert at the start of the match',
      doc: 'one two three',
      term: '\\w+',
      regex: true,
      start: 1,
      act: (ed) => ed.commands.insertContentAt(5, 'X'),
      expected: 'Xtwo',
      expectedIndex: 1,
    },
    {
      name: 'insert in the middle of the match',
      doc: 'one two three',
      term: '\\w+',
      regex: true,
      start: 1,
      act: (ed) => ed.commands.insertContentAt(6, 'X'),
      expected: 'tXwo',
      expectedIndex: 1,
    },
    {
      name: 'insert at the end of the match',
      doc: 'one two three',
      term: '\\w+',
      regex: true,
      start: 1,
      act: (ed) => ed.commands.insertContentAt(8, 'X'),
      expected: 'twoX',
      expectedIndex: 1,
    },
    {
      name: 'edit after the match',
      doc: 'one two three',
      term: '\\w+',
      regex: true,
      start: 1,
      act: (ed) => ed.commands.insertContentAt(14, ' four'),
      expected: 'two',
      expectedIndex: 1,
    },
    {
      name: 'delete the whole match → next match',
      doc: 'one two three',
      term: '\\w+',
      regex: true,
      start: 1,
      act: (ed) => ed.commands.deleteRange({ from: 5, to: 8 }),
      expected: 'three',
      expectedIndex: 1,
    },
    {
      name: 'delete part of the match',
      doc: 'one two three',
      term: '\\w+',
      regex: true,
      start: 1,
      act: (ed) => ed.commands.deleteRange({ from: 5, to: 7 }),
      expected: 'o',
      expectedIndex: 1,
    },
    {
      name: 'delete the last match → wraps to first',
      doc: 'one two three',
      term: '\\w+',
      regex: true,
      start: 2,
      act: (ed) => ed.commands.deleteRange({ from: 8, to: 14 }),
      expected: 'one',
      expectedIndex: 0,
    },
    {
      name: 'edit creates a new earlier match',
      doc: 'foo bar foo',
      term: 'foo',
      start: 1,
      act: (ed) => ed.commands.insertContentAt(5, 'foo '),
      expected: 'foo',
      expectedIndex: 2,
    },
    {
      name: 'edit removes all matches',
      doc: 'foo bar foo',
      term: 'foo',
      start: 1,
      act: (ed) => ed.commands.setContent('<p>nothing</p>'),
      expected: null,
      expectedIndex: -1,
    },
    {
      name: 'Replace on a middle match → following match',
      doc: 'a1 a2 a3',
      term: 'a\\d',
      regex: true,
      start: 1,
      act: (ed) => ed.commands.replaceCurrent('b'),
      expected: 'a3',
      expectedIndex: 1,
    },
    {
      name: 'Replace on the last match wraps to the first',
      doc: 'foo bar foo',
      term: 'foo',
      start: 1,
      act: (ed) => ed.commands.replaceCurrent('baz'),
      expected: 'foo',
      expectedIndex: 0,
    },
    {
      name: 'Replace All → first remaining match',
      doc: 'foo bar foo',
      term: 'foo',
      start: 1,
      act: (ed) => ed.commands.replaceAll('foofoo'),
      expected: 'foo',
      expectedIndex: 0,
    },
    {
      name: 'undo of a Replace keeps following the same text',
      doc: 'foo bar foo',
      term: 'foo',
      start: 0,
      act: (ed) => {
        ed.commands.replaceCurrent('baz')
        ed.commands.undo()
      },
      expected: 'foo',
      expectedIndex: 1,
    },
    {
      name: 'tab switch (content replaced) → first match',
      doc: 'foo foo foo',
      term: 'foo',
      start: 2,
      act: (ed) => ed.commands.setContent('<p>x foo y foo</p>'),
      expected: 'foo',
      expectedIndex: 0,
    },
    {
      name: 'toggling case re-runs the search from the first match',
      doc: 'Foo foo FOO',
      term: 'foo',
      start: 2,
      act: (ed) => ed.commands.setSearchTerm('foo', true, false),
      expected: 'foo',
      expectedIndex: 0,
    },
    {
      name: 'toggling regex re-runs the search from the first match',
      doc: 'a.c abc',
      term: 'a.c',
      start: 0,
      act: (ed) => ed.commands.setSearchTerm('a.c', false, true),
      expected: 'a.c',
      expectedIndex: 0,
    },
  ]

  it.each(cases)('$name', ({ doc, term, regex, start, act, expected, expectedIndex }) => {
    const ed = makeEditor(para(text(doc)))
    search(ed, term, false, regex ?? false)
    ed.commands.setSearchIndex(start)
    act(ed)
    const state = getSearchState(ed.state)!
    expect(state.currentIndex).toBe(expectedIndex)
    const current = state.results[state.currentIndex]
    expect(current ? ed.state.doc.textBetween(current.from, current.to) : null).toBe(expected)
  })
})
