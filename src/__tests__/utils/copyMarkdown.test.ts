import { describe, it, expect } from 'vitest'
import { assembleFullMarkdown } from '../../utils/copyMarkdown'

describe('assembleFullMarkdown', () => {
  it('returns body markdown when no front-matter exists', () => {
    const result = assembleFullMarkdown('# Hello\n\nWorld', null)
    expect(result).toBe('# Hello\n\nWorld')
  })

  it('prepends front-matter with --- delimiters when present', () => {
    const result = assembleFullMarkdown('# Hello', 'title: Test\ndate: 2024-01-01')
    expect(result).toBe('---\ntitle: Test\ndate: 2024-01-01\n---\n\n# Hello')
  })

  it('returns empty string when both are empty', () => {
    const result = assembleFullMarkdown('', null)
    expect(result).toBe('')
  })

  it('returns just front-matter when body is empty', () => {
    const result = assembleFullMarkdown('', 'title: Empty')
    expect(result).toBe('---\ntitle: Empty\n---\n\n')
  })

  it('trims trailing whitespace from front-matter', () => {
    const result = assembleFullMarkdown('Body', 'key: value  \n')
    expect(result).toBe('---\nkey: value  \n\n---\n\nBody')
  })
})
