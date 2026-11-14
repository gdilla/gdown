import type { CommandProps, Editor } from '@tiptap/core'
import { Selection, TextSelection } from '@tiptap/pm/state'

export interface LinkAttrs {
  href: string
  title?: string | null
  target?: string | null
}

/**
 * True when the selection's text may be replaced by an edited link text: a
 * caret, or a TextSelection of plain text inside one textblock. Node, cell
 * (one range per cell) and all-document selections, and ranges holding
 * non-text inline content (e.g. an image) or spanning blocks, are only ever
 * linked in place.
 */
export function isReplaceableSelection(selection: Selection): boolean {
  if (!(selection instanceof TextSelection)) return false
  const { $from, $to } = selection
  if (!$from.parent.isTextblock || !$from.sameParent($to)) return false
  let plain = true
  $from.doc.nodesBetween($from.pos, $to.pos, (node) => {
    if (node.isInline && !node.isText) plain = false
  })
  return plain
}

/**
 * Chain command: collapse the selection to the nearest text position at the
 * end of its LAST range (a CellSelection has one range per cell, and its
 * from/to describe only one of them), so the next keystroke cannot overwrite
 * what was just (un)linked. A character typed there joins the link (the link
 * mark is inclusive, as on main).
 */
export function collapseToSelectionEnd({ tr }: CommandProps): boolean {
  const $end = tr.doc.resolve(Math.max(...tr.selection.ranges.map((range) => range.$to.pos)))
  // A text caret (Selection.near could re-select a node such as a horizontal rule).
  tr.setSelection(
    Selection.findFrom($end, -1, true) ?? Selection.findFrom($end, 1, true) ?? Selection.near($end),
  )
  return true
}

/**
 * Link `selection` (every range of it). `text` replaces the selected text only
 * when isReplaceableSelection(); otherwise the content is linked in place.
 * Replaces inline text directly: insertContentAt can rewrite the parent block
 * (e.g. turn a heading into a paragraph when the range starts the block).
 */
export function applyLink(
  editor: Editor,
  selection: Selection,
  text: string,
  attrs: LinkAttrs,
): void {
  const replaceable = isReplaceableSelection(selection)
  const { from, to, empty } = selection
  const current = replaceable ? editor.state.doc.textBetween(from, to) : ''
  if (!empty && (!replaceable || !text || text === current)) {
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setSelection(selection)
        return true
      })
      .setLink(attrs)
      .command(collapseToSelectionEnd)
      .run()
    return
  }
  if (!text || !replaceable) return
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
      tr.setSelection(TextSelection.create(tr.doc, from + text.length))
      return true
    })
    .run()
}
