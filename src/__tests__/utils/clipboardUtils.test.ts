import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copyAsRichText, copyAsPlainText, unescapeMarkdown } from '../../utils/clipboardUtils'

// Polyfill ClipboardItem for jsdom
if (typeof globalThis.ClipboardItem === 'undefined') {
  globalThis.ClipboardItem = class ClipboardItem {
    private _items: Record<string, Blob>
    constructor(items: Record<string, Blob>) {
      this._items = items
    }
    get types(): string[] {
      return Object.keys(this._items)
    }
    async getType(type: string): Promise<Blob> {
      const blob = this._items[type]
      if (!blob) throw new Error(`Type ${type} not found`)
      return blob
    }
  } as unknown as typeof ClipboardItem
}

describe('clipboardUtils', () => {
  beforeEach(() => {
    // Reset clipboard mocks before each test
    vi.restoreAllMocks()
  })

  describe('copyAsRichText', () => {
    it('writes both text/html and text/plain MIME types', async () => {
      const writeMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: { write: writeMock, writeText: vi.fn() },
      })

      await copyAsRichText('<p>Hello</p>', 'Hello')

      expect(writeMock).toHaveBeenCalledTimes(1)
      const items = writeMock.mock.calls[0]![0] as ClipboardItem[]
      expect(items).toHaveLength(1)

      const item = items[0]!
      expect(item.types).toContain('text/html')
      expect(item.types).toContain('text/plain')

      const htmlBlob = await item.getType('text/html')
      expect(await htmlBlob.text()).toBe('<p>Hello</p>')

      const textBlob = await item.getType('text/plain')
      expect(await textBlob.text()).toBe('Hello')
    })
  })

  describe('copyAsPlainText', () => {
    it('writes text via writeText', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: { write: vi.fn(), writeText: writeTextMock },
      })

      await copyAsPlainText('# Hello World')

      expect(writeTextMock).toHaveBeenCalledTimes(1)
      expect(writeTextMock).toHaveBeenCalledWith('# Hello World')
    })

    it('unescapes Turndown backslashes before copying', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: { write: vi.fn(), writeText: writeTextMock },
      })

      await copyAsPlainText('\\# Hello \\- World')

      expect(writeTextMock).toHaveBeenCalledWith('# Hello - World')
    })
  })

  describe('unescapeMarkdown', () => {
    it('removes Turndown backslash escapes', () => {
      expect(unescapeMarkdown('\\# Heading')).toBe('# Heading')
      expect(unescapeMarkdown('\\- list item')).toBe('- list item')
      expect(unescapeMarkdown('\\> blockquote')).toBe('> blockquote')
      expect(unescapeMarkdown('\\[link\\](url)')).toBe('[link](url)')
    })

    it('preserves legitimate backslashes', () => {
      expect(unescapeMarkdown('path\\to\\file')).toBe('path\\to\\file')
      expect(unescapeMarkdown('no escapes here')).toBe('no escapes here')
    })

    it('handles double backslash (escaped backslash)', () => {
      expect(unescapeMarkdown('\\\\')).toBe('\\')
    })
  })
})
