import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface OutlineHeading {
  /** Unique identifier (based on position in doc) */
  id: string
  /** Heading level 1-6 */
  level: number
  /** Plain text of the heading */
  text: string
  /** ProseMirror node position (for scrolling) */
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
    return Math.min(...headings.value.map(h => h.level))
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
   * Update headings from raw markdown text (for source mode).
   */
  function updateFromMarkdown(markdown: string) {
    if (!markdown) {
      headings.value = []
      return
    }

    const extracted: OutlineHeading[] = []
    const lines = markdown.split('\n')
    let charPos = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        const level = match[1]!.length
        const text = match[2]!.replace(/\s*#+\s*$/, '').trim() // Remove trailing hashes
        if (text) {
          extracted.push({
            id: `heading-${charPos}`,
            level,
            text,
            pos: charPos,
          })
        }
      }
      charPos += line!.length + 1 // +1 for newline
    }

    headings.value = extracted
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
