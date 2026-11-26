import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildStandaloneHtml,
  collectThemeCss,
  buildRenderedBody,
  copyAsRichText,
  printDocument,
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

    // The collector copies any rule that mentions an editor class, and the app's
    // `@media print` block does. In an exported file there is no #print-root, so
    // its "hide everything else" rule would print a blank page.
    it('leaves the app-only print rules out of an exported document', () => {
      // Vitest blanks `.css` imports, so read the real stylesheet from disk.
      const fs = (
        globalThis as unknown as {
          process: {
            getBuiltinModule(id: 'node:fs'): { readFileSync(p: string, e: 'utf8'): string }
          }
        }
      ).process.getBuiltinModule('node:fs')
      const appCss = fs.readFileSync('src/style.css', 'utf8')
      // jsdom cannot compute styles from the whole stylesheet; the print block is the part under test.
      const printBlock = appCss.slice(appCss.indexOf('@media print {'), appCss.indexOf('@page {'))
      expect(printBlock).toContain('#print-root .math-block')
      const style = document.createElement('style')
      style.textContent = `.gdown-editor { color: black; }\n${printBlock}`
      document.head.appendChild(style)
      try {
        const css = collectThemeCss()
        expect(css).toContain('.gdown-editor')
        expect(css).not.toContain('#print-root')
      } finally {
        style.remove()
      }
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

  describe('buildRenderedBody mermaid', () => {
    const PIE = 'pie title Pets\n  "Dogs": 3\n  "Cats": 2'

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('renders mermaid with securityLevel strict', async () => {
      const { default: mermaid } = await import('mermaid')
      const init = vi.spyOn(mermaid, 'initialize')

      const result = await buildRenderedBody(`<pre class="mermaid">${PIE}</pre>`)

      expect(result).toContain('<svg')
      expect(init.mock.calls[init.mock.calls.length - 1]?.[0]).toMatchObject({
        securityLevel: 'strict',
      })
    })

    // What the editor serialises a diagram as (MermaidBlock.renderHTML).
    it('renders the editor’s mermaid-block markup as a diagram, not as code', async () => {
      const { default: mermaid } = await import('mermaid')
      const init = vi.spyOn(mermaid, 'initialize')

      const result = await buildRenderedBody(
        `<p>Before</p><pre class="mermaid-block" data-language="mermaid"><code class="language-mermaid">${PIE}</code></pre>`,
      )

      expect(result).toContain('<svg')
      // The diagram replaces the code block: no <pre> chrome around it.
      expect(result).not.toContain('<pre')
      expect(result).not.toContain('language-mermaid')
      expect(init.mock.calls[init.mock.calls.length - 1]?.[0]).toMatchObject({
        securityLevel: 'strict',
      })
    })

    it('drops form controls and image maps from a rendered diagram, as the editor does', async () => {
      const { default: mermaid } = await import('mermaid')
      vi.spyOn(mermaid, 'render').mockResolvedValue({
        svg: '<svg><foreignObject><form action="https://example.com"><input name="q"><button>Go</button></form><map><area href="https://example.com"></map><span>Label</span></foreignObject></svg>',
        diagramType: 'flowchart',
      })

      const result = await buildRenderedBody(
        `<pre class="mermaid-block"><code class="language-mermaid">${PIE}</code></pre>`,
      )

      expect(result).toContain('Label')
      expect(result).not.toMatch(/<(form|input|button|map|area)\b/)
    })

    it('leaves the code in place, and no stray container, when a diagram does not parse', async () => {
      const before = document.body.children.length

      const result = await buildRenderedBody(
        '<pre class="mermaid-block"><code class="language-mermaid">not a diagram ::: {{{</code></pre>',
      )

      expect(result).toContain('not a diagram')
      expect(document.body.children.length).toBe(before)
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

  describe('printDocument', () => {
    let printSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    })

    afterEach(() => {
      printSpy.mockRestore()
      Array.from(document.body.children)
        .filter((el) => el.id === 'print-root')
        .forEach((el) => el.remove())
    })

    it('renders the document into the print root, then prints', async () => {
      await printDocument({ html: '<h1>Title</h1><p>Body</p>' })

      const root = document.getElementById('print-root')
      expect(root?.parentElement).toBe(document.body)
      // The exported-document classes give it the editor rules and light palette.
      expect(root?.className).toBe('gdown-editor content')
      expect(root?.innerHTML).toBe('<h1>Title</h1><p>Body</p>')
      expect(printSpy).toHaveBeenCalledTimes(1)
    })

    it('prints source text literally, never parsing it as HTML', async () => {
      const source = '# Title\n\n<img src=x onerror="alert(1)">'
      await printDocument({ text: source })

      const root = document.getElementById('print-root')
      expect(root?.querySelector('img')).toBeNull()
      expect(root?.querySelector('pre.print-source')?.textContent).toBe(source)
      expect(printSpy).toHaveBeenCalledTimes(1)
    })

    it('replaces the previous document instead of stacking print roots', async () => {
      await printDocument({ html: '<p>First</p>' })
      await printDocument({ html: '<p>Second</p>' })

      expect(document.querySelectorAll('#print-root')).toHaveLength(1)
      expect(document.getElementById('print-root')?.innerHTML).toBe('<p>Second</p>')
    })

    // WebKit never settles decode() for an image that is not displayed, so the
    // print root (display: none on screen) has to wait on load/error instead.
    it.each(['load', 'error'])('prints once a pending image fires %s', async (eventName) => {
      const prototype = HTMLImageElement.prototype as { decode?: () => Promise<void> }
      const originalDecode = prototype.decode
      prototype.decode = () => new Promise(() => {})
      const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get')
      complete.mockReturnValue(false)
      try {
        const printing = printDocument({ html: '<p><img src="a.png"></p>' })
        const image = await vi.waitFor(() => {
          const img = document.querySelector('#print-root img')
          expect(img).not.toBeNull()
          return img!
        })
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(printSpy).not.toHaveBeenCalled()

        image.dispatchEvent(new Event(eventName))
        await printing
        expect(printSpy).toHaveBeenCalledTimes(1)
      } finally {
        complete.mockRestore()
        prototype.decode = originalDecode
      }
    })

    // Seen live: WebKit held back the load event while the window was in the background.
    it('prints anyway when an image never finishes loading', async () => {
      const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get')
      complete.mockReturnValue(false)
      vi.useFakeTimers()
      try {
        const printing = printDocument({ html: '<p><img src="a.png"></p>' })
        await vi.advanceTimersByTimeAsync(2999)
        expect(printSpy).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        await printing
        expect(printSpy).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
        complete.mockRestore()
      }
    })

    // The editor serialises images as loading="lazy", and a lazy image in the
    // hidden print root never starts loading.
    it('loads the printed copy of every image eagerly', async () => {
      await printDocument({ html: '<p><img loading="lazy" src="a.png"><img src="b.png"></p>' })

      const images = Array.from(document.querySelectorAll('#print-root img'))
      expect(images.map((img) => img.getAttribute('loading'))).toEqual(['eager', 'eager'])
    })

    it('uses its own print root, not a document element that claims the id', async () => {
      // A diagram label can carry id="print-root" into the editor DOM.
      const decoy = document.createElement('span')
      decoy.id = 'print-root'
      document.body.prepend(decoy)
      try {
        await printDocument({ html: '<p>Mine</p>' })

        expect(decoy.innerHTML).toBe('')
        // Not looked up by id here either: with two, an id lookup finds the decoy.
        const roots = Array.from(document.body.children).filter((el) => el.tagName === 'DIV')
        expect(roots.map((el) => el.innerHTML)).toContain('<p>Mine</p>')
      } finally {
        decoy.remove()
      }
    })

    it('rejects when the native print command is refused', async () => {
      // On macOS Tauri replaces window.print with an IPC call that returns a promise.
      printSpy.mockImplementation((() =>
        Promise.reject('webview.print not allowed')) as unknown as () => void)

      await expect(printDocument({ html: '<p>x</p>' })).rejects.toBe('webview.print not allowed')
    })
  })

  describe('print permission', () => {
    it('grants the webview print command that window.print() uses on macOS', () => {
      const fs = (
        globalThis as unknown as {
          process: {
            getBuiltinModule(id: 'node:fs'): { readFileSync(p: string, e: 'utf8'): string }
          }
        }
      ).process.getBuiltinModule('node:fs')
      const capability = JSON.parse(
        fs.readFileSync('src-tauri/capabilities/default.json', 'utf8'),
      ) as { permissions: string[] }

      expect(capability.permissions).toContain('core:webview:allow-print')
    })
  })
})
