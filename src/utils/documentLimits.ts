/**
 * Document limits — what Leaf opens, and what it opens in the rich editor.
 *
 * Every edit costs work proportional to the whole document, on the main thread,
 * so "never sluggish" is a size limit. Both limits keep that work under ~100 ms.
 * Measured on an Apple-silicon Mac (2026-11):
 *
 *   Rich editor, per edit (editor HTML -> markdown, Chrome):
 *     100 KB 51 ms · 250 KB 132 ms · 500 KB 342 ms · 1 MB 1.0 s · 4 MB 11 s
 *   Source-only tab, per pause in typing (the statistics pass in wordCount.ts,
 *   the same for one value per line, list items and blank-line-separated blocks):
 *     1 MB 8 ms · 4 MB 32 ms
 *
 * Size only bounds work that is linear. Anything that can be quadratic is kept
 * away from source-only tabs altogether: the markdown language in CodeMirror
 * (67 s for a 4 MB CSV), the markdown-stripping word count (33 s for a 440 KB
 * CSV of `<LOD` values) and the outline's heading scan (62 s for 1 MB that
 * opens with an unclosed link-reference title).
 */

import { assembleFrontMatter } from './frontmatter'

/** Why a tab can only be shown in the source editor. */
export type SourceOnlyReason = 'plain-text' | 'too-large'

/** Larger files are not opened at all (`read_file` refuses them, given this limit). */
// ponytail: a hard cap; a read-only viewer is the upgrade path for bigger files.
export const MAX_OPEN_BYTES = 4 * 1024 * 1024

/** Longer documents (in characters) are edited in the source editor only. */
// ponytail: size is the only signal; a small file that is one enormous paragraph
// (the shape that is slowest to convert) still opens rich.
export const MAX_RICH_CHARS = 200 * 1024

/**
 * Files the rich editor may open. It rewrites what it loads as markdown — a CSV
 * comes back with its rows joined and its underscores escaped — so every other
 * file is edited as plain text.
 */
// Keep in step with SUPPORTED_EXTENSIONS in src-tauri/src/lib.rs (a test checks it).
const RICH_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'mdwn', 'mdtxt', 'txt', 'text'])

/** Why a document must stay in the source editor, or null when rich editing is available. */
export function sourceOnlyReason(
  filePath: string | null,
  contentLength: number,
): SourceOnlyReason | null {
  if (filePath !== null) {
    const name = filePath.slice(filePath.lastIndexOf('/') + 1)
    const dot = name.lastIndexOf('.')
    const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
    if (!RICH_EXTENSIONS.has(extension)) return 'plain-text'
  }
  return contentLength > MAX_RICH_CHARS ? 'too-large' : null
}

/**
 * The same decision for an existing tab, measured as the document the editors
 * are handed: front matter and its delimiters count, as they do when a file is opened.
 */
export function tabSourceOnlyReason(tab: {
  filePath: string | null
  editorState: { markdown: string; frontmatter: string | null }
}): SourceOnlyReason | null {
  const { markdown, frontmatter } = tab.editorState
  return sourceOnlyReason(tab.filePath, assembleFrontMatter(frontmatter, markdown).length)
}

/** What to tell the user when rich mode is asked for on a source-only tab. */
export function sourceOnlyNotice(title: string, reason: SourceOnlyReason): string {
  return reason === 'plain-text'
    ? `${title} is a plain-text file, so it stays in source mode.`
    : `${title} is over ${MAX_RICH_CHARS / 1024} KB, so it stays in source mode.`
}
