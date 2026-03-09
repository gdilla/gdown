/**
 * CodeMirror 6 extension for YAML front-matter syntax highlighting.
 *
 * Detects `---` delimited YAML front-matter at the start of a document
 * and applies syntax-highlighting decorations for:
 * - Delimiter lines (`---`)
 * - YAML keys (before the colon)
 * - YAML string values (after the colon)
 * - YAML comments (`# ...`)
 * - Quoted strings
 * - Numeric and boolean values
 *
 * This is a decoration-based approach (ViewPlugin) rather than a language
 * grammar, so it layers on top of the markdown language without interfering.
 */

import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// Decoration marks for different YAML token types
const delimiterDeco = Decoration.mark({ class: 'cm-frontmatter-delimiter' })
const keyDeco = Decoration.mark({ class: 'cm-frontmatter-key' })
const valueDeco = Decoration.mark({ class: 'cm-frontmatter-value' })
const commentDeco = Decoration.mark({ class: 'cm-frontmatter-comment' })
const stringDeco = Decoration.mark({ class: 'cm-frontmatter-string' })
const numberDeco = Decoration.mark({ class: 'cm-frontmatter-number' })
const boolDeco = Decoration.mark({ class: 'cm-frontmatter-bool' })

/**
 * Find the end of the front-matter block (the closing `---` line).
 * Returns the character position right after the closing delimiter line,
 * or -1 if no valid front-matter is found.
 */
function findFrontMatterRange(doc: string): { start: number; end: number } | null {
  // Must start at position 0 with `---`
  if (!doc.startsWith('---')) return null

  // Find the end of the first line
  const firstNewline = doc.indexOf('\n')
  if (firstNewline === -1) return null

  // Check that the first line is just `---` (with optional trailing whitespace)
  const firstLine = doc.slice(0, firstNewline).trim()
  if (firstLine !== '---') return null

  // Find closing `---`
  let pos = firstNewline + 1
  while (pos < doc.length) {
    const lineEnd = doc.indexOf('\n', pos)
    const line = lineEnd === -1 ? doc.slice(pos) : doc.slice(pos, lineEnd)
    const trimmed = line.trim()

    if (trimmed === '---') {
      // Found closing delimiter
      const closingEnd = lineEnd === -1 ? doc.length : lineEnd + 1
      return { start: 0, end: closingEnd }
    }

    if (lineEnd === -1) break
    pos = lineEnd + 1
  }

  return null
}

/**
 * Build decorations for the front-matter region of the document.
 */
function buildFrontMatterDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const text = doc.toString()

  const range = findFrontMatterRange(text)
  if (!range) return builder.finish()

  // Iterate over lines within the front-matter range
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    if (line.from >= range.end) break

    const lineText = line.text
    const trimmed = lineText.trim()

    // Delimiter lines (--- at start and end)
    if (trimmed === '---') {
      builder.add(line.from, line.to, delimiterDeco)
      continue
    }

    // Comment lines
    if (trimmed.startsWith('#')) {
      builder.add(line.from, line.to, commentDeco)
      continue
    }

    // Empty lines
    if (trimmed === '') continue

    // Continuation / nested lines (start with whitespace)
    if (lineText[0] === ' ' || lineText[0] === '\t') {
      // Highlight as value
      const valueStart = line.from + (lineText.length - lineText.trimStart().length)
      if (valueStart < line.to) {
        builder.add(valueStart, line.to, valueDeco)
      }
      continue
    }

    // Key-value lines: `key: value`
    const colonIdx = lineText.indexOf(':')
    if (colonIdx > 0) {
      // Key part
      builder.add(line.from, line.from + colonIdx, keyDeco)

      // Value part (after `: `)
      const valueStartOffset = colonIdx + 1
      const afterColon = lineText.slice(valueStartOffset)
      const valueTrimmed = afterColon.trim()

      if (valueTrimmed.length > 0) {
        // Find the actual start position of the value (skip whitespace after colon)
        const wsLen = afterColon.length - afterColon.trimStart().length
        const valueFrom = line.from + valueStartOffset + wsLen
        const valueTo = line.to

        if (valueFrom < valueTo) {
          // Determine value type for specific highlighting
          if (
            (valueTrimmed.startsWith('"') && valueTrimmed.endsWith('"')) ||
            (valueTrimmed.startsWith("'") && valueTrimmed.endsWith("'"))
          ) {
            builder.add(valueFrom, valueTo, stringDeco)
          } else if (/^-?\d+(\.\d+)?$/.test(valueTrimmed)) {
            builder.add(valueFrom, valueTo, numberDeco)
          } else if (/^(true|false|yes|no|null|~)$/i.test(valueTrimmed)) {
            builder.add(valueFrom, valueTo, boolDeco)
          } else {
            builder.add(valueFrom, valueTo, valueDeco)
          }
        }
      }
    }
  }

  return builder.finish()
}

/**
 * CodeMirror ViewPlugin that highlights YAML front-matter.
 */
export const frontmatterHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildFrontMatterDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildFrontMatterDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)

/**
 * CodeMirror theme extension with styles for front-matter tokens.
 * Import and include this alongside the plugin for styled highlighting.
 */
export const frontmatterHighlightTheme = EditorView.theme({
  '.cm-frontmatter-delimiter': {
    color: '#6a737d',
    fontWeight: 'bold',
  },
  '.cm-frontmatter-key': {
    color: '#d73a49',
    fontWeight: '500',
  },
  '.cm-frontmatter-value': {
    color: '#032f62',
  },
  '.cm-frontmatter-string': {
    color: '#22863a',
  },
  '.cm-frontmatter-number': {
    color: '#005cc5',
  },
  '.cm-frontmatter-bool': {
    color: '#e36209',
    fontWeight: '500',
  },
  '.cm-frontmatter-comment': {
    color: '#6a737d',
    fontStyle: 'italic',
  },
})
