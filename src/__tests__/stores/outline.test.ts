import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOutlineStore } from '../../stores/outline'

describe('useOutlineStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to not visible with no headings', () => {
    const store = useOutlineStore()

    expect(store.visible).toBe(false)
    expect(store.headings).toEqual([])
    expect(store.activeHeadingId).toBeNull()
  })

  describe('visibility', () => {
    it('toggleOutline flips visibility', () => {
      const store = useOutlineStore()

      store.toggleOutline()
      expect(store.visible).toBe(true)

      store.toggleOutline()
      expect(store.visible).toBe(false)
    })

    it('showOutline sets visible to true', () => {
      const store = useOutlineStore()

      store.showOutline()

      expect(store.visible).toBe(true)
    })

    it('hideOutline sets visible to false', () => {
      const store = useOutlineStore()

      store.showOutline()
      store.hideOutline()

      expect(store.visible).toBe(false)
    })
  })

  describe('updateHeadings', () => {
    it('extracts headings from editor JSON', () => {
      const store = useOutlineStore()

      const editorJson = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Title' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Some body text.' }],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Subtitle' }],
          },
        ],
      }

      store.updateHeadings(editorJson)

      expect(store.headings).toHaveLength(2)
      expect(store.headings[0]!.text).toBe('Title')
      expect(store.headings[0]!.level).toBe(1)
      expect(store.headings[1]!.text).toBe('Subtitle')
      expect(store.headings[1]!.level).toBe(2)
    })

    it('handles null/empty editor JSON', () => {
      const store = useOutlineStore()

      store.updateHeadings(null)
      expect(store.headings).toEqual([])

      store.updateHeadings({})
      expect(store.headings).toEqual([])
    })

    it('ignores headings with empty text', () => {
      const store = useOutlineStore()

      const editorJson = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: '   ' }],
          },
        ],
      }

      store.updateHeadings(editorJson)

      expect(store.headings).toHaveLength(0)
    })
  })

  describe('updateFromMarkdown', () => {
    it('extracts headings from markdown text', () => {
      const store = useOutlineStore()

      const markdown = `# Main Title

Some paragraph.

## Section One

### Subsection

## Section Two`

      store.updateFromMarkdown(markdown)

      expect(store.headings).toHaveLength(4)
      expect(store.headings[0]!.text).toBe('Main Title')
      expect(store.headings[0]!.level).toBe(1)
      expect(store.headings[1]!.text).toBe('Section One')
      expect(store.headings[1]!.level).toBe(2)
      expect(store.headings[2]!.text).toBe('Subsection')
      expect(store.headings[2]!.level).toBe(3)
      expect(store.headings[3]!.text).toBe('Section Two')
      expect(store.headings[3]!.level).toBe(2)
    })

    it('handles empty markdown', () => {
      const store = useOutlineStore()

      store.updateFromMarkdown('')

      expect(store.headings).toEqual([])
    })

    it('strips trailing hashes from headings', () => {
      const store = useOutlineStore()

      store.updateFromMarkdown('## Heading ##')

      expect(store.headings[0]!.text).toBe('Heading')
    })

    it('ignores lines without proper heading syntax', () => {
      const store = useOutlineStore()

      store.updateFromMarkdown('#no space\n##also-no-space\nregular text')

      expect(store.headings).toHaveLength(0)
    })
  })

  describe('setActiveHeading', () => {
    it('finds correct heading by position', () => {
      const store = useOutlineStore()

      store.updateFromMarkdown('# First\n\nSome text\n\n## Second\n\nMore text')

      // Position after "# First" line
      store.setActiveHeading(5)
      expect(store.activeHeadingId).toBe(store.headings[0]!.id)

      // Position after "## Second" starts
      const secondPos = store.headings[1]!.pos
      store.setActiveHeading(secondPos + 5)
      expect(store.activeHeadingId).toBe(store.headings[1]!.id)
    })

    it('returns null for position before any heading', () => {
      const store = useOutlineStore()

      // Headings start after some content
      store.updateFromMarkdown('no heading here\n\n# First heading')

      store.setActiveHeading(0)
      expect(store.activeHeadingId).toBeNull()
    })
  })

  describe('clearHeadings', () => {
    it('resets headings and active heading', () => {
      const store = useOutlineStore()

      store.updateFromMarkdown('# Title\n## Subtitle')
      store.setActiveHeading(0)

      store.clearHeadings()

      expect(store.headings).toEqual([])
      expect(store.activeHeadingId).toBeNull()
    })
  })

  describe('computed properties', () => {
    it('minLevel returns the smallest heading level', () => {
      const store = useOutlineStore()

      store.updateFromMarkdown('## Level Two\n### Level Three')

      expect(store.minLevel).toBe(2)
    })

    it('minLevel defaults to 1 when no headings', () => {
      const store = useOutlineStore()

      expect(store.minLevel).toBe(1)
    })

    it('hasHeadings is true when headings exist', () => {
      const store = useOutlineStore()

      expect(store.hasHeadings).toBe(false)

      store.updateFromMarkdown('# Title')

      expect(store.hasHeadings).toBe(true)
    })
  })
})
