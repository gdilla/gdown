import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOutlineStore } from '../../stores/outline'
import { useTabsStore } from '../../stores/tabs'
import { useAutoSaveStore } from '../../stores/autoSave'
import * as converter from '../../utils/markdownConverter'
import { MAX_RICH_CHARS } from '../../utils/documentLimits'

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

    it('ignores # lines inside fenced code blocks', () => {
      const store = useOutlineStore()

      store.updateFromMarkdown(
        '# Real\n\n```bash\n# comment\n```\n\n~~~~\n## tilde\n~~~\n## still code\n~~~~\n\n## After',
      )

      expect(store.headings.map((h) => h.text)).toEqual(['Real', 'After'])
    })

    it('skips front matter and reports offsets in the full document', () => {
      const store = useOutlineStore()
      const doc = '---\ntitle: x\n# yaml comment\n---\n# Body\n\n## Next'

      store.updateFromMarkdown(doc)

      expect(store.headings.map((h) => h.text)).toEqual(['Body', 'Next'])
      expect(store.headings[0]!.pos).toBe(doc.indexOf('# Body'))
      expect(store.headings[1]!.pos).toBe(doc.indexOf('## Next'))
    })

    it('reads CRLF markdown, including fences, with correct offsets', () => {
      const store = useOutlineStore()
      const doc = '# A\r\n\r\n```\r\n# code\r\n```\r\n## B ##\r\n'

      store.updateFromMarkdown(doc)

      expect(store.headings.map((h) => h.text)).toEqual(['A', 'B'])
      expect(store.headings[1]!.pos).toBe(doc.indexOf('## B'))
    })

    it('handles fences opened on a list marker or inside a blockquote', () => {
      const store = useOutlineStore()
      const doc = '# A\n\n- ```js\n  # in list\n  ```\n\n> ```\n> # in quote\n> ```\n\n# B'

      store.updateFromMarkdown(doc)

      expect(store.headings.map((h) => h.text)).toEqual(['A', 'B'])
      expect(store.headings[1]!.pos).toBe(doc.indexOf('# B'))
    })

    it('ignores indented code and includes setext headings', () => {
      const store = useOutlineStore()
      const doc = 'Title\n=====\n\n    # indented code\n\nSub\n---\n'

      store.updateFromMarkdown(doc)

      expect(store.headings.map((h) => [h.level, h.text])).toEqual([
        [1, 'Title'],
        [2, 'Sub'],
      ])
      expect(store.headings[1]!.pos).toBe(doc.indexOf('Sub'))
    })

    it('keeps a # that is not a closing sequence', () => {
      const store = useOutlineStore()

      store.updateFromMarkdown('# C#\n## ###')

      expect(store.headings.map((h) => h.text)).toEqual(['C#'])
    })

    it('scans a pathological long heading line in linear time', () => {
      const store = useOutlineStore()
      const line = '# a' + ' '.repeat(100_000) + 'b'

      const start = performance.now()
      store.updateFromMarkdown(line)
      const elapsed = performance.now() - start

      expect(store.headings[0]!.text).toBe('a' + ' '.repeat(100_000) + 'b')
      expect(elapsed).toBeLessThan(500)
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

  describe('getSectionContent', () => {
    function setupWithMarkdown(markdown: string) {
      const outlineStore = useOutlineStore()
      const tabsStore = useTabsStore()

      // Mock the active tab with the given markdown
      tabsStore.$patch({
        tabs: [
          {
            id: 'test-tab',
            title: 'Test',
            filePath: null,
            isModified: false,
            editorState: {
              doc: null,
              markdown,
              scrollTop: 0,
              selection: { from: 0, to: 0 },
              frontmatter: null,
              frontmatterAttributes: {},
            },
          },
        ],
        activeTabId: 'test-tab',
      })

      outlineStore.updateFromMarkdown(markdown)
      return outlineStore
    }

    it('extracts section content between same-level headings', () => {
      const md = `# Title\n\nFirst paragraph.\n\n## Section One\n\nContent of section one.\n\n## Section Two\n\nContent of section two.`
      const store = setupWithMarkdown(md)

      const section = store.getSectionContent(1) // "## Section One"
      expect(section).not.toBeNull()
      expect(section!.markdown).toBe('## Section One\n\nContent of section one.')
    })

    it('last section extends to end of document', () => {
      const md = `# Title\n\n## Last Section\n\nThis is the end.`
      const store = setupWithMarkdown(md)

      const section = store.getSectionContent(1) // "## Last Section"
      expect(section).not.toBeNull()
      expect(section!.markdown).toBe('## Last Section\n\nThis is the end.')
    })

    it('nested headings are included in parent section', () => {
      const md = `## Parent\n\nParent content.\n\n### Child\n\nChild content.\n\n### Another Child\n\nMore child content.\n\n## Next Section`
      const store = setupWithMarkdown(md)

      const section = store.getSectionContent(0) // "## Parent"
      expect(section).not.toBeNull()
      expect(section!.markdown).toContain('### Child')
      expect(section!.markdown).toContain('### Another Child')
      expect(section!.markdown).not.toContain('## Next Section')
    })

    it('single heading document returns entire content', () => {
      const md = `# Only Heading\n\nAll the content here.\n\nMore content.`
      const store = setupWithMarkdown(md)

      const section = store.getSectionContent(0)
      expect(section).not.toBeNull()
      expect(section!.markdown).toBe('# Only Heading\n\nAll the content here.\n\nMore content.')
    })

    it('returns html along with markdown', () => {
      const md = `# Title\n\nSome **bold** text.`
      const store = setupWithMarkdown(md)

      const section = store.getSectionContent(0)
      expect(section).not.toBeNull()
      expect(section!.html).toContain('<h1>')
      expect(section!.html).toContain('<strong>bold</strong>')
    })

    it('returns null for invalid heading index', () => {
      const md = `# Title`
      const store = setupWithMarkdown(md)

      expect(store.getSectionContent(-1)).toBeNull()
      expect(store.getSectionContent(99)).toBeNull()
    })

    it('copies the right section around a list-contained fence', () => {
      const md = '# A\n\n- ```js\n  x\n  ```\n\n# B\n\nb text'
      const store = setupWithMarkdown(md)

      expect(store.getSectionContent(0)!.markdown).toBe('# A\n\n- ```js\n  x\n  ```')
      expect(store.getSectionContent(1)!.markdown).toBe('# B\n\nb text')
    })

    it('finds sections in CRLF markdown', () => {
      const md = '# A\r\n\r\na text\r\n\r\n# B\r\nb text'
      const store = setupWithMarkdown(md)

      expect(store.getSectionContent(1)!.markdown).toBe('# B\r\nb text')
    })

    it('does not treat # lines inside fenced code as section boundaries', () => {
      const md = '# A\n\n```bash\n# comment\n```\n\n# B\n\nb text'
      const store = setupWithMarkdown(md)
      // Headings as the WYSIWYG editor reports them: only the real ones.
      store.$patch({
        headings: [
          { id: 'heading-0', level: 1, text: 'A', pos: 0 },
          { id: 'heading-9', level: 1, text: 'B', pos: 9 },
        ],
      })

      expect(store.getSectionContent(0)!.markdown).toBe('# A\n\n```bash\n# comment\n```')
      expect(store.getSectionContent(1)!.markdown).toBe('# B\n\nb text')
    })

    it('returns null when no active tab markdown', () => {
      const store = useOutlineStore()
      store.updateFromMarkdown('# Title')

      // No tab set up — activeTab?.editorState?.markdown is undefined
      expect(store.getSectionContent(0)).toBeNull()
    })
  })

  describe('copySection', () => {
    it('copies section markdown to clipboard', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: { write: vi.fn(), writeText: writeTextMock },
      })

      const outlineStore = useOutlineStore()
      const tabsStore = useTabsStore()
      const md = `# Title\n\nContent here.`

      tabsStore.$patch({
        tabs: [
          {
            id: 'test-tab',
            title: 'Test',
            filePath: null,
            isModified: false,
            editorState: {
              doc: null,
              markdown: md,
              scrollTop: 0,
              selection: { from: 0, to: 0 },
              frontmatter: null,
              frontmatterAttributes: {},
            },
          },
        ],
        activeTabId: 'test-tab',
      })
      outlineStore.updateFromMarkdown(md)

      const result = await outlineStore.copySection(0, 'markdown')
      expect(result).toBe(true)
      expect(writeTextMock).toHaveBeenCalledWith('# Title\n\nContent here.')
    })

    it('flushes the live editor before copying section markdown', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: { write: vi.fn(), writeText: writeTextMock },
      })

      const outlineStore = useOutlineStore()
      const tabsStore = useTabsStore()
      const before = '# Title\n\nBefore.'
      tabsStore.$patch({
        tabs: [
          {
            id: 'test-tab',
            title: 'Test',
            filePath: null,
            isModified: true,
            contentRevision: 0,
            editorState: {
              doc: null,
              markdown: before,
              scrollTop: 0,
              selection: { from: 0, to: 0 },
              frontmatter: null,
              frontmatterAttributes: {},
            },
            isUntitled: true,
            isImage: false,
          },
        ],
        activeTabId: 'test-tab',
      })
      outlineStore.updateFromMarkdown(before)
      const capture = () =>
        tabsStore.saveEditorState('test-tab', { markdown: '# Title\n\nLatest.' })
      window.addEventListener('gdown:capture-state', capture)

      try {
        await expect(outlineStore.copySection(0, 'markdown')).resolves.toBe(true)
      } finally {
        window.removeEventListener('gdown:capture-state', capture)
      }

      expect(writeTextMock).toHaveBeenCalledWith('# Title\n\nLatest.')
    })

    it('returns false for invalid index', async () => {
      const outlineStore = useOutlineStore()
      const result = await outlineStore.copySection(99, 'markdown')
      expect(result).toBe(false)
    })
  })
  // The Outline panel's whole-document copy buttons work without any headings.
  describe('copyWholeDocument', () => {
    const clipboard = { writeText: vi.fn(), write: vi.fn() }

    beforeEach(() => {
      clipboard.writeText.mockReset().mockResolvedValue(undefined)
      clipboard.write.mockReset().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
    })

    // Backslashes in a CSV are data, not Turndown escapes to clean up.
    const CSV = 'path,pattern\nC:\\[dir\\],a\\_b\n'

    it('copies a source-only tab as its literal text', async () => {
      useTabsStore().createTab('/tmp/data.csv', CSV)
      const toHtml = vi.spyOn(converter, 'markdownToHtml')

      await expect(useOutlineStore().copyWholeDocument('markdown')).resolves.toBe(true)

      expect(clipboard.writeText).toHaveBeenCalledWith(CSV)
      expect(toHtml).not.toHaveBeenCalled()
      toHtml.mockRestore()
    })

    // Rendering is the whole-document markdown conversion a source-only tab
    // must never run (it is what froze the app on large CSVs).
    it.each([
      ['a plain-text file', '/tmp/data.csv', CSV, 'data.csv is a plain-text file'],
      [
        'a document over the rich limit',
        '/tmp/book.md',
        'a'.repeat(MAX_RICH_CHARS + 1),
        'book.md is over 200 KB',
      ],
    ])('refuses a rendered copy of %s and says why', async (_, path, content, reason) => {
      useTabsStore().createTab(path, content)
      const toHtml = vi.spyOn(converter, 'markdownToHtml')

      await expect(useOutlineStore().copyWholeDocument('richtext')).resolves.toBe(false)

      expect(toHtml).not.toHaveBeenCalled()
      expect(clipboard.write).not.toHaveBeenCalled()
      expect(useAutoSaveStore().saveNotification).toEqual({
        message: `Copy as Rich Text needs the rich editor. ${reason}, so it stays in source mode.`,
        type: 'warning',
      })
      toHtml.mockRestore()
    })

    it('still cleans up Turndown escapes when copying a markdown document', async () => {
      useTabsStore().createTab('/tmp/note.md', 'a\\_b')

      await expect(useOutlineStore().copyWholeDocument('markdown')).resolves.toBe(true)

      expect(clipboard.writeText).toHaveBeenCalledWith('a_b')
    })
  })
})
