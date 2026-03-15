/**
 * Image path resolution for Tauri webview.
 *
 * The Tauri webview runs at localhost:1420 (dev) or tauri://localhost (prod),
 * so relative image paths like "assets/photo.png" can't resolve to the
 * document's directory on disk. This module converts relative paths to
 * Tauri asset protocol URLs for rendering, and back to relative paths
 * for saving to markdown.
 */

import { convertFileSrc } from '@tauri-apps/api/core'

// Re-export for use in extensions
export { convertFileSrc }

/**
 * Extract the directory portion of a file path.
 * Returns null if the input is falsy.
 */
export function getDocumentDir(filePath: string | null | undefined): string | null {
  if (!filePath) return null
  const lastSlash = filePath.lastIndexOf('/')
  if (lastSlash === -1) return null
  return filePath.substring(0, lastSlash)
}

/**
 * The asset URL prefix that convertFileSrc produces on macOS.
 * Used to reverse asset URLs back to filesystem paths.
 */
const ASSET_PREFIX = 'http://asset.localhost/'

// Matches <img ... src="..." ...> tags, capturing the full tag for replacement
const IMG_SRC_RE = /(<img\b[^>]*?\bsrc=")([^"]+)(")/g

/**
 * Check whether a src value is already absolute (http, https, data, blob, asset).
 */
export function isAbsoluteSrc(src: string): boolean {
  return (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('asset:') ||
    src.startsWith('/')
  )
}

/**
 * Resolve a single relative image path to a Tauri asset protocol URL.
 * Returns the src unchanged if it's already absolute.
 */
export function resolveRelativeSrc(src: string, documentDir: string): string {
  if (!src || !documentDir || isAbsoluteSrc(src)) return src
  const absolutePath = `${documentDir}/${src}`
  return convertFileSrc(absolutePath)
}

/**
 * Resolve relative image src attributes in HTML to Tauri asset protocol URLs.
 * Adds data-original-src attribute to preserve the original relative path
 * for round-trip fidelity.
 *
 * @param html - HTML string (from markdown-it)
 * @param documentDir - Absolute path to the document's parent directory
 * @returns HTML with resolved image paths
 */
export function resolveImagePaths(html: string, documentDir: string): string {
  if (!html || !documentDir) return html

  return html.replace(IMG_SRC_RE, (_match, prefix: string, src: string, suffix: string) => {
    if (isAbsoluteSrc(src)) return _match

    // Resolve relative path to absolute filesystem path
    const assetUrl = resolveRelativeSrc(src, documentDir)

    // Preserve original src for round-trip back to markdown
    return `${prefix}${assetUrl}${suffix} data-original-src="${src}"`
  })
}

/**
 * Restore original relative image paths from resolved asset URLs.
 * Handles two cases:
 * 1. Images with data-original-src attribute (from markdown load path)
 * 2. Images with asset:// URLs but no data-original-src (from input rules, drop, paste)
 *
 * @param html - HTML string (from Tiptap getHTML())
 * @param documentDir - Absolute path to the document's parent directory
 * @returns HTML with relative image paths restored
 */
export function unresolveImagePaths(html: string, documentDir: string): string {
  if (!html || !documentDir) return html

  // Strategy 1: Restore from data-original-src attribute
  let result = html.replace(
    /<img\b([^>]*?)\bsrc="[^"]*"([^>]*?)\bdata-original-src="([^"]*)"([^>]*?)>/g,
    (_match, before: string, mid: string, originalSrc: string, after: string) => {
      const attrs = `${before}src="${originalSrc}"${mid}${after}`.replace(/\s{2,}/g, ' ').trim()
      return `<img ${attrs}>`
    },
  )

  // Strategy 2: Strip asset URL prefix for images without data-original-src
  // These come from input rules, drag-drop, paste where we resolved the URL
  // but didn't add data-original-src to the node attributes
  const assetDocPrefix = `${ASSET_PREFIX}${documentDir}/`
  if (result.includes(ASSET_PREFIX)) {
    result = result.replace(IMG_SRC_RE, (_match, prefix: string, src: string, suffix: string) => {
      if (src.startsWith(assetDocPrefix)) {
        const relativeSrc = src.substring(assetDocPrefix.length)
        return `${prefix}${relativeSrc}${suffix}`
      }
      return _match
    })
  }

  return result
}
