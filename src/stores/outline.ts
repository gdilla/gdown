import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTabsStore } from './tabs'
import MarkdownIt from 'markdown-it'
import { markdownToHtml } from '../utils/markdownConverter'
import { copyAsRichText, copyAsPlainText, unescapeMarkdown } from '../utils/clipboardUtils'
import { flushLiveEditorState } from '../utils/flushEditorState'
import { parseFrontMatter } from '../utils/frontmatter'

export interface OutlineHeading {
  /** Unique identifier (based on position in doc) */
  id: string
  /** Heading level 1-6 */
  level: number
  /** Plain text of the heading */
  text: string
  /** WYSIWYG: ProseMirror position. Source mode: character offset in the CodeMirror doc. */
  pos: number
}

export const useOutlineStore = defineStore('outline', () => {
  /** Whether the outline panel is visible */
  const visible = ref(false)

  /** Current list of headings extracted from the editor */
  const headings = ref<OutlineHeading[]>([])

  /** Currently active heading (nearest heading above cursor) */
  const activeHeadingId = ref<string | null>(null)

  /** Minimum heading level present (for indentation normalization) */
  const minLevel = computed(() => {
    if (headings.value.length === 0) return 1
    return Math.min(...headings.value.map((h) => h.level))
  })

  /** Whether there are any headings */
  const hasHeadings = computed(() => headings.value.length > 0)

  function toggleOutline() {
    visible.value = !visible.value
  }

  function showOutline() {
    visible.value = true
  }

  function hideOutline() {
    visible.value = false
  }

  /**
   * Extract headings from a ProseMirror/TipTap editor JSON document.
   * Called whenever the document changes.
   */
  function updateHeadings(editorJson: any) {
    if (!editorJson || !editorJson.content) {
      headings.value = []
      return
    }

    const extracted: OutlineHeading[] = []
    let pos = 0

    function walkNodes(nodes: any[]) {
      for (const node of nodes) {
        if (node.type === 'heading' && node.attrs?.level) {
          const text = extractTextFromNode(node)
          if (text.trim()) {
            extracted.push({
              id: `heading-${pos}`,
              level: node.attrs.level,
              text: text.trim(),
              pos,
            })
          }
        }
        // Walk into children for nested structures
        if (node.content) {
          walkNodes(node.content)
        }
        // Advance pos (approximate — we use the index for ordering)
        pos++
      }
    }

    walkNodes(editorJson.content)
    headings.value = extracted
  }

  /**
   * Update headings from a TipTap editor instance directly.
   * More accurate positions using ProseMirror doc traversal.
   */
  function updateFromEditor(editor: any) {
    if (!editor || !editor.state?.doc) {
      headings.value = []
      return
    }

    const doc = editor.state.doc
    const extracted: OutlineHeading[] = []

    doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'heading') {
        const text = node.textContent
        if (text.trim()) {
          extracted.push({
            id: `heading-${pos}`,
            level: node.attrs.level,
            text: text.trim(),
            pos,
          })
        }
      }
    })

    headings.value = extracted
  }

  /**
   * Update headings from the source editor's full document (front matter +
   * body). `pos` is a character offset into that document.
   */
  function updateFromMarkdown(markdown: string) {
    const { body } = parseFrontMatter(markdown)
    const bodyOffset = markdown.length - body.length
    headings.value = scanHeadings(body).headings.map(({ offset, level, text }) => ({
      id: `heading-${bodyOffset + offset}`,
      level,
      text,
      pos: bodyOffset + offset,
    }))
  }

  /**
   * Set the active heading based on cursor position.
   */
  function setActiveHeading(cursorPos: number) {
    // Find the last heading before or at the cursor position
    let activeId: string | null = null
    for (const heading of headings.value) {
      if (heading.pos <= cursorPos) {
        activeId = heading.id
      } else {
        break
      }
    }
    activeHeadingId.value = activeId
  }

  function clearHeadings() {
    headings.value = []
    activeHeadingId.value = null
  }

  /**
   * Extract the markdown content for a specific section.
   * A section starts at the heading line and extends until the next heading
   * of equal or higher level (lower number), or end of document.
   */
  function getSectionContent(headingIndex: number): { markdown: string; html: string } | null {
    const tabsStore = useTabsStore()
    const markdown = tabsStore.activeTab?.editorState?.markdown
    if (!markdown || headingIndex < 0 || headingIndex >= headings.value.length) {
      return null
    }

    const { lines, headings: headingLines } = scanHeadings(markdown)

    if (headingIndex >= headingLines.length) {
      return null
    }

    const target = headingLines[headingIndex]!
    const startLine = target.line

    // Find the end: next heading with level <= target level
    let endLine = lines.length
    for (let i = headingIndex + 1; i < headingLines.length; i++) {
      if (headingLines[i]!.level <= target.level) {
        endLine = headingLines[i]!.line
        break
      }
    }

    // Trim trailing empty lines
    while (endLine > startLine + 1 && lines[endLine - 1]!.trim() === '') {
      endLine--
    }

    // Lines keep their own terminators; drop only the section's last one.
    const sectionMd = lines
      .slice(startLine, endLine)
      .join('')
      .replace(/(?:\r\n|\r|\n)$/, '')
    const cleanMd = unescapeMarkdown(sectionMd)
    const sectionHtml = markdownToHtml(cleanMd)
    return { markdown: cleanMd, html: sectionHtml }
  }

  /**
   * Copy a specific section to the clipboard.
   */
  async function copySection(
    headingIndex: number,
    format: 'markdown' | 'richtext',
  ): Promise<boolean> {
    flushLiveEditorState()
    const content = getSectionContent(headingIndex)
    if (!content) return false

    if (format === 'markdown') {
      await copyAsPlainText(content.markdown)
    } else {
      await copyAsRichText(content.html, content.markdown)
    }
    return true
  }

  /**
   * Copy the whole document to the clipboard.
   */
  async function copyWholeDocument(format: 'markdown' | 'richtext'): Promise<boolean> {
    flushLiveEditorState()
    const tabsStore = useTabsStore()
    const markdown = tabsStore.activeTab?.editorState?.markdown
    if (!markdown) return false

    const cleanMd = unescapeMarkdown(markdown)
    if (format === 'markdown') {
      await copyAsPlainText(cleanMd)
    } else {
      const html = markdownToHtml(cleanMd)
      await copyAsRichText(html, cleanMd)
    }
    return true
  }

  return {
    visible,
    headings,
    activeHeadingId,
    minLevel,
    hasHeadings,
    toggleOutline,
    showOutline,
    hideOutline,
    updateHeadings,
    updateFromEditor,
    updateFromMarkdown,
    setActiveHeading,
    clearHeadings,
    getSectionContent,
    copySection,
    copyWholeDocument,
  }
})

/**
 * Extract plain text from a ProseMirror JSON node recursively.
 */
function extractTextFromNode(node: any): string {
  if (node.type === 'text') {
    return node.text || ''
  }
  if (node.content) {
    return node.content.map((child: any) => extractTextFromNode(child)).join('')
  }
  return ''
}

// Block structure depends only on `html` (HTML blocks), so this matches the
// WYSIWYG renderer's markdown-it config in utils/markdownConverter.ts.
const blockParser = new MarkdownIt({ html: true })

/** Block-level tokens only (no inline parsing). Token `map` values are 0-based lines. */
function parseMarkdownBlocks(markdown: string): ReturnType<MarkdownIt['parse']> {
  const tokens: ReturnType<MarkdownIt['parse']> = []
  blockParser.block.parse(markdown.replace(/\r\n?/g, '\n'), blockParser, {}, tokens)
  return tokens
}

/** Lines with their terminators (\n, \r\n or a lone \r — counted as markdown-it does). */
function splitLines(markdown: string): string[] {
  return markdown.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []
}

/**
 * Find non-empty ATX and setext headings with markdown-it, so fenced code (also
 * inside lists and blockquotes), indented code and HTML blocks are skipped
 * exactly as the WYSIWYG renderer skips them. `line` is the 0-based line index
 * into `lines`; `offset` the character offset of that line in `markdown`.
 */
function scanHeadings(markdown: string): {
  lines: string[]
  headings: { line: number; offset: number; level: number; text: string }[]
} {
  const lines = splitLines(markdown)
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length
  }

  const headings: { line: number; offset: number; level: number; text: string }[] = []
  const tokens = parseMarkdownBlocks(markdown)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.type !== 'heading_open' || !token.map) continue
    const text = tokens[i + 1]?.content.trim() ?? ''
    const line = token.map[0]
    if (text)
      headings.push({
        line,
        offset: offsets[line] ?? offset,
        level: Number(token.tag.slice(1)),
        text,
      })
  }
  return { lines, headings }
}
