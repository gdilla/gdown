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

    it('saves fuzzy autolinks (http:// prefix, mailto:) as the bare text', () => {
      expect(md('<p><a href="http://CLAUDE.md">CLAUDE.md</a></p>')).toBe('CLAUDE.md\n')
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
      expect(md('<p>[not](a link) and `not code`</p>')).toBe('\\[not](a link) and \\`not code\\`\n')
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
