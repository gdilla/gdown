import { describe, it, expect, vi } from 'vitest'
import {
  resolveImagePaths,
  unresolveImagePaths,
  resolveRelativeSrc,
  getDocumentDir,
} from '../../utils/imagePathResolver'

// Mock convertFileSrc to simulate Tauri's asset protocol
vi.mock('@tauri-apps/api/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@tauri-apps/api/core')
  return {
    ...actual,
    invoke: vi.fn().mockResolvedValue(''),
    convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
  }
})

describe('getDocumentDir', () => {
  it('returns directory for a file path', () => {
    expect(getDocumentDir('/Users/foo/notes/doc.md')).toBe('/Users/foo/notes')
  })

  it('returns directory for nested path', () => {
    expect(getDocumentDir('/a/b/c/file.txt')).toBe('/a/b/c')
  })

  it('returns null for empty string', () => {
    expect(getDocumentDir('')).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(getDocumentDir(null)).toBeNull()
    expect(getDocumentDir(undefined)).toBeNull()
  })
})

describe('resolveRelativeSrc', () => {
  const docDir = '/Users/foo/notes'

  it('resolves a relative path to an asset URL', () => {
    expect(resolveRelativeSrc('assets/photo.png', docDir)).toBe(
      'asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fphoto.png',
    )
  })

  it('returns absolute URLs unchanged', () => {
    expect(resolveRelativeSrc('https://example.com/img.png', docDir)).toBe(
      'https://example.com/img.png',
    )
    expect(resolveRelativeSrc('data:image/png;base64,abc', docDir)).toBe(
      'data:image/png;base64,abc',
    )
  })

  it('returns empty string unchanged', () => {
    expect(resolveRelativeSrc('', docDir)).toBe('')
  })

  it('returns src unchanged when docDir is empty', () => {
    expect(resolveRelativeSrc('assets/photo.png', '')).toBe('assets/photo.png')
  })
})

describe('resolveImagePaths', () => {
  const docDir = '/Users/foo/notes'

  it('resolves relative image src to asset URL', () => {
    const html = '<img src="assets/photo.png">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toBe(
      '<img src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fphoto.png" data-original-src="assets/photo.png">',
    )
  })

  it('resolves multiple images', () => {
    const html = '<p><img src="assets/a.png"> text <img src="assets/b.jpg"></p>'
    const result = resolveImagePaths(html, docDir)
    expect(result).toContain('data-original-src="assets/a.png"')
    expect(result).toContain('data-original-src="assets/b.jpg"')
    expect(result).toContain('asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fa.png')
    expect(result).toContain('asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fb.jpg')
  })

  it('preserves absolute http URLs', () => {
    const html = '<img src="https://example.com/photo.png">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toBe(html)
  })

  it('preserves data URLs', () => {
    const html = '<img src="data:image/png;base64,abc123">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toBe(html)
  })

  it('preserves already-resolved asset URLs', () => {
    const html = '<img src="asset://localhost/%2Fsome%2Fpath.png">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toBe(html)
  })

  it('returns html unchanged when docDir is empty', () => {
    const html = '<img src="assets/photo.png">'
    expect(resolveImagePaths(html, '')).toBe(html)
    expect(resolveImagePaths(html, null as unknown as string)).toBe(html)
  })

  it('handles images with alt and title attributes', () => {
    const html = '<img src="assets/photo.png" alt="My photo" title="A photo">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toContain('asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fphoto.png')
    expect(result).toContain('data-original-src="assets/photo.png"')
    expect(result).toContain('alt="My photo"')
    expect(result).toContain('title="A photo"')
  })

  it('handles src with subdirectories', () => {
    const html = '<img src="images/2024/photo.png">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toContain('asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fimages%2F2024%2Fphoto.png')
    expect(result).toContain('data-original-src="images/2024/photo.png"')
  })

  it('handles src with spaces (encoded)', () => {
    const html = '<img src="assets/my%20photo.png">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toContain('data-original-src="assets/my%20photo.png"')
    // The file on disk is "my photo.png": decode before convertFileSrc re-encodes
    expect(result).toContain(
      'src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fmy%20photo.png"',
    )
  })

  it('decodes only the markdown source, not a native directory with a literal %', () => {
    expect(resolveRelativeSrc('assets/a%20b.png', '/Users/me/notes%20archive')).toBe(
      'asset://localhost/%2FUsers%2Fme%2Fnotes%2520archive%2Fassets%2Fa%20b.png',
    )
    const resolved = resolveImagePaths('<img src="assets/a.png">', '/Users/me/notes%20archive')
    expect(unresolveImagePaths(resolved, '/Users/me/notes%20archive')).toBe(
      '<img src="assets/a.png">',
    )
  })

  it('resolves absolute local paths and ./ prefixes', () => {
    const result = resolveImagePaths('<img src="/Users/me/a.png"><img src="./b.png">', docDir)
    expect(result).toBe(
      '<img src="asset://localhost/%2FUsers%2Fme%2Fa.png" data-original-src="/Users/me/a.png">' +
        '<img src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fb.png" data-original-src="./b.png">',
    )
  })

  it('does not resolve blob URLs', () => {
    const html = '<img src="blob:http://localhost/abc123">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toBe(html)
  })
})

describe('unresolveImagePaths', () => {
  const docDir = '/Users/foo/notes'

  it('restores original src from data-original-src', () => {
    const html =
      '<img src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fphoto.png" data-original-src="assets/photo.png">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toBe('<img src="assets/photo.png">')
  })

  it('strips asset URL prefix when no data-original-src', () => {
    const html = '<img src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fphoto.png">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toBe('<img src="assets/photo.png">')
  })

  it('handles multiple images with mixed strategies', () => {
    const html =
      '<img src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fa.png" data-original-src="assets/a.png">' +
      '<img src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fb.jpg">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toContain('src="assets/a.png"')
    expect(result).toContain('src="assets/b.jpg"')
    expect(result).not.toContain('data-original-src')
    expect(result).not.toContain('asset://')
  })

  it('preserves non-asset images unchanged', () => {
    const html = '<img src="https://example.com/photo.png">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toBe(html)
  })

  it('preserves data URLs unchanged', () => {
    const html = '<img src="data:image/png;base64,abc123">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toBe(html)
  })

  it('returns html unchanged when docDir is empty', () => {
    const html =
      '<img src="asset://localhost/%2Fpath%2Fphoto.png" data-original-src="assets/photo.png">'
    expect(unresolveImagePaths(html, '')).toBe(html)
  })

  it('writes asset URLs outside the document dir as absolute paths', () => {
    const html = '<img src="asset://localhost/%2Fother%2Fdir%2Fassets%2Fphoto.png">'
    expect(unresolveImagePaths(html, docDir)).toBe('<img src="/other/dir/assets/photo.png">')
  })

  it('decodes asset URLs and re-encodes the markdown path', () => {
    const html = '<img src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Fmy%20pic.png">'
    expect(unresolveImagePaths(html, docDir)).toBe('<img src="assets/my%20pic.png">')
  })

  it('ignores a stale data-original-src that no longer matches src', () => {
    const html =
      '<img src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fnew.png" data-original-src="old.png">'
    expect(unresolveImagePaths(html, docDir)).toBe('<img src="new.png">')
  })
})

describe('round-trip', () => {
  const docDir = '/Users/foo/notes'

  it('resolve then unresolve preserves original HTML', () => {
    const original = '<p>Hello <img src="assets/photo.png" alt="test"> world</p>'
    const resolved = resolveImagePaths(original, docDir)
    const restored = unresolveImagePaths(resolved, docDir)
    expect(restored).toBe(original)
  })

  it('round-trips a path containing & without entity-encoding it', () => {
    const resolved = resolveImagePaths('<img src="a&amp;b.png">', docDir)
    const template = document.createElement('template')
    template.innerHTML = unresolveImagePaths(resolved, docDir)
    expect(template.content.querySelector('img')?.getAttribute('src')).toBe('a&b.png')
    expect(resolved).toContain('src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fa%26b.png"')
  })

  it('round-trips multiple images with mixed sources', () => {
    const original =
      '<img src="assets/local.png">' +
      '<img src="/abs/local.png">' +
      '<img src="./images/a%20b.png">' +
      '<img src="https://example.com/remote.png">' +
      '<img src="data:image/png;base64,abc">'
    const resolved = resolveImagePaths(original, docDir)
    const restored = unresolveImagePaths(resolved, docDir)
    expect(restored).toBe(original)
  })

  it('unresolve handles asset URLs without data-original-src (input rule path)', () => {
    // Simulates what happens when input rule resolves a path directly
    const html =
      '<img src="asset://localhost/%2FUsers%2Ffoo%2Fnotes%2Fassets%2Ftyped-image.png" alt="test">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toBe('<img src="assets/typed-image.png" alt="test">')
  })
})
