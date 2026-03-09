/**
 * CodeMirror 6 extension for math delimiter parsing and highlighting.
 * Supports:
 *   - Inline math: $...$ and \(...\)
 *   - Display/block math: $$...$$ and \[...\]
 */
import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// CSS classes for math delimiter decoration
const mathInlineDelimiterMark = Decoration.mark({ class: 'cm-math-delimiter' })
const mathInlineContentMark = Decoration.mark({ class: 'cm-math-inline' })
const mathBlockDelimiterMark = Decoration.mark({ class: 'cm-math-block-delimiter' })
const mathBlockContentMark = Decoration.mark({ class: 'cm-math-block' })

/**
 * Regex patterns for math expressions:
 * - Display math $$...$$ (can span multiple lines)
 * - Inline math $...$ (single line, no space after opening or before closing $)
 * - LaTeX \[...\] for display math
 * - LaTeX \(...\) for inline math
 */

interface MathRange {
  from: number
  to: number
  delimFrom: number
  delimFromEnd: number
  delimTo: number
  delimToEnd: number
  isBlock: boolean
}

/**
 * Find all math ranges in the document text.
 */
function findMathRanges(text: string): MathRange[] {
  const ranges: MathRange[] = []

  // Track positions that are already claimed
  const claimed = new Set<number>()

  // 1) Display math: $$...$$
  const displayDollarRe = /\$\$([\s\S]*?)\$\$/g
  let match: RegExpExecArray | null
  while ((match = displayDollarRe.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    ranges.push({
      from,
      to,
      delimFrom: from,
      delimFromEnd: from + 2,
      delimTo: to - 2,
      delimToEnd: to,
      isBlock: true,
    })
    for (let i = from; i < to; i++) claimed.add(i)
  }

  // 2) Display math: \[...\]
  const displayBracketRe = /\\\[([\s\S]*?)\\\]/g
  while ((match = displayBracketRe.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (claimed.has(from)) continue
    ranges.push({
      from,
      to,
      delimFrom: from,
      delimFromEnd: from + 2,
      delimTo: to - 2,
      delimToEnd: to,
      isBlock: true,
    })
    for (let i = from; i < to; i++) claimed.add(i)
  }

  // 3) Inline math: $...$  (no leading/trailing spaces, no nested $)
  const inlineDollarRe = /\$([^\s$](?:[^$]*?[^\s$])?)\$/g
  while ((match = inlineDollarRe.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (claimed.has(from)) continue
    // Ensure it's not part of a $$ delimiter
    if (from > 0 && text[from - 1] === '$') continue
    if (to < text.length && text[to] === '$') continue
    ranges.push({
      from,
      to,
      delimFrom: from,
      delimFromEnd: from + 1,
      delimTo: to - 1,
      delimToEnd: to,
      isBlock: false,
    })
    for (let i = from; i < to; i++) claimed.add(i)
  }

  // 4) Inline math: \(...\)
  const inlineParenRe = /\\\(([\s\S]*?)\\\)/g
  while ((match = inlineParenRe.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (claimed.has(from)) continue
    ranges.push({
      from,
      to,
      delimFrom: from,
      delimFromEnd: from + 2,
      delimTo: to - 2,
      delimToEnd: to,
      isBlock: false,
    })
    for (let i = from; i < to; i++) claimed.add(i)
  }

  // Sort by position
  ranges.sort((a, b) => a.from - b.from)
  return ranges
}

/**
 * Build decorations for math delimiters and content.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const text = view.state.doc.toString()
  const ranges = findMathRanges(text)

  for (const range of ranges) {
    const delimMark = range.isBlock ? mathBlockDelimiterMark : mathInlineDelimiterMark
    const contentMark = range.isBlock ? mathBlockContentMark : mathInlineContentMark

    // Opening delimiter
    if (range.delimFrom < range.delimFromEnd) {
      builder.add(range.delimFrom, range.delimFromEnd, delimMark)
    }
    // Content between delimiters
    if (range.delimFromEnd < range.delimTo) {
      builder.add(range.delimFromEnd, range.delimTo, contentMark)
    }
    // Closing delimiter
    if (range.delimTo < range.delimToEnd) {
      builder.add(range.delimTo, range.delimToEnd, delimMark)
    }
  }

  return builder.finish()
}

/**
 * CodeMirror ViewPlugin that decorates math delimiters and content.
 */
export const mathHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)

/**
 * Extract math expressions from text for MathJax rendering.
 */
export interface MathExpression {
  /** The LaTeX expression (without delimiters) */
  expression: string
  /** Whether this is display/block math */
  isBlock: boolean
  /** Start position in document */
  from: number
  /** End position in document */
  to: number
}

export function extractMathExpressions(text: string): MathExpression[] {
  const ranges = findMathRanges(text)
  return ranges.map((r) => ({
    expression: text.slice(r.delimFromEnd, r.delimTo),
    isBlock: r.isBlock,
    from: r.from,
    to: r.to,
  }))
}
