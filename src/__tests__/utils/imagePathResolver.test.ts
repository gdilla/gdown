import { describe, it, expect, vi } from 'vitest'
import {
  resolveImagePaths,
  unresolveImagePaths,
  resolveRelativeSrc,
  getDocumentDir,
  isAbsoluteSrc,
} from '../../utils/imagePathResolver'

// Mock convertFileSrc to simulate Tauri's asset protocol
vi.mock('@tauri-apps/api/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@tauri-apps/api/core')
  return {
    ...actual,
    invoke: vi.fn().mockResolvedValue(''),
    convertFileSrc: vi.fn((path: string) => `http://asset.localhost/${path}`),
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

describe('isAbsoluteSrc', () => {
  it('returns true for http URLs', () => {
    expect(isAbsoluteSrc('http://example.com/img.png')).toBe(true)
    expect(isAbsoluteSrc('https://example.com/img.png')).toBe(true)
  })

  it('returns true for data URLs', () => {
    expect(isAbsoluteSrc('data:image/png;base64,abc')).toBe(true)
  })

  it('returns true for blob URLs', () => {
    expect(isAbsoluteSrc('blob:http://localhost/abc')).toBe(true)
  })

  it('returns true for absolute file paths', () => {
    expect(isAbsoluteSrc('/Users/foo/photo.png')).toBe(true)
  })

  it('returns false for relative paths', () => {
    expect(isAbsoluteSrc('assets/photo.png')).toBe(false)
    expect(isAbsoluteSrc('images/2024/photo.png')).toBe(false)
    expect(isAbsoluteSrc('photo.png')).toBe(false)
  })
})

describe('resolveRelativeSrc', () => {
  const docDir = '/Users/foo/notes'

  it('resolves a relative path to an asset URL', () => {
    expect(resolveRelativeSrc('assets/photo.png', docDir)).toBe(
      'http://asset.localhost//Users/foo/notes/assets/photo.png',
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
      '<img src="http://asset.localhost//Users/foo/notes/assets/photo.png" data-original-src="assets/photo.png">',
    )
  })

  it('resolves multiple images', () => {
    const html = '<p><img src="assets/a.png"> text <img src="assets/b.jpg"></p>'
    const result = resolveImagePaths(html, docDir)
    expect(result).toContain('data-original-src="assets/a.png"')
    expect(result).toContain('data-original-src="assets/b.jpg"')
    expect(result).toContain('http://asset.localhost//Users/foo/notes/assets/a.png')
    expect(result).toContain('http://asset.localhost//Users/foo/notes/assets/b.jpg')
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
    const html = '<img src="http://asset.localhost//some/path.png">'
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
    expect(result).toContain('http://asset.localhost//Users/foo/notes/assets/photo.png')
    expect(result).toContain('data-original-src="assets/photo.png"')
    expect(result).toContain('alt="My photo"')
    expect(result).toContain('title="A photo"')
  })

  it('handles src with subdirectories', () => {
    const html = '<img src="images/2024/photo.png">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toContain('http://asset.localhost//Users/foo/notes/images/2024/photo.png')
    expect(result).toContain('data-original-src="images/2024/photo.png"')
  })

  it('handles src with spaces (encoded)', () => {
    const html = '<img src="assets/my%20photo.png">'
    const result = resolveImagePaths(html, docDir)
    expect(result).toContain('data-original-src="assets/my%20photo.png"')
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
      '<img src="http://asset.localhost//Users/foo/notes/assets/photo.png" data-original-src="assets/photo.png">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toBe('<img src="assets/photo.png">')
  })

  it('strips asset URL prefix when no data-original-src', () => {
    const html = '<img src="http://asset.localhost//Users/foo/notes/assets/photo.png">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toBe('<img src="assets/photo.png">')
  })

  it('handles multiple images with mixed strategies', () => {
    const html =
      '<img src="http://asset.localhost//Users/foo/notes/assets/a.png" data-original-src="assets/a.png">' +
      '<img src="http://asset.localhost//Users/foo/notes/assets/b.jpg">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toContain('src="assets/a.png"')
    expect(result).toContain('src="assets/b.jpg"')
    expect(result).not.toContain('data-original-src')
    expect(result).not.toContain('asset.localhost')
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
      '<img src="http://asset.localhost//path/photo.png" data-original-src="assets/photo.png">'
    expect(unresolveImagePaths(html, '')).toBe(html)
  })

  it('does not strip asset URLs from a different document dir', () => {
    const html = '<img src="http://asset.localhost//other/dir/assets/photo.png">'
    const result = unresolveImagePaths(html, docDir)
    // Should not strip because the path doesn't start with docDir
    expect(result).toBe(html)
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

  it('round-trips multiple images with mixed sources', () => {
    const original =
      '<img src="assets/local.png">' +
      '<img src="https://example.com/remote.png">' +
      '<img src="data:image/png;base64,abc">'
    const resolved = resolveImagePaths(original, docDir)
    const restored = unresolveImagePaths(resolved, docDir)
    expect(restored).toBe(original)
  })

  it('unresolve handles asset URLs without data-original-src (input rule path)', () => {
    // Simulates what happens when input rule resolves a path directly
    const html =
      '<img src="http://asset.localhost//Users/foo/notes/assets/typed-image.png" alt="test">'
    const result = unresolveImagePaths(html, docDir)
    expect(result).toBe('<img src="assets/typed-image.png" alt="test">')
  })
})
