import { describe, it, expect } from 'vitest'
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdownConverter'

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

    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item 1')
  })

  it('converts ordered lists', () => {
    const html = markdownToHtml('1. first\n2. second\n3. third')

    expect(html).toContain('<ol>')
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
})
