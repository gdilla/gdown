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
 * Asset URLs as produced by convertFileSrc: `asset://localhost/<encoded path>`
 * on macOS/Linux, `http(s)://asset.localhost/<encoded path>` on Windows.
 */
const ASSET_URL_RE = /^(?:asset:\/\/localhost\/|https?:\/\/asset\.localhost\/)(.+)$/

/** Decode an asset URL back to its filesystem path, or null if `src` is not one. */
function assetUrlToPath(src: string): string | null {
  const encoded = ASSET_URL_RE.exec(src)?.[1]
  if (!encoded) return null
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }

// Matches <img ... src="..." ...> tags, capturing the full tag for replacement
const IMG_SRC_RE = /(<img\b[^>]*?\bsrc=")([^"]+)(")/g

/**
 * Resolve a local image path (relative to the document, or absolute) to a
 * Tauri asset protocol URL. URLs with a scheme (http, data, blob, asset…)
 * are returned unchanged. Markdown paths are URL-encoded (`my%20pic.png`), so
 * they are decoded before convertFileSrc encodes the filesystem path.
 */
export function resolveRelativeSrc(src: string, documentDir: string): string {
  if (!src || !documentDir || /^[a-z][a-z\d+.-]*:/i.test(src) || src.startsWith('//')) return src
  let path = src.startsWith('/') ? src : `${documentDir}/${src.replace(/^\.\//, '')}`
  try {
    path = decodeURIComponent(path)
  } catch {
    // Not valid percent-encoding: use the path as written.
  }
  return convertFileSrc(path)
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

  return html.replace(IMG_SRC_RE, (match, prefix: string, src: string, suffix: string) => {
    // `src` is HTML attribute text (`a&amp;b.png`); resolve the path it names.
    const path = src.replace(
      /&(amp|lt|gt|quot|#39);/g,
      (_entity, name: string) => HTML_ENTITIES[name]!,
    )
    const assetUrl = resolveRelativeSrc(path, documentDir)
    if (assetUrl === path) return match
    // Preserve the markdown spelling of the path for the round-trip back
    return `${prefix}${assetUrl}${suffix} data-original-src="${src}"`
  })
}

/**
 * Restore the markdown image paths from resolved asset URLs.
 * 1. Images whose data-original-src still resolves to their src (markdown
 *    load path) get that exact original spelling back.
 * 2. Other asset URLs (input rules, drop, paste) are decoded to a path,
 *    relative to the document when inside its directory, else absolute.
 *
 * @param html - HTML string (from Tiptap getHTML())
 * @param documentDir - Absolute path to the document's parent directory
 * @returns HTML with markdown image paths restored
 */
export function unresolveImagePaths(html: string, documentDir: string): string {
  if (!html || !documentDir || !html.includes('<img')) return html

  const template = document.createElement('template')
  template.innerHTML = html
  for (const img of template.content.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? ''
    const originalSrc = img.getAttribute('data-original-src')
    img.removeAttribute('data-original-src')
    if (originalSrc !== null && resolveRelativeSrc(originalSrc, documentDir) === src) {
      img.setAttribute('src', originalSrc)
      continue
    }
    const path = assetUrlToPath(src)
    if (!path) continue
    const docPrefix = `${documentDir}/`
    img.setAttribute(
      'src',
      encodeURI(path.startsWith(docPrefix) ? path.slice(docPrefix.length) : path),
    )
  }
  return template.innerHTML
}
