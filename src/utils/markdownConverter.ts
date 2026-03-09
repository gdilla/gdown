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
    const escapedYaml = rawYaml
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    html += `<div data-type="frontmatter">${escapedYaml}</div>`
  }

  html += md.render(body)
  return html
}

// ─── HTML → Markdown (for serializing TipTap content) ─────────────────

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

// Front-matter div → YAML block with --- delimiters
turndown.addRule('frontmatter', {
  filter(node: HTMLElement) {
    return (
      node.nodeName === 'DIV' &&
      node.getAttribute('data-type') === 'frontmatter'
    )
  },
  replacement(_content: string, node: HTMLElement) {
    // Get raw text content (not the turndown-processed content which may mangle YAML)
    const rawYaml = node.textContent || ''
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

// Task list items
turndown.addRule('taskListItem', {
  filter(node: HTMLElement) {
    return (
      node.nodeName === 'LI' &&
      node.parentElement?.getAttribute('data-type') === 'taskList'
    )
  },
  replacement(content: string, node: HTMLElement) {
    const checked = node.getAttribute('data-checked') === 'true'
    const checkbox = checked ? '[x]' : '[ ]'
    // Clean up the content - remove leading newlines
    const cleaned = content.replace(/^\n+/, '').replace(/\n+$/, '')
    return `${checkbox} ${cleaned}\n`
  },
})

// Task list (ul with data-type="taskList")
turndown.addRule('taskList', {
  filter(node: HTMLElement) {
    return (
      node.nodeName === 'UL' &&
      node.getAttribute('data-type') === 'taskList'
    )
  },
  replacement(content: string) {
    // Items already formatted by taskListItem rule
    return '\n' + content + '\n'
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

/**
 * Convert HTML (from TipTap) to Markdown string.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return ''
  return turndown.turndown(html)
}
