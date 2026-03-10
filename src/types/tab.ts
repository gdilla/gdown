import type { JSONContent } from '@tiptap/core'

export interface EditorState {
  /** TipTap JSON document content */
  doc: JSONContent | null
  /** Raw markdown content (body only, without front-matter) */
  markdown: string
  /** Scroll position (pixels from top) */
  scrollTop: number
  /** Cursor position as { from, to } selection */
  selection: { from: number; to: number }
  /** Raw YAML front-matter string (without --- delimiters), null if none */
  frontmatter: string | null
  /** Parsed front-matter key-value attributes (simple scalars) */
  frontmatterAttributes: Record<string, string>
}

export interface Tab {
  /** Unique tab identifier */
  id: string
  /** Display title (filename or 'Untitled') */
  title: string
  /** Full file path on disk, null for unsaved */
  filePath: string | null
  /** Whether the tab has unsaved changes */
  isModified: boolean
  /** Whether the tab has never been saved */
  isUntitled: boolean
  /** Persisted editor state for this tab */
  editorState: EditorState
  /** File type: markdown (default) or transcript (.jsonl Claude Code sessions) */
  fileType?: 'markdown' | 'transcript'
}

export function createDefaultEditorState(markdown: string = ''): EditorState {
  return {
    doc: null,
    markdown,
    scrollTop: 0,
    selection: { from: 0, to: 0 },
    frontmatter: null,
    frontmatterAttributes: {},
  }
}
