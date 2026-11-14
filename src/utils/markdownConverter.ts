/**
 * Markdown ↔ HTML conversion utilities for document state synchronization
 * between WYSIWYG (TipTap/ProseMirror) and Source (CodeMirror) modes.
 *
 * - WYSIWYG → Source: TipTap HTML → Markdown via Turndown
 * - Source → WYSIWYG: Markdown → HTML via markdown-it
 */

import TurndownService from 'turndown'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
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
 * prices like "$5 and $10" stay text. `\$` outside math stays a literal
 * dollar; inside, backslash pairs (`\$`, `\\`) are part of the LaTeX.
 */
const WHOLE_INLINE_MATH =
  /^\$((?:[^\s$\\]|\\[\s\S])(?:(?:[^$\\]|\\[\s\S])*(?:[^\s$\\]|\\[\s\S]))?)\$$/
const INLINE_MATH_AT =
  /\$((?:[^\s$\\]|\\[\s\S])(?:(?:[^$\\]|\\[\s\S])*(?:[^\s$\\]|\\[\s\S]))?)\$(?!\d)/y

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
    // A list item must start with a paragraph in the editor schema, so `- $$x$$`
    // stays text in its item instead of being hoisted out of the list.
    const previous = state.tokens[state.tokens.length - 1]
    if (previous?.type === 'list_item_open' && previous.map?.[0] === startLine) return false
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
      do {
        closeLine++
        // Never search past the end of the enclosing list item or blockquote.
        if (
          closeLine >= endLine ||
          (state.sCount[closeLine]! < state.blkIndent && !state.isEmpty(closeLine))
        ) {
          return false
        }
      } while (
        state.src
          .slice(state.bMarks[closeLine]! + state.tShift[closeLine]!, state.eMarks[closeLine]!)
          .trimEnd() !== '$$'
      )
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

// markdown-it renders image alt text from `text` tokens only, so an escaped
// character in alt (`![scan\]](…)`) would be dropped; treat it as text.
md.core.ruler.push('image_alt_escapes', (state) => {
  for (const block of state.tokens) {
    for (const token of block.children ?? []) {
      if (token.type !== 'image') continue
      for (const child of token.children ?? []) {
        if (child.type === 'text_special') child.type = 'text'
      }
    }
  }
})

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
  const latex = node.getAttribute('data-latex') ?? ''
  if (type === 'math-block') return `${blockGap(node)}$$\n${latex}\n$$${blockGap(node)}`
  // Edge whitespace cannot be written (`$ x $` is not math) unless it is an
  // escaped space (`5 \\ `); keep the LaTeX as is when only that form parses.
  const inline = [latex.trim(), latex].find((candidate) => WHOLE_INLINE_MATH.test(`$${candidate}$`))
  if (inline === undefined) return `$${latex.trim()}$`
  // A `$` followed by a digit does not close math (Pandoc rule, so "$5 and
  // $10" stays text); an empty HTML comment keeps `$x$2` as math and loads as nothing.
  return /^\d/.test(node.nextSibling?.textContent ?? '') ? `$${inline}$<!---->` : `$${inline}$`
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
  // Code spans keep their exact spacing (Turndown collapses it by default).
  preformattedCode: true,
})

/**
 * Escape text only where it would otherwise be re-read as markdown syntax, so
 * ordinary prose (snake_case, "2 * 3", "[1]", C:\path, "a < b") is written as
 * it was typed. Turndown's default escapes every `_`, `*`, `[`, `]` and `\`.
 */
turndown.escape = (text: string): string =>
  text
    .replace(/\\(?=[!-/:-@[-`{-~]|$)/g, '\\\\') // a backslash that would escape the next char
    .replace(/(?<!\s)\*|\*(?!\s)/g, '\\*') // `*` unless spaced on both sides
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_') // `_` unless intraword
    .replace(/`/g, '\\`')
    .replace(/<(?=[A-Za-z/!?])/g, '\\<') // `<` only when it would open raw HTML
    .replace(/~~/g, '\\~\\~')
    // `$`, `[`, `]`, a trailing `!` (before a link) and the `:` of an unlinked
    // `scheme://` can change meaning with their surroundings: mark them and
    // decide on the whole document (resolveLiterals).
    .replace(/\$/g, LITERAL_DOLLAR)
    .replace(/\[/g, LITERAL_OPEN)
    .replace(/]/g, LITERAL_CLOSE)
    .replace(/!$/, LITERAL_BANG)
    .replace(/:(?=\/\/)/g, LITERAL_COLON)

const LITERAL_DOLLAR = '\uE000'
const LITERAL_OPEN = '\uE001'
const LITERAL_CLOSE = '\uE002'
const LITERAL_BANG = '\uE003'
const LITERAL_COLON = '\uE004'
const LITERALS = /[\uE000-\uE004]/
const writeLiterals = (escapeClose: boolean, plain: boolean) => (markdown: string) =>
  markdown
    .replace(/\uE000/g, plain ? '$' : '\\$')
    .replace(/\uE001/g, plain ? '[' : '\\[')
    .replace(/\uE002/g, escapeClose ? '\\]' : ']')
    .replace(/\uE003/g, plain ? '!' : '\\!')
    .replace(/\uE004/g, plain ? ':' : '\\:')
const plainLiterals = writeLiterals(false, true)
// `]` only needs escaping inside a link label; try the lighter form first.
const openersEscaped = writeLiterals(false, false)
const escapedLiterals = writeLiterals(true, false)
const LITERAL_FORMS = [plainLiterals, openersEscaped, escapedLiterals]

/**
 * Everything the loader builds from `markdown`: every token's type, attributes
 * (link targets, task-list markers, tightness) and parsed text, so two inputs
 * compare equal only when they load as the same document.
 */
function loadedSyntax(markdown: string): string {
  const describe = (token: Token): string => {
    const attrs = token.attrs ? JSON.stringify(token.attrs) : ''
    // `inline`/`image` content is raw source (escapes differ); their children are compared.
    const content = token.type === 'inline' || token.type === 'image' ? '' : token.content
    const children = token.children ? `[${token.children.map(describe).join(' ')}]` : ''
    return `${token.type}${attrs}:${content}${children}`
  }
  return md.parse(markdown, {}).map(describe).join('\n')
}

/**
 * Write literal `$`, `[` and `]` bare unless that would reload as math or a link
 * (e.g. `\$5 for **one** and 10\$`, `fn[a[0]](x)`). Bare is kept when the
 * loader builds the same blocks, links and math as from the fully escaped
 * text; otherwise decide per line, and escape everything as a last resort.
 */
function resolveLiterals(markdown: string): string {
  if (!LITERALS.test(markdown)) return markdown
  const target = loadedSyntax(escapedLiterals(markdown))
  const plain = plainLiterals(markdown)
  if (loadedSyntax(plain) === target) return plain
  const perLine = markdown
    .split('\n')
    .map((line) => {
      if (!LITERALS.test(line)) return line
      const lineTarget = loadedSyntax(escapedLiterals(line))
      const form = LITERAL_FORMS.find((write) => loadedSyntax(write(line)) === lineTarget)
      return (form ?? escapedLiterals)(line)
    })
    .join('\n')
  if (loadedSyntax(perLine) === target) return perLine
  const lighter = openersEscaped(markdown)
  return loadedSyntax(lighter) === target ? lighter : escapedLiterals(markdown)
}

/** Escape paragraph lines that would otherwise reload as a list, heading or quote. */
function escapeLineStarts(markdown: string): string {
  return (
    markdown
      .replace(/^([-+])(?=\s|$)|^-(?=-+\s*$)/gm, (marker) => `\\${marker}`)
      .replace(/^#(?=#{0,5}(?:\s|$))/gm, '\\#')
      .replace(/^>/gm, '\\>')
      .replace(/^(\d{1,9})([.)])(?=\s|$)/gm, '$1\\$2')
      // A line of `=` after a hard break would turn the line above into a heading.
      .replace(/\n(=+)(?=[ \t]*(?:\n|$))/g, '\n\\$1')
  )
}

/**
 * A link or image destination: as written when markdown reads it back
 * unchanged (no spaces or angle brackets, balanced parentheses), else `<…>`.
 */
function markdownDestination(url: string): string {
  let depth = 0
  for (const char of url) {
    if (char === '(') depth++
    else if (char === ')' && --depth < 0) break
  }
  if (depth === 0 && !/[\s<>\\]/.test(url)) return url
  return `<${url.replace(/[<>\\]/g, '\\$&')}>`
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

// Per-list facts, computed once per list so serialization stays linear.
const listTightness = new WeakMap<Element, boolean>()
const listMarkers = new WeakMap<Element, string>()
const itemNumbers = new WeakMap<Element, number>()

/**
 * Child elements via sibling links. Indexing an HTMLCollection is O(n) per
 * access in jsdom, which made long lists quadratic.
 */
function childElements(parent: Element | null | undefined): Element[] {
  const children: Element[] = []
  for (let child = parent?.firstElementChild; child; child = child.nextElementSibling) {
    children.push(child)
  }
  return children
}

/**
 * Tight unless the source list was loose (`data-tight="false"`) or an item
 * holds several paragraphs, which only a loose list can express.
 */
function isTightList(list: Element | null): boolean {
  if (!list) return false
  let tight = listTightness.get(list)
  if (tight === undefined) {
    tight =
      list.getAttribute('data-tight') !== 'false' &&
      childElements(list).every((item) => {
        const blocks =
          item.getAttribute('data-type') === 'taskItem'
            ? childElements(item).find((child) => child.nodeName === 'DIV')
            : item
        return childElements(blocks).filter((child) => child.nodeName === 'P').length <= 1
      })
    listTightness.set(list, tight)
  }
  return tight
}

/** Blank line between blocks, or a single newline inside a tight list item. */
function blockGap(node: HTMLElement): string {
  const item = owningListItem(node)
  return item && isTightList(item.parentElement) ? '\n' : '\n\n'
}

/**
 * `-`/`.` normally; `*`/`)` for a list directly after one of the same kind,
 * since CommonMark only starts a new list when the marker changes.
 */
function listMarker(list: Element): string {
  let marker = listMarkers.get(list)
  if (marker === undefined) {
    const [usual, alternate] = list.nodeName === 'OL' ? ['.', ')'] : ['-', '*']
    let previous = list.previousElementSibling
    // Empty paragraphs serialize to nothing, so they do not separate lists.
    while (previous?.nodeName === 'P' && !previous.textContent && !previous.firstElementChild) {
      previous = previous.previousElementSibling
    }
    marker =
      previous?.nodeName === list.nodeName && listMarker(previous) === usual ? alternate : usual
    listMarkers.set(list, marker)
  }
  return marker
}

function itemNumber(list: Element, item: Element): number {
  if (!itemNumbers.has(item)) {
    const start = Number(list.getAttribute('start') ?? 1)
    childElements(list).forEach((child, index) => itemNumbers.set(child, start + index))
  }
  return itemNumbers.get(item) ?? 1
}

turndown.addRule('math', {
  filter: (node) => mathMarkdown(node) !== null,
  replacement: (_content, node) => mathMarkdown(node as HTMLElement) ?? '',
})

turndown.addRule('paragraph', {
  filter: 'p',
  replacement(content: string, node: HTMLElement) {
    const text = node.closest('td, th') ? content : escapeLineStarts(content)
    return `${blockGap(node)}${text}${blockGap(node)}`
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
    let marker = list ? listMarker(list) : '-'
    if (list?.nodeName === 'OL') marker = `${itemNumber(list, node)}${marker}`
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

// Alt text is inline markdown and the destination ends at `)` or a space:
// escape the one and wrap the other when needed.
turndown.addRule('image', {
  filter: 'img',
  replacement(_content: string, node: HTMLElement) {
    const src = node.getAttribute('src')
    if (!src) return ''
    const alt = turndown.escape(node.getAttribute('alt') ?? '')
    const title = node.getAttribute('title')
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
    return `![${alt}](${markdownDestination(src)}${titlePart})`
  },
})

turndown.addRule('heading', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement(content: string, node: HTMLElement) {
    const hashes = '#'.repeat(Number(node.nodeName.charAt(1)))
    // A trailing run of `#` would be read as the heading's closing sequence.
    const text = content.replace(/(^|\s)(#+)\s*$/, '$1\\$2')
    return `\n\n${text ? `${hashes} ${text}` : hashes}\n\n`
  },
})

turndown.addRule('codeBlock', {
  filter: (node) => node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE',
  replacement(_content: string, node: HTMLElement) {
    const code = node.firstChild as HTMLElement
    const language = /language-(\S+)/.exec(code.getAttribute('class') ?? '')?.[1] ?? ''
    const text = code.textContent ?? ''
    const longestRun = Math.max(0, ...Array.from(text.matchAll(/^`{3,}/gm), (m) => m[0].length))
    const fence = '`'.repeat(Math.max(3, longestRun + 1))
    const gap = blockGap(node)
    const body = text.replace(EMPTY_BLOCK, '').replace(/\n$/, '')
    return `${gap}${fence}${language}\n${body ? `${body}\n` : ''}${fence}${gap}`
  },
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

/**
 * Whether markdown-it's linkify turns `text`, followed by the next word as it
 * will be written, back into this exact link with that word as plain text.
 */
function relinksAs(text: string, href: string, followingText: string): boolean {
  const following = /^\S*/.exec(followingText)?.[0] ?? ''
  const template = document.createElement('template')
  // The following word may still get its `[`, `]`, `$` escaped later
  // (resolveLiterals), so both spellings must leave the link unchanged.
  return [plainLiterals, escapedLiterals].every((write) => {
    template.innerHTML = md.renderInline(text + write(turndown.escape(following)))
    const [link, ...rest] = Array.from(template.content.childNodes)
    return (
      link?.nodeName === 'A' &&
      (link as Element).getAttribute('href') === href &&
      link.textContent === text &&
      rest.every((node) => node.nodeType === 3) &&
      rest.map((node) => node.textContent).join('') === following
    )
  })
}

// A bare URL or email loads as a link whose text is its target. Write it back
// bare only when the loader rebuilds the identical link from the bare text in
// this position; otherwise keep the explicit [text](href) form.
turndown.addRule('link', {
  filter: (node) => node.nodeName === 'A' && !!node.getAttribute('href'),
  replacement(content: string, node: HTMLElement) {
    const href = node.getAttribute('href') ?? ''
    const text = node.textContent ?? ''
    const title = node.getAttribute('title')
    const { previousSibling: previous, nextSibling: next } = node
    const bareCandidate =
      !title &&
      node.childNodes.length === 1 &&
      node.firstChild?.nodeType === 3 &&
      (!previous || (previous.nodeType === 3 && /[\s(]$/.test(previous.textContent ?? ''))) &&
      (!next || next.nodeType === 3)
    if (bareCandidate && relinksAs(text, href, next?.textContent ?? '')) return text
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
    return `[${content}](${markdownDestination(href)}${titlePart})`
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
    const separator = childElements(node)
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
const EMPTY_BLOCK = '\uE00F'

/**
 * Prepare editor HTML for Turndown, which drops empty elements (deleting an
 * empty list item, quote, heading or code block and merging what surrounds
 * it) and moves edge whitespace of an element's text outside its markdown.
 * Empty blocks get a marker so they serialize as `-`, `>`, `#` or an empty
 * fence; math text (the LaTeX is read from data-latex) is replaced by the
 * marker so a LaTeX ending in `\ ` gains no space. Markers are removed after.
 */
function prepareForTurndown(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  for (const math of template.content.querySelectorAll('[data-latex]')) {
    math.textContent = EMPTY_BLOCK
  }
  for (const element of template.content.querySelectorAll(
    'li, blockquote, li > p, li > div > p, blockquote > p, h1, h2, h3, h4, h5, h6, pre > code',
  )) {
    if (!element.textContent && !element.querySelector('img, input, hr, br, [data-latex]')) {
      const p = element.nodeName === 'LI' || element.nodeName === 'BLOCKQUOTE'
      if (!p || !element.firstElementChild) element.append(EMPTY_BLOCK)
    }
  }
  return template.content
}

export function htmlToMarkdown(html: string): string {
  if (!html) return ''
  const converted = turndown.turndown(prepareForTurndown(html)).replace(/ ?\uE00F/g, '')
  const markdown = resolveLiterals(converted)
  // Files end with a newline, like the markdown they were loaded from.
  return markdown ? `${markdown}\n` : ''
}
