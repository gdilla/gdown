import { describe, it, expect } from 'vitest'
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdownConverter'
import { parseFrontMatter } from '../../utils/frontmatter'

describe('markdownToHtml', () => {
  it('returns empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('')
  })

  it('converts a simple paragraph', () => {
    const html = markdownToHtml('Hello world')

    expect(html).toContain('<p>')
    expect(html).toContain('Hello world')
  })

  it('converts headings h1-h3', () => {
    const h1 = markdownToHtml('# Heading 1')
    const h2 = markdownToHtml('## Heading 2')
    const h3 = markdownToHtml('### Heading 3')

    expect(h1).toContain('<h1>')
    expect(h1).toContain('Heading 1')
    expect(h2).toContain('<h2>')
    expect(h3).toContain('<h3>')
  })

  it('converts bold text', () => {
    const html = markdownToHtml('**bold text**')

    expect(html).toContain('<strong>')
    expect(html).toContain('bold text')
  })

  it('converts italic text', () => {
    const html = markdownToHtml('*italic text*')

    expect(html).toContain('<em>')
    expect(html).toContain('italic text')
  })

  it('converts strikethrough text', () => {
    const html = markdownToHtml('~~deleted~~')

    expect(html).toContain('<s>')
    expect(html).toContain('deleted')
  })

  it('converts links', () => {
    const html = markdownToHtml('[example](https://example.com)')

    expect(html).toContain('<a')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('example')
  })

  it('converts fenced code blocks', () => {
    const html = markdownToHtml('```js\nconsole.log("hi")\n```')

    expect(html).toContain('<code')
    expect(html).toContain('console.log')
  })

  it('converts unordered lists', () => {
    const html = markdownToHtml('- item 1\n- item 2\n- item 3')

    expect(html).toContain('<ul data-tight="true">')
    expect(html).toContain('<li>')
    expect(html).toContain('item 1')
  })

  it('converts ordered lists', () => {
    const html = markdownToHtml('1. first\n2. second\n3. third')

    expect(html).toContain('<ol data-tight="true">')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('converts tables', () => {
    const md = `| Header 1 | Header 2 |
| --- | --- |
| Cell 1 | Cell 2 |`

    const html = markdownToHtml(md)

    expect(html).toContain('<table>')
    expect(html).toContain('<th>')
    expect(html).toContain('Header 1')
    expect(html).toContain('<td>')
    expect(html).toContain('Cell 1')
  })

  it('wraps front matter in a data-type div', () => {
    const md = `---
title: Test
---
Body content`

    const html = markdownToHtml(md)

    expect(html).toContain('data-type="frontmatter"')
    expect(html).toContain('title: Test')
    expect(html).toContain('Body content')
  })
})

describe('htmlToMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('')
  })

  it('converts a simple paragraph', () => {
    const md = htmlToMarkdown('<p>Hello world</p>')

    expect(md).toContain('Hello world')
  })

  it('converts headings', () => {
    const md = htmlToMarkdown('<h1>Title</h1>')

    expect(md).toContain('# Title')
  })

  it('converts h2', () => {
    const md = htmlToMarkdown('<h2>Subtitle</h2>')

    expect(md).toContain('## Subtitle')
  })

  it('converts bold', () => {
    const md = htmlToMarkdown('<p><strong>bold</strong></p>')

    expect(md).toContain('**bold**')
  })

  it('converts italic', () => {
    const md = htmlToMarkdown('<p><em>italic</em></p>')

    expect(md).toContain('*italic*')
  })

  it('converts strikethrough', () => {
    const md = htmlToMarkdown('<p><del>deleted</del></p>')

    expect(md).toContain('~~deleted~~')
  })

  it('converts s tag strikethrough', () => {
    const md = htmlToMarkdown('<p><s>deleted</s></p>')

    expect(md).toContain('~~deleted~~')
  })

  it('converts links', () => {
    const md = htmlToMarkdown('<p><a href="https://example.com">example</a></p>')

    expect(md).toContain('[example](https://example.com)')
  })

  it('converts fenced code blocks', () => {
    const md = htmlToMarkdown('<pre><code>console.log("hi")</code></pre>')

    expect(md).toContain('```')
    expect(md).toContain('console.log("hi")')
  })

  it('converts unordered lists', () => {
    const md = htmlToMarkdown('<ul><li>item 1</li><li>item 2</li></ul>')

    expect(md).toMatch(/-\s+item 1/)
    expect(md).toMatch(/-\s+item 2/)
  })

  it('converts ordered lists', () => {
    const md = htmlToMarkdown('<ol><li>first</li><li>second</li></ol>')

    expect(md).toMatch(/1\.\s+first/)
    expect(md).toMatch(/2\.\s+second/)
  })

  it('converts tables back to pipe-table markdown', () => {
    const html = `<table>
      <thead><tr><th>Header 1</th><th>Header 2</th></tr></thead>
      <tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody>
    </table>`

    const md = htmlToMarkdown(html)

    expect(md).toContain('|')
    expect(md).toContain('Header 1')
    expect(md).toContain('Header 2')
    expect(md).toContain('---')
    expect(md).toContain('Cell 1')
    expect(md).toContain('Cell 2')
  })

  it('converts front matter div back to YAML block', () => {
    const html = '<div data-type="frontmatter">title: Test</div><p>Body</p>'

    const md = htmlToMarkdown(html)

    expect(md).toContain('---')
    expect(md).toContain('title: Test')
    expect(md).toContain('Body')
  })

  it('preserves the body/frontmatter contract across a mode handoff fixture', () => {
    const source = `---
title: Handoff
author: Leaf
---
# Body

Text after the metadata.`

    const serialized = htmlToMarkdown(markdownToHtml(source))
    const parsed = parseFrontMatter(serialized)

    expect(parsed.hasFrontMatter).toBe(true)
    expect(parsed.rawYaml).toBe('title: Handoff\nauthor: Leaf')
    expect(parsed.body).toContain('# Body')
    expect(parsed.body).not.toContain('title: Handoff')
  })
})

describe('round-trip rules', () => {
  const md = (html: string) => htmlToMarkdown(html)

  it('ends serialized markdown with exactly one newline', () => {
    expect(md('<p>x</p>')).toBe('x\n')
  })

  describe('links', () => {
    it('never links bare filenames', () => {
      expect(markdownToHtml('See CLAUDE.md and README.md')).not.toContain('<a')
    })

    it('still links bare URLs', () => {
      expect(markdownToHtml('Go to https://example.com/a_b now')).toContain(
        '<a href="https://example.com/a_b">https://example.com/a_b</a>',
      )
    })

    it('saves a link whose text is its href as a bare URL', () => {
      expect(md('<p><a href="https://example.com/a_b">https://example.com/a_b</a></p>')).toBe(
        'https://example.com/a_b\n',
      )
    })

    it('saves a bare email as bare text', () => {
      expect(md('<p><a href="mailto:me@example.com">me@example.com</a></p>')).toBe(
        'me@example.com\n',
      )
    })

    it('keeps explicit links with distinct text', () => {
      expect(md('<p><a href="https://example.com">text</a></p>')).toBe(
        '[text](https://example.com)\n',
      )
    })
  })

  describe('lists', () => {
    it('marks tight and loose lists for the editor', () => {
      expect(markdownToHtml('- a\n- b')).toContain('<ul data-tight="true">')
      expect(markdownToHtml('- a\n\n- b')).toContain('<ul data-tight="false">')
      expect(markdownToHtml('1. a\n2. b')).toContain('<ol data-tight="true">')
    })

    it('writes tight bullets with a single space and no blank lines', () => {
      expect(md('<ul data-tight="true"><li><p>a</p></li><li><p>b</p></li></ul>')).toBe('- a\n- b\n')
    })

    it('treats lists without a tight marker (created in WYSIWYG) as tight', () => {
      expect(md('<ul><li><p>a</p></li><li><p>b</p></li></ul>')).toBe('- a\n- b\n')
    })

    it('keeps loose lists loose', () => {
      expect(md('<ul data-tight="false"><li><p>a</p></li><li><p>b</p></li></ul>')).toBe(
        '- a\n\n- b\n',
      )
    })

    it('writes a loose list when a tight item holds two paragraphs', () => {
      expect(md('<ul data-tight="true"><li><p>a</p><p>a2</p></li><li><p>b</p></li></ul>')).toBe(
        '- a\n\n  a2\n\n- b\n',
      )
    })

    it('writes ordered items as "1. item" from the start number', () => {
      expect(md('<ol start="5"><li><p>five</p></li><li><p>six</p></li></ol>')).toBe(
        '5. five\n6. six\n',
      )
    })

    it('indents nested lists by the parent marker width', () => {
      expect(
        md(
          '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>' +
            '<p>x</p><ol><li><p>one</p><ol><li><p>sub</p></li></ol></li></ol>',
        ),
      ).toBe('- a\n  - b\n\nx\n\n1. one\n   1. sub\n')
    })
  })

  describe('task lists', () => {
    it('parses GFM task items into the editor task list shape', () => {
      const html = markdownToHtml('- [ ] todo\n- [x] done')
      expect(html).toContain('data-type="taskList"')
      expect(html).toContain('<li data-type="taskItem" data-checked="false">todo</li>')
      expect(html).toContain('<li data-type="taskItem" data-checked="true">done</li>')
    })

    it('leaves a list that mixes tasks and plain items alone', () => {
      expect(markdownToHtml('- [ ] todo\n- plain')).not.toContain('taskList')
    })

    it('serializes editor task items with a list marker', () => {
      const html =
        '<ul data-type="taskList" data-tight="true">' +
        '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li>' +
        '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p>' +
        '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>sub</p></div></li></ul>' +
        '</div></li></ul>'
      expect(md(html)).toBe('- [ ] todo\n- [x] done\n  - [ ] sub\n')
    })
  })

  describe('math', () => {
    it('parses inline and block math without touching the LaTeX', () => {
      expect(markdownToHtml('a $\\frac{a_1}{b_2}$ b')).toContain(
        '<span data-type="math-inline" data-latex="\\frac{a_1}{b_2}">\\frac{a_1}{b_2}</span>',
      )
      expect(markdownToHtml('$$\n\\int_0^1 x^2 \\, dx\n$$')).toContain(
        '<div data-type="math-block" data-latex="\\int_0^1 x^2 \\, dx">\\int_0^1 x^2 \\, dx</div>',
      )
    })

    it('does not treat currency as math', () => {
      expect(markdownToHtml('costs $5 and $10 total')).not.toContain('math-inline')
      expect(markdownToHtml('escaped \\$x\\$ stays text')).not.toContain('math-inline')
    })

    it('serializes math nodes byte-for-byte with no escaping', () => {
      expect(
        md(
          '<p>a <span data-type="math-inline" data-latex="\\frac{a_1}{b_2}">\\frac{a_1}{b_2}</span> b</p>',
        ),
      ).toBe('a $\\frac{a_1}{b_2}$ b\n')
      expect(
        md(
          '<div data-type="math-block" data-latex="\\int_0^1 x^2 \\, dx">\\int_0^1 x^2 \\, dx</div>',
        ),
      ).toBe('$$\n\\int_0^1 x^2 \\, dx\n$$\n')
    })

    it('escapes dollar signs in text that would otherwise reload as math', () => {
      expect(md('<p>literal $x$ here</p>')).toBe('literal \\$x\\$ here\n')
      expect(md('<p>costs $5 and $10</p>')).toBe('costs $5 and $10\n')
    })
  })

  describe('escaping', () => {
    it('does not add backslashes to ordinary prose', () => {
      const prose = 'snake_case, 2 * 3, [1] note, # hash, a < b, C:\\Windows and 1. mid-line'
      expect(md(`<p>${prose.replace('<', '&lt;')}</p>`)).toBe(`${prose}\n`)
    })

    it('escapes text that would reload as markdown syntax', () => {
      expect(md('<p>- not a list</p>')).toBe('\\- not a list\n')
      expect(md('<p># not a heading</p>')).toBe('\\# not a heading\n')
      expect(md('<p>1. not a list</p>')).toBe('1\\. not a list\n')
      expect(md('<p>&gt; not a quote</p>')).toBe('\\> not a quote\n')
      expect(md('<p>*not emphasis* and _not_ either</p>')).toBe(
        '\\*not emphasis\\* and \\_not\\_ either\n',
      )
      expect(md('<p>[not](x) and `not code`</p>')).toBe('\\[not](x) and \\`not code\\`\n')
      expect(md('<p>&lt;div&gt; is not html</p>')).toBe('\\<div> is not html\n')
      expect(md('<p>a\\*b</p>')).toBe('a\\\\\\*b\n')
    })
  })

  it('writes empty blockquote lines without trailing spaces', () => {
    expect(md('<blockquote><p>a</p><p>b</p></blockquote>')).toBe('> a\n>\n> b\n')
  })

  describe('tables', () => {
    it('writes the header separator for editor tables (header row inside tbody)', () => {
      expect(
        md(
          '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
        ),
      ).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n')
    })

    it('round-trips column alignment', () => {
      const source = '| L | C | R | N |\n| :--- | :---: | ---: | --- |\n| 1 | 2 | 3 | 4 |\n'
      expect(md(markdownToHtml(source))).toBe(source)
    })

    it('does not escape list-like text inside cells', () => {
      expect(
        md(
          '<table><tbody><tr><th><p>- a</p></th></tr><tr><td><p>1. b</p></td></tr></tbody></table>',
        ),
      ).toBe('| - a |\n| --- |\n| 1. b |\n')
    })
  })
})

describe('review regressions', () => {
  const md = (html: string) => htmlToMarkdown(html)
  const rt = (source: string) => htmlToMarkdown(markdownToHtml(source))

  describe('links are only written bare when the loader re-links them identically', () => {
    it.each([
      '[CHANGELOG.md](CHANGELOG.md)',
      '[#anchor](#anchor)',
      '[example.com](http://example.com)',
      '[www.example.com](http://www.example.com)',
      '[localhost:1420](http://localhost:1420)',
      '[CLAUDE.md](http://CLAUDE.md)',
    ])('keeps %s', (link) => {
      expect(rt(`See ${link} now`)).toBe(`See ${link} now\n`)
    })

    it('keeps the explicit form when bare text would not parse back to the same link', () => {
      expect(md('<p><a href="__init__.py">__init__.py</a></p>')).toBe(
        '[\\_\\_init\\_\\_.py](__init__.py)\n',
      )
      expect(md('<p><a href="https://x.com/p.">https://x.com/p.</a></p>')).toBe(
        '[https://x.com/p.](https://x.com/p.)\n',
      )
      expect(md('<p><a href="https://x.com/a*b">https://x.com/a*b</a>*c</p>')).toBe(
        '[https://x.com/a\\*b](https://x.com/a*b)\\*c\n',
      )
      expect(md('<p>x<a href="https://x.com">https://x.com</a></p>')).toBe(
        'x[https://x.com](https://x.com)\n',
      )
    })

    it('still writes real bare URLs bare, before punctuation too', () => {
      expect(rt('See https://example.com/a_b, ok')).toBe('See https://example.com/a_b, ok\n')
    })
  })

  describe('literal $ and [ are escaped when the paragraph would reload as math or a link', () => {
    it('escapes dollars that pair across formatting', () => {
      const source = 'costs \\$5 for **one** and 10\\$ each'
      expect(rt(source)).toBe(`${source}\n`)
      expect(markdownToHtml(md(markdownToHtml(source)))).not.toContain('math-inline')
    })

    it('escapes a paragraph that would reload as a math block', () => {
      expect(rt('\\$\\$ 5 \\$\\$')).toBe('\\$\\$ 5 \\$\\$\n')
    })

    it('escapes brackets that would form a link across formatting or with nesting', () => {
      expect(markdownToHtml(md('<p>[a <strong>b</strong> c](x)</p>'))).not.toContain('<a')
      expect(markdownToHtml(md('<p>fn[a[0]](x)</p>'))).not.toContain('<a')
    })

    it('writes inline math so the loader reads it back as the same math', () => {
      for (const [latex, after] of [
        ['x', '2 apples'],
        ['a \\\\', ' b'],
        ['\\text{cost } \\$5', ' b'],
      ] as Array<[string, string]>) {
        const out = md(
          `<p><span data-type="math-inline" data-latex="${latex}">${latex}</span>${after}</p>`,
        )
        expect(markdownToHtml(out)).toMatch(/data-type="math-inline" data-latex="[^"]+"/)
        expect(markdownToHtml(out)).toContain(after.trim())
        // No stray delimiters outside the math node
        expect(
          markdownToHtml(out).replace(/<span data-type="math-inline".*<\/span>/, ''),
        ).not.toContain('$')
      }
    })
  })

  describe('display math inside list items', () => {
    it('keeps an item that is only display math inside its list', () => {
      const source = '- $$a^2+b^2=c^2$$\n- $$e^{i\\pi}=-1$$\n'
      expect(rt(source)).toBe(source)
    })

    it('does not let an unclosed $$ in a list item swallow later content', () => {
      const html = markdownToHtml('- a\n\n  $$\n  x\n- b\n\npara\n\n$$\ny\n$$')
      expect(html).toContain('<li>\n<p>b</p>\n</li>')
      expect(html).toContain('<p>para</p>')
      expect(html).toContain('data-latex="y"')
    })
  })

  describe('performance', () => {
    it('serializes a 5,000-item list in linear time', () => {
      const items = Array.from({ length: 5000 }, (_, i) => `<li><p>item ${i}</p></li>`).join('')
      const started = performance.now()
      const out = md(`<ul data-tight="true">${items}</ul>`)
      expect(performance.now() - started).toBeLessThan(2000)
      expect(out.split('\n')).toHaveLength(5001)
    })

    it('serializes 5,000 task items and ordered items in linear time', () => {
      const tasks = Array.from(
        { length: 5000 },
        (_, i) =>
          `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>t ${i}</p></div></li>`,
      ).join('')
      const ordered = Array.from({ length: 5000 }, (_, i) => `<li><p>o ${i}</p></li>`).join('')
      const started = performance.now()
      const out = md(`<ul data-type="taskList">${tasks}</ul><p>x</p><ol>${ordered}</ol>`)
      expect(performance.now() - started).toBeLessThan(3000)
      expect(out).toContain('- [ ] t 4999\n\nx\n\n1. o 0\n')
      expect(out).toContain('5000. o 4999\n')
    })

    it('escapes 100,000 unclosed brackets in linear time', () => {
      const started = performance.now()
      md(`<p>${'['.repeat(100_000)}</p>`)
      expect(performance.now() - started).toBeLessThan(2000)
    })
  })

  describe('list boundaries', () => {
    it('separates adjacent lists so they do not merge on reload', () => {
      const out = md(
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>todo</p></div></li></ul>' +
          '<ul><li><p>a</p></li></ul><ol><li><p>one</p></li></ol><ol><li><p>uno</p></li></ol>',
      )
      expect(out).toBe('- [ ] todo\n\n* a\n\n1. one\n\n1) uno\n')
      const html = markdownToHtml(out)
      expect(html.match(/<ul/g)).toHaveLength(2)
      expect(html.match(/<ol/g)).toHaveLength(2)
      expect(html).toContain('data-type="taskList"')
    })

    it('keeps a code block under a tight item tight', () => {
      const source = '1. Install:\n   ```sh\n   pnpm i\n   ```\n2. Run\n3. Done\n'
      expect(rt(source)).toBe(source)
    })
  })
})
