import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'

export const GdownTable = Table.configure({
  resizable: false,  // keep simple
  HTMLAttributes: { class: 'gdown-table' },
})

export { TableRow, TableCell, TableHeader }
