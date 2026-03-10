import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildStandaloneHtml,
  collectThemeCss,
  buildRenderedBody,
  copyAsRichText,
  triggerPrint,
} from '../../utils/publishDocument'

describe('publishDocument', () => {
  describe('buildStandaloneHtml', () => {
    it('produces a valid HTML document with DOCTYPE', () => {
      const html = buildStandaloneHtml('<p>Hello</p>', 'body { color: red; }', 'Test Doc')
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<html')
      expect(html).toContain('</html>')
    })

    it('includes the title in <title> tag', () => {
      const html = buildStandaloneHtml('<p>Hi</p>', '', 'My Title')
      expect(html).toContain('<title>My Title</title>')
    })

    it('embeds CSS in a <style> block', () => {
      const css = 'body { font-size: 16px; }'
      const html = buildStandaloneHtml('<p>Test</p>', css, 'Doc')
      expect(html).toContain('<style>')
      expect(html).toContain(css)
      expect(html).toContain('</style>')
    })

    it('wraps body content in .gdown-editor.content div', () => {
      const html = buildStandaloneHtml('<p>Content</p>', '', 'Doc')
      expect(html).toContain('class="gdown-editor content"')
      expect(html).toContain('<p>Content</p>')
    })

    it('escapes title for HTML safety', () => {
      const html = buildStandaloneHtml('<p>X</p>', '', 'A <script> & "test"')
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })
  })

  describe('collectThemeCss', () => {
    it('returns a string containing style content', () => {
      // In jsdom, getComputedStyle returns empty values but the function should still work
      const css = collectThemeCss()
      expect(typeof css).toBe('string')
      // Should contain some CSS content (at minimum the editor base styles)
      expect(css.length).toBeGreaterThan(0)
    })
  })

  describe('buildRenderedBody', () => {
    beforeEach(() => {
      // Mock katex
      vi.doMock('katex', () => ({
        default: {
          renderToString: vi.fn((latex: string) => `<span class="katex">${latex}</span>`),
        },
      }))
    })

    afterEach(() => {
      vi.doUnmock('katex')
    })

    it('returns HTML string from input', async () => {
      const result = await buildRenderedBody('<p>Hello world</p>')
      expect(result).toContain('Hello world')
    })

    it('renders math-inline nodes with KaTeX', async () => {
      const input =
        '<p>Text <span data-type="math-inline" data-latex="E=mc^2">E=mc^2</span> end</p>'
      const result = await buildRenderedBody(input)
      expect(result).toContain('katex')
    })

    it('renders math-block nodes with KaTeX', async () => {
      const input = '<div data-type="math-block" data-latex="\\sum_{i=0}">sum</div>'
      const result = await buildRenderedBody(input)
      expect(result).toContain('katex')
    })

    it('passes through HTML without math nodes unchanged', async () => {
      const input = '<p>Simple paragraph</p>'
      const result = await buildRenderedBody(input)
      expect(result).toContain('<p>Simple paragraph</p>')
    })
  })

  describe('copyAsRichText', () => {
    it('calls navigator.clipboard.write with text/html', async () => {
      // Mock ClipboardItem since jsdom doesn't provide it
      const constructorCalls: Array<Record<string, Blob>> = []
      class MockClipboardItem {
        types: string[]
        constructor(items: Record<string, Blob>) {
          constructorCalls.push(items)
          this.types = Object.keys(items)
        }
      }
      vi.stubGlobal('ClipboardItem', MockClipboardItem)

      const mockWrite = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: { write: mockWrite },
      })

      await copyAsRichText('<p>Hello</p>', 'Test')

      expect(mockWrite).toHaveBeenCalledTimes(1)
      expect(constructorCalls).toHaveLength(1)
      // Verify ClipboardItem was created with text/html blob
      expect(constructorCalls[0]).toHaveProperty('text/html')

      vi.unstubAllGlobals()
    })
  })

  describe('triggerPrint', () => {
    it('calls window.print()', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
      triggerPrint()
      expect(printSpy).toHaveBeenCalledTimes(1)
      printSpy.mockRestore()
    })
  })
})
