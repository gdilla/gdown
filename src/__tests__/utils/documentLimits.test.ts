import { describe, it, expect } from 'vitest'
import {
  MAX_OPEN_BYTES,
  MAX_RICH_CHARS,
  sourceOnlyReason,
  tabSourceOnlyReason,
} from '../../utils/documentLimits'
import { assembleFrontMatter } from '../../utils/frontmatter'

describe('sourceOnlyReason', () => {
  it.each([
    '/notes/readme.md',
    '/notes/README.MD',
    '/notes/a.markdown',
    '/notes/a.mdown',
    '/notes/a.mkd',
    '/notes/a.mdwn',
    '/notes/a.mdtxt',
    '/notes/a.txt',
    '/notes/a.text',
  ])('allows rich editing for the markdown file %s', (path) => {
    expect(sourceOnlyReason(path, 10)).toBeNull()
  })

  it('allows rich editing for an untitled document', () => {
    expect(sourceOnlyReason(null, 10)).toBeNull()
  })

  it.each([
    '/data/report.csv',
    '/data/REPORT.CSV',
    '/cfg/settings.json',
    '/cfg/ci.yml',
    '/cfg/Cargo.toml',
    '/web/index.html',
    '/src/main.ts',
    '/repo/Makefile',
    '/repo/.gitignore',
    '/notes.md/data',
  ])('opens %s as plain text', (path) => {
    expect(sourceOnlyReason(path, 10)).toBe('plain-text')
  })

  it('keeps markdown rich up to the limit and source-only beyond it', () => {
    expect(sourceOnlyReason('/notes/a.md', MAX_RICH_CHARS)).toBeNull()
    expect(sourceOnlyReason('/notes/a.md', MAX_RICH_CHARS + 1)).toBe('too-large')
    expect(sourceOnlyReason(null, MAX_RICH_CHARS + 1)).toBe('too-large')
  })

  it('reports plain text for a large non-markdown file', () => {
    expect(sourceOnlyReason('/data/report.csv', MAX_RICH_CHARS + 1)).toBe('plain-text')
  })

  it('keeps the rich limit below the open limit', () => {
    expect(MAX_RICH_CHARS).toBeLessThan(MAX_OPEN_BYTES)
  })

  it('allows rich editing for every extension Leaf registers as a markdown/text document', () => {
    const fs = (
      globalThis as unknown as {
        process: { getBuiltinModule(id: 'node:fs'): { readFileSync(p: string, e: 'utf8'): string } }
      }
    ).process.getBuiltinModule('node:fs')
    const source = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')
    const list = /const SUPPORTED_EXTENSIONS: &\[&str\] = &\[([^\]]+)\]/.exec(source)?.[1] ?? ''
    const extensions = Array.from(list.matchAll(/"([a-z]+)"/g), (match) => match[1]!)

    expect(extensions).toContain('md')
    for (const extension of extensions) {
      expect(sourceOnlyReason(`/notes/a.${extension}`, 10), extension).toBeNull()
    }
  })
})

describe('tabSourceOnlyReason', () => {
  const tab = (markdown: string, frontmatter: string | null) => ({
    filePath: '/notes/a.md',
    editorState: { markdown, frontmatter },
  })

  // The same boundary as opening the file: the rich editor is handed the
  // assembled document, delimiters included.
  it('measures the document as it is assembled, front-matter delimiters included', () => {
    const frontmatter = 'title: A'
    const delimiters = assembleFrontMatter(frontmatter, '').length - frontmatter.length
    expect(delimiters).toBeGreaterThan(0)

    const atLimit = 'a'.repeat(MAX_RICH_CHARS - frontmatter.length - delimiters)
    expect(tabSourceOnlyReason(tab(atLimit, frontmatter))).toBeNull()
    expect(tabSourceOnlyReason(tab(atLimit + 'a', frontmatter))).toBe('too-large')
    // Payloads that total exactly the limit are over it once assembled.
    expect(
      tabSourceOnlyReason(tab('a'.repeat(MAX_RICH_CHARS - frontmatter.length), frontmatter)),
    ).toBe('too-large')
  })

  it('measures a document without front matter by its text alone', () => {
    expect(tabSourceOnlyReason(tab('a'.repeat(MAX_RICH_CHARS), null))).toBeNull()
    expect(tabSourceOnlyReason(tab('a'.repeat(MAX_RICH_CHARS + 1), null))).toBe('too-large')
  })
})
