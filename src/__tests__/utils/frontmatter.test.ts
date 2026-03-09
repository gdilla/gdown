import { describe, it, expect } from 'vitest'
import {
  parseFrontMatter,
  assembleFrontMatter,
  hasFrontMatter,
  extractTitle,
} from '../../utils/frontmatter'

describe('parseFrontMatter', () => {
  it('parses valid front matter with key-value pairs', () => {
    const content = `---
title: My Document
date: 2024-01-01
tags: [a, b, c]
---
Body content here.`

    const result = parseFrontMatter(content)

    expect(result.hasFrontMatter).toBe(true)
    expect(result.rawYaml).toContain('title: My Document')
    expect(result.rawYaml).toContain('date: 2024-01-01')
    expect(result.attributes['title']).toBe('My Document')
    expect(result.attributes['date']).toBe('2024-01-01')
    expect(result.body).toBe('Body content here.')
  })

  it('parses empty front matter', () => {
    const content = `---

---
Body after empty front matter.`

    const result = parseFrontMatter(content)

    expect(result.hasFrontMatter).toBe(true)
    expect(result.rawYaml.trim()).toBe('')
    expect(result.body).toBe('Body after empty front matter.')
  })

  it('returns entire content as body when no front matter present', () => {
    const content = 'Just some regular markdown.\n\nNo front matter here.'

    const result = parseFrontMatter(content)

    expect(result.hasFrontMatter).toBe(false)
    expect(result.rawYaml).toBe('')
    expect(result.attributes).toEqual({})
    expect(result.body).toBe(content)
  })

  it('handles empty/null content', () => {
    expect(parseFrontMatter('')).toEqual({
      rawYaml: '',
      attributes: {},
      body: '',
      hasFrontMatter: false,
    })
  })

  it('handles content starting with --- but no closing delimiter', () => {
    const content = '---\ntitle: broken\nno closing delimiter'

    const result = parseFrontMatter(content)

    expect(result.hasFrontMatter).toBe(false)
    expect(result.body).toBe(content)
  })

  it('parses quoted values', () => {
    const content = `---
title: "Quoted Title"
author: 'Single Quoted'
---
Body`

    const result = parseFrontMatter(content)

    expect(result.attributes['title']).toBe('Quoted Title')
    expect(result.attributes['author']).toBe('Single Quoted')
  })

  it('round-trips: parse then assemble', () => {
    const original = `---
title: Round Trip Test
date: 2024-06-15
---
# Hello World

Some body content.`

    const parsed = parseFrontMatter(original)
    const reassembled = assembleFrontMatter(parsed.rawYaml, parsed.body)

    expect(reassembled).toBe(original)
  })
})

describe('assembleFrontMatter', () => {
  it('wraps YAML in --- delimiters', () => {
    const result = assembleFrontMatter('title: Test', 'Body')

    expect(result).toBe('---\ntitle: Test\n---\nBody')
  })

  it('returns just body when rawYaml is empty', () => {
    expect(assembleFrontMatter('', 'Body only')).toBe('Body only')
  })

  it('returns just body when rawYaml is null', () => {
    expect(assembleFrontMatter(null, 'Body only')).toBe('Body only')
  })

  it('returns just body when rawYaml is undefined', () => {
    expect(assembleFrontMatter(undefined, 'Body only')).toBe('Body only')
  })

  it('trims trailing newlines from YAML', () => {
    const result = assembleFrontMatter('title: Test\n\n', 'Body')

    expect(result).toBe('---\ntitle: Test\n---\nBody')
  })
})

describe('hasFrontMatter', () => {
  it('returns true for valid front matter', () => {
    expect(hasFrontMatter('---\ntitle: Test\n---\nBody')).toBe(true)
  })

  it('returns false for content without front matter', () => {
    expect(hasFrontMatter('Just content')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(hasFrontMatter('')).toBe(false)
  })

  it('returns false when --- exists but no closing delimiter', () => {
    expect(hasFrontMatter('---\nno closing')).toBe(false)
  })
})

describe('extractTitle', () => {
  it('extracts lowercase "title"', () => {
    expect(extractTitle({ title: 'My Doc' })).toBe('My Doc')
  })

  it('extracts capitalized "Title"', () => {
    expect(extractTitle({ Title: 'Capitalized' })).toBe('Capitalized')
  })

  it('extracts uppercase "TITLE"', () => {
    expect(extractTitle({ TITLE: 'UPPER' })).toBe('UPPER')
  })

  it('returns null when no title field exists', () => {
    expect(extractTitle({ author: 'Someone' })).toBeNull()
  })

  it('returns null for empty attributes', () => {
    expect(extractTitle({})).toBeNull()
  })

  it('prefers lowercase "title" over others', () => {
    expect(extractTitle({ title: 'lower', Title: 'cap', TITLE: 'upper' })).toBe('lower')
  })
})
