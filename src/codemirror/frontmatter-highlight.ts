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
import { RangeSetBuilder, type Text } from '@codemirror/state'

// Decoration marks for different YAML token types
const delimiterDeco = Decoration.mark({ class: 'cm-frontmatter-delimiter' })
const keyDeco = Decoration.mark({ class: 'cm-frontmatter-key' })
const valueDeco = Decoration.mark({ class: 'cm-frontmatter-value' })
const commentDeco = Decoration.mark({ class: 'cm-frontmatter-comment' })
const stringDeco = Decoration.mark({ class: 'cm-frontmatter-string' })
const numberDeco = Decoration.mark({ class: 'cm-frontmatter-number' })
const boolDeco = Decoration.mark({ class: 'cm-frontmatter-bool' })

/**
 * Find the closing `---` line of a front-matter block that opens on line 1.
 * Reads only the lines it needs, so typing never copies the whole document.
 * Returns the 1-based closing line number, or 0 if there is no valid block.
 */
function findFrontMatterEndLine(doc: Text): number {
  // Line 1 must be exactly `---` (optional trailing whitespace), followed by more lines
  if (doc.lines < 2 || doc.line(1).text.trimEnd() !== '---') return 0

  for (let i = 2; i <= doc.lines; i++) {
    if (doc.line(i).text.trim() === '---') return i
  }
  return 0
}

/**
 * Build decorations for the front-matter region of the document.
 */
function buildFrontMatterDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const endLine = findFrontMatterEndLine(doc)

  // Iterate over lines within the front-matter range
  for (let i = 1; i <= endLine; i++) {
    const line = doc.line(i)
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
      if (update.docChanged) {
        this.decorations = buildFrontMatterDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

/**
 * CodeMirror theme extension with styles for front-matter tokens.
 * Import and include this alongside the plugin for styled highlighting.
 */
export const frontmatterHighlightTheme = EditorView.theme({
  '.cm-frontmatter-delimiter': {
    color: 'var(--syntax-comment)',
    fontWeight: 'bold',
  },
  '.cm-frontmatter-key': {
    color: 'var(--syntax-keyword)',
    fontWeight: '500',
  },
  '.cm-frontmatter-value': {
    color: 'var(--syntax-string)',
  },
  '.cm-frontmatter-string': {
    color: 'var(--syntax-tag)',
  },
  '.cm-frontmatter-number': {
    color: 'var(--syntax-constant)',
  },
  '.cm-frontmatter-bool': {
    color: 'var(--syntax-builtin)',
    fontWeight: '500',
  },
  '.cm-frontmatter-comment': {
    color: 'var(--syntax-comment)',
    fontStyle: 'italic',
  },
})
