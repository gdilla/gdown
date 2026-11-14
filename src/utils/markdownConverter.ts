/**
 * Markdown ↔ HTML conversion utilities for document state synchronization
 * between WYSIWYG (TipTap/ProseMirror) and Source (CodeMirror) modes.
 *
 * - WYSIWYG → Source: TipTap HTML → Markdown via Turndown
 * - Source → WYSIWYG: Markdown → HTML via markdown-it
 */

import TurndownService from 'turndown'
import MarkdownIt from 'markdown-it'
import { parseFrontMatter, assembleFrontMatter } from './frontmatter'

// ─── Markdown → HTML (for loading into TipTap) ───────────────────────

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
})

// Enable GFM strikethrough
md.enable('strikethrough')

// Link bare URLs (https://…, www.…) and emails, but never bare filenames such
// as CLAUDE.md: fuzzy domain matching treats ".md" as a top-level domain.
md.linkify.set({ fuzzyLink: false })

/**
 * Inline math `$latex$`, with Pandoc's rules: the LaTeX must not start or end
 * with whitespace and the closing `$` must not be followed by a digit, so
 * prices like "$5 and $10" stay text. `\$` stays a literal dollar.
 */
const INLINE_MATH = /\$([^\s$](?:[^$]*[^\s$\\])?)\$(?!\d)/
const INLINE_MATH_AT = new RegExp(INLINE_MATH.source, 'y')

md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) return false
  if (state.src.charCodeAt(state.pos + 1) === 0x24) {
    // A `$$` inside a paragraph is literal text, not two inline delimiters.
    if (!silent) state.pending += '$$'
    state.pos += 2
    return true
  }
  INLINE_MATH_AT.lastIndex = state.pos
  const match = INLINE_MATH_AT.exec(state.src)
  if (!match) return false
  if (!silent) state.push('math_inline', 'span', 0).content = match[1]!
  state.pos += match[0].length
  return true
})

/** Block math: a `$$` line, the LaTeX lines, and a closing `$$` line (or `$$latex$$` on one line). */
md.block.ruler.before(
  'fence',
  'math_block',
  (state, startLine, endLine, silent) => {
    if (state.sCount[startLine]! - state.blkIndent >= 4) return false
    const first = state.src.slice(
      state.bMarks[startLine]! + state.tShift[startLine]!,
      state.eMarks[startLine]!,
    )
    if (!first.startsWith('$$')) return false
    const rest = first.slice(2).trim()

    let latex: string
    let closeLine = startLine
    if (rest.length >= 2 && rest.endsWith('$$')) {
      latex = rest.slice(0, -2)
    } else if (rest === '') {
      do closeLine++
      while (
        closeLine < endLine &&
        state.src
          .slice(state.bMarks[closeLine]! + state.tShift[closeLine]!, state.eMarks[closeLine]!)
          .trimEnd() !== '$$'
      )
      if (closeLine >= endLine) return false
      latex = state.getLines(startLine + 1, closeLine, state.blkIndent, false).replace(/\n$/, '')
    } else {
      return false
    }

    if (silent) return true
    const token = state.push('math_block', 'div', 0)
    token.block = true
    token.content = latex
    token.map = [startLine, closeLine + 1]
    state.line = closeLine + 1
    return true
  },
  { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
)

md.renderer.rules.math_inline = (tokens, idx) => {
  const latex = md.utils.escapeHtml(tokens[idx]!.content)
  return `<span data-type="math-inline" data-latex="${latex}">${latex}</span>`
}
md.renderer.rules.math_block = (tokens, idx) => {
  const latex = md.utils.escapeHtml(tokens[idx]!.content)
  return `<div data-type="math-block" data-latex="${latex}">${latex}</div>\n`
}

const TASK_MARKER = /^\[([ xX])\](?=\s|$)\s?/

/**
 * Lists: record tight/loose on every list (`data-tight`) so the serializer can
 * write it back, and turn a bullet list whose items ALL start with `[ ]` or
 * `[x]` into the editor's task list (`data-type="taskList"`). This is the GFM
 * task-list extension, which markdown-it does not ship.
 */
md.core.ruler.push('gfm_lists', (state) => {
  const tokens = state.tokens
  tokens.forEach((list, i) => {
    if (list.type !== 'bullet_list_open' && list.type !== 'ordered_list_open') return
    const closeType = list.type.replace('_open', '_close')
    const items: number[] = []
    let tight = true
    for (let j = i + 1; j < tokens.length; j++) {
      const token = tokens[j]!
      if (token.level === list.level && token.type === closeType) break
      if (token.level === list.level + 1 && token.type === 'list_item_open') items.push(j)
      if (token.level === list.level + 2 && token.type === 'paragraph_open' && !token.hidden)
        tight = false
    }
    list.attrSet('data-tight', String(tight))
    if (list.type !== 'bullet_list_open') return

    const inlines = items.map((j) =>
      tokens[j + 1]?.type === 'paragraph_open' ? tokens[j + 2] : undefined,
    )
    if (!inlines.every((inline) => inline?.type === 'inline' && TASK_MARKER.test(inline.content)))
      return
    list.attrSet('data-type', 'taskList')
    items.forEach((j, k) => {
      const inline = inlines[k]!
      tokens[j]!.attrSet('data-type', 'taskItem')
      tokens[j]!.attrSet('data-checked', String(inline.content[1] !== ' '))
      inline.content = inline.content.replace(TASK_MARKER, '')
      const text = inline.children?.[0]
      if (text?.type === 'text') text.content = text.content.replace(TASK_MARKER, '')
    })
  })
})

/**
 * Convert raw Markdown string to HTML for TipTap consumption.
 * Extracts YAML front-matter and wraps it in a special div for the
 * FrontMatter TipTap extension to parse.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return ''

  const { hasFrontMatter, rawYaml, body } = parseFrontMatter(markdown)

  let html = ''

  // If front-matter exists, render it as a special div that the FrontMatter node can parse
  if (hasFrontMatter && rawYaml) {
    // Escape HTML entities in the YAML content
    const escapedYaml = rawYaml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Turndown collapses whitespace in ordinary HTML text nodes. Keep an
    // encoded copy on the transient node so multiline YAML survives a rich
    // mode round-trip byte-for-byte.
    html += `<div data-type="frontmatter" data-raw-yaml="${encodeURIComponent(rawYaml)}">${escapedYaml}</div>`
  }

  html += md.render(body)
  return html
}

// ─── HTML → Markdown (for serializing TipTap content) ─────────────────

/** Markdown for a math node, or null when `node` is not one. */
function mathMarkdown(node: HTMLElement): string | null {
  const type = node.getAttribute('data-type')
  if (type !== 'math-inline' && type !== 'math-block') return null
  const latex = node.getAttribute('data-latex') ?? node.textContent ?? ''
  return type === 'math-inline' ? `$${latex}$` : `\n\n$$\n${latex}\n$$\n\n`
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
})

/**
 * Escape text only where it would otherwise be re-read as markdown syntax, so
 * ordinary prose (snake_case, "2 * 3", "[1]", C:\path, "a < b") is written as
 * it was typed. Turndown's default escapes every `_`, `*`, `[`, `]` and `\`.
 */
turndown.escape = (text: string): string => {
  const escaped = text
    .replace(/\\(?=[!-/:-@[-`{-~]|$)/g, '\\\\') // a backslash that would escape the next char
    .replace(/(?<!\s)\*|\*(?!\s)/g, '\\*') // `*` unless spaced on both sides
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_') // `_` unless intraword
    .replace(/`/g, '\\`')
    .replace(/\[(?=[^\]]*\][([:])/g, '\\[') // `[` only when it would open a link
    .replace(/<(?=[A-Za-z/!?])/g, '\\<') // `<` only when it would open raw HTML
    .replace(/~~/g, '\\~\\~')
  return INLINE_MATH.test(text) ? escaped.replace(/\$/g, '\\$') : escaped
}

/** Escape paragraph lines that would otherwise reload as a list, heading or quote. */
function escapeLineStarts(markdown: string): string {
  return markdown
    .replace(/^([-+])(?=\s|$)|^-(?=-+\s*$)/gm, (marker) => `\\${marker}`)
    .replace(/^#(?=#{0,5}(?:\s|$))/gm, '\\#')
    .replace(/^>/gm, '\\>')
    .replace(/^(\d{1,9})([.)])(?=\s|$)/gm, '$1\\$2')
}

/** The <li> a block sits in: its parent, or the <li> around a task item's content <div>. */
function owningListItem(node: HTMLElement): HTMLElement | null {
  const parent = node.parentElement
  if (parent?.nodeName === 'LI') return parent
  if (
    parent?.nodeName === 'DIV' &&
    parent.parentElement?.getAttribute('data-type') === 'taskItem'
  ) {
    return parent.parentElement
  }
  return null
}

/**
 * Tight unless the source list was loose (`data-tight="false"`) or an item
 * holds several paragraphs, which only a loose list can express.
 */
function isTightList(list: Element | null): boolean {
  if (!list || list.getAttribute('data-tight') === 'false') return false
  return Array.from(list.children).every((item) => {
    const blocks =
      item.getAttribute('data-type') === 'taskItem' ? item.querySelector(':scope > div') : item
    return (blocks?.querySelectorAll(':scope > p').length ?? 0) <= 1
  })
}

turndown.addRule('math', {
  filter: (node) => mathMarkdown(node) !== null,
  replacement: (_content, node) => mathMarkdown(node as HTMLElement) ?? '',
})

turndown.addRule('paragraph', {
  filter: 'p',
  replacement(content: string, node: HTMLElement) {
    const text = node.closest('td, th') ? content : escapeLineStarts(content)
    const item = owningListItem(node)
    return item && isTightList(item.parentElement) ? `\n${text}\n` : `\n\n${text}\n\n`
  },
})

turndown.addRule('list', {
  filter: ['ul', 'ol'],
  replacement(content: string, node: HTMLElement) {
    if (owningListItem(node) && !node.nextElementSibling) return `\n${content}`
    return `\n\n${content}\n\n`
  },
})

// `- item`, `1. item`, `- [x] item`; continuation lines and nested lists are
// indented by the marker width, as CommonMark requires.
turndown.addRule('listItem', {
  filter: 'li',
  replacement(content: string, node: HTMLElement) {
    const list = node.parentElement
    let marker = '-'
    if (list?.nodeName === 'OL') {
      const start = Number(list.getAttribute('start') ?? 1)
      marker = `${start + Array.prototype.indexOf.call(list.children, node)}.`
    }
    const indent = ' '.repeat(marker.length + 1)
    if (node.getAttribute('data-type') === 'taskItem') {
      marker += node.getAttribute('data-checked') === 'true' ? ' [x]' : ' [ ]'
    }
    const body = content
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
      .replace(/\n(?=[^\n])/g, `\n${indent}`)
    const separator = node.nextElementSibling ? (isTightList(list) ? '\n' : '\n\n') : ''
    return (body ? `${marker} ${body}` : marker) + separator
  },
})

// A task item renders as <li><label><input></label><div>content</div></li>
turndown.addRule('taskItemParts', {
  filter: (node) =>
    node.parentElement?.getAttribute('data-type') === 'taskItem' &&
    (node.nodeName === 'LABEL' || node.nodeName === 'DIV'),
  replacement: (content: string, node: HTMLElement) => (node.nodeName === 'DIV' ? content : ''),
})

turndown.addRule('blockquote', {
  filter: 'blockquote',
  replacement(content: string) {
    const quoted = content
      .replace(/^\n+|\n+$/g, '')
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n')
    return `\n\n${quoted}\n\n`
  },
})

// A link whose text is its own target was a bare URL (or a fuzzy autolink /
// email the editor linked while typing): write the bare text back.
turndown.addRule('link', {
  filter: (node) => node.nodeName === 'A' && !!node.getAttribute('href'),
  replacement(content: string, node: HTMLElement) {
    const href = node.getAttribute('href') ?? ''
    const text = node.textContent ?? ''
    const title = node.getAttribute('title')
    const plainText = node.childNodes.length === 1 && node.firstChild?.nodeType === 3
    if (!title && plainText && [text, `http://${text}`, `mailto:${text}`].includes(href))
      return text
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
    return `[${content}](${href.replace(/([()])/g, '\\$1')}${titlePart})`
  },
})

// Front-matter div → YAML block with --- delimiters
turndown.addRule('frontmatter', {
  filter(node: HTMLElement) {
    return node.nodeName === 'DIV' && node.getAttribute('data-type') === 'frontmatter'
  },
  replacement(_content: string, node: HTMLElement) {
    // Get raw text content (not the turndown-processed content which may mangle YAML)
    const encodedYaml = node.getAttribute('data-raw-yaml')
    let rawYaml = node.textContent || ''
    if (encodedYaml) {
      try {
        rawYaml = decodeURIComponent(encodedYaml)
      } catch {
        // Fall back to the visible node text for malformed external HTML.
      }
    }
    if (!rawYaml.trim()) return ''
    return assembleFrontMatter(rawYaml, '')
  },
})

// Custom rules to improve round-trip fidelity

// Strikethrough
turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement(content: string) {
    return `~~${content}~~`
  },
})

// Highlight/mark
turndown.addRule('highlight', {
  filter: ['mark'],
  replacement(content: string) {
    return `==${content}==`
  },
})

// Underline (non-standard but Typora supports it)
turndown.addRule('underline', {
  filter: ['u'],
  replacement(content: string) {
    return `<u>${content}</u>`
  },
})

// Subscript
turndown.addRule('subscript', {
  filter: ['sub'],
  replacement(content: string) {
    return `~${content}~`
  },
})

// Superscript
turndown.addRule('superscript', {
  filter: ['sup'],
  replacement(content: string) {
    return `^${content}^`
  },
})

// GFM tables — serialize TipTap table HTML back to pipe-table markdown
turndown.addRule('tableCell', {
  filter: ['th', 'td'],
  replacement(content: string) {
    return ` ${content.trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|')} |`
  },
})

const ALIGN_SEPARATOR: Record<string, string> = { left: ':---', center: ':---:', right: '---:' }

turndown.addRule('tableRow', {
  filter: 'tr',
  replacement(content: string, node: HTMLElement) {
    const row = `|${content.trimEnd()}\n`
    // GFM's header row is the table's first row; the editor puts it in <tbody>.
    if (node.closest('table')?.querySelector('tr') !== node) return row
    const separator = Array.from(node.children)
      .map((cell) => ` ${ALIGN_SEPARATOR[(cell as HTMLElement).style.textAlign] ?? '---'} |`)
      .join('')
    return `${row}|${separator}\n`
  },
})

turndown.addRule('table', {
  filter: 'table',
  replacement(content: string) {
    return `\n\n${content.trimEnd()}\n\n`
  },
})

// Suppress thead/tbody/tfoot wrappers — handled by tableRow
turndown.addRule('tableSection', {
  filter: ['thead', 'tbody', 'tfoot'],
  replacement(content: string) {
    return content
  },
})

/**
 * Convert HTML (from TipTap) to Markdown string.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return ''
  const markdown = turndown.turndown(html)
  // Files end with a newline, like the markdown they were loaded from.
  return markdown ? `${markdown}\n` : ''
}
