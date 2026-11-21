import { describe, it, expect } from 'vitest'
import { MAX_OPEN_BYTES, MAX_RICH_CHARS, sourceOnlyReason } from '../../utils/documentLimits'

describe('sourceOnlyReason', () => {
  it.each([
    '/notes/readme.md',
    '/notes/README.MD',
    '/notes/a.markdown',
    '/notes/a.mdown',
    '/notes/a.mkd',
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
})
