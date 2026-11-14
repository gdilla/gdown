import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell as BaseTableCell } from '@tiptap/extension-table-cell'
import { TableHeader as BaseTableHeader } from '@tiptap/extension-table-header'

export const GdownTable = Table.configure({
  resizable: false, // keep simple
  HTMLAttributes: { class: 'gdown-table' },
})

// GFM column alignment (`:---:`), kept as the inline text-align markdown-it emits
const alignAttribute = {
  align: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.textAlign || null,
    renderHTML: (attributes: { align?: string | null }) =>
      attributes.align ? { style: `text-align: ${attributes.align}` } : {},
  },
}

export const TableCell = BaseTableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...alignAttribute }
  },
})

export const TableHeader = BaseTableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...alignAttribute }
  },
})

export { TableRow }
