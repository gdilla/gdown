import type { Editor } from '@tiptap/core'

export interface LinkAttrs {
  href: string
  title?: string | null
  target?: string | null
}

/**
 * True when [from, to] is plain text inside one block, so its text may be
 * replaced. Ranges holding non-text inline content (e.g. an image) or spanning
 * blocks are only ever linked in place.
 */
export function isPlainTextRange(editor: Editor, from: number, to: number): boolean {
  const { doc } = editor.state
  const $from = doc.resolve(from)
  // Both ends in one textblock (Cmd+A resolves both ends to the doc itself).
  if (!$from.parent.isTextblock || !$from.sameParent(doc.resolve(to))) return false
  let plain = true
  doc.nodesBetween(from, to, (node) => {
    if (node.isInline && !node.isText) plain = false
  })
  return plain
}

/**
 * Link [from, to]. `text` replaces the range's text only when the range is
 * empty or plain text in one block; otherwise the content is linked in place.
 * Replaces inline text directly: insertContentAt can rewrite the parent block
 * (e.g. turn a heading into a paragraph when the range starts the block).
 */
export function applyLink(
  editor: Editor,
  from: number,
  to: number,
  text: string,
  attrs: LinkAttrs,
): void {
  const unchanged = !text || text === editor.state.doc.textBetween(from, to)
  if (from !== to && (unchanged || !isPlainTextRange(editor, from, to))) {
    editor.chain().focus().setTextSelection({ from, to }).setLink(attrs).run()
    return
  }
  if (!text) return
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const linkType = state.schema.marks.link!
      const $from = state.doc.resolve(from)
      if (!$from.parent.type.allowsMarkType(linkType)) return false
      // Keep the surrounding formatting (e.g. bold) but drop marks that cannot
      // coexist with a link (inline code excludes it) and any previous link.
      const surrounding =
        from === to ? $from.marks() : ($from.marksAcross(state.doc.resolve(to)) ?? [])
      const marks = linkType
        .create(attrs)
        .addToSet(
          surrounding.filter(
            (mark) =>
              mark.type !== linkType &&
              !mark.type.excludes(linkType) &&
              !linkType.excludes(mark.type),
          ),
        )
      tr.replaceWith(from, to, state.schema.text(text, marks))
      return true
    })
    .run()
}
