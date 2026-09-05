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
export function findMathRanges(text: string): MathRange[] {
  const ranges: MathRange[] = []

  // Track claimed intervals instead of allocating one Set entry per character.
  // Each regex emits matches in document order, so binary lookup keeps dense
  // math documents bounded by the number of expressions rather than text size.
  const claimed: Array<Array<{ from: number; to: number }>> = [[], [], [], []]
  const isClaimed = (position: number, beforeBucket: number) => {
    for (let bucketIndex = 0; bucketIndex < beforeBucket; bucketIndex++) {
      const bucket = claimed[bucketIndex]
      if (!bucket) continue

      let low = 0
      let high = bucket.length
      while (low < high) {
        const middle = (low + high) >> 1
        const candidate = bucket[middle]
        if (candidate && candidate.from <= position) {
          low = middle + 1
        } else {
          high = middle
        }
      }

      const candidate = bucket[low - 1]
      if (candidate && candidate.to > position) return true
    }
    return false
  }
  const claim = (bucketIndex: number, from: number, to: number) => {
    claimed[bucketIndex]?.push({ from, to })
  }

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
    claim(0, from, to)
  }

  // 2) Display math: \[...\]
  const displayBracketRe = /\\\[([\s\S]*?)\\\]/g
  while ((match = displayBracketRe.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (isClaimed(from, 1)) continue
    ranges.push({
      from,
      to,
      delimFrom: from,
      delimFromEnd: from + 2,
      delimTo: to - 2,
      delimToEnd: to,
      isBlock: true,
    })
    claim(1, from, to)
  }

  // 3) Inline math: $...$  (no leading/trailing spaces, no nested $)
  const inlineDollarRe = /\$([^\s$](?:[^$]*?[^\s$])?)\$/g
  while ((match = inlineDollarRe.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (isClaimed(from, 2)) continue
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
    claim(2, from, to)
  }

  // 4) Inline math: \(...\)
  const inlineParenRe = /\\\(([\s\S]*?)\\\)/g
  while ((match = inlineParenRe.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (isClaimed(from, 3)) continue
    ranges.push({
      from,
      to,
      delimFrom: from,
      delimFromEnd: from + 2,
      delimTo: to - 2,
      delimToEnd: to,
      isBlock: false,
    })
    claim(3, from, to)
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
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
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
