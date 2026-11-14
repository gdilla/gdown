/**
 * Selection shape × action matrix for both link-editing surfaces:
 * InsertLinkDialog (Cmd+K) and LinkTooltip (hover → Edit / Unlink).
 *
 * For every case: document structure (all non-text node types, in order) is
 * unchanged, no content is lost, and the new link covers exactly the intended
 * content. Post-conditions (decided for every action):
 * - focus is back in the editor after confirm, cancel and Escape;
 * - the selection is collapsed at the END of the affected content (inserted or
 *   replaced text, or the end of a range linked in place / unlinked), so the
 *   next keystroke cannot overwrite it;
 * - a character typed next lands there and, like main (the link mark is
 *   inclusive), joins the new link; after Unlink it is plain text.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { markRaw, nextTick } from 'vue'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Selection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { GdownLink } from '../../extensions/GdownLink'
import { GdownImage } from '../../extensions/GdownImage'
import { GdownTable, TableRow, TableCell, TableHeader } from '../../extensions/GdownTable'
import { GdownTaskList, GdownTaskItem } from '../../extensions/GdownTaskList'
import InsertLinkDialog from '../../components/InsertLinkDialog.vue'
import LinkTooltip from '../../components/LinkTooltip.vue'
import { useEditorSettingsStore } from '../../stores/editorSettings'

const OLD = 'https://old.example/'
const NEW = 'https://new.example/'

// jsdom has no layout; ProseMirror scrolls the selection into view on focus.
beforeAll(() => {
  const rects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getClientRects = rects
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  Element.prototype.getClientRects = rects
})

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

const leaf = (node: PMNode): string => (node.type.name === 'image' ? '[img]' : '\n')

/** Editor attached to the document so focus can be asserted. */
function createEditor(html: string): Editor {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [
      // trailingNode off: it appends a paragraph on the first edit, which is not ours.
      StarterKit.configure({ link: false, trailingNode: false }),
      GdownLink,
      GdownImage,
      GdownTaskList,
      GdownTaskItem,
      GdownTable,
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: html,
  })
}

function structure(editor: Editor): string[] {
  const types: string[] = []
  editor.state.doc.descendants((node) => {
    if (!node.isText) types.push(node.type.name)
  })
  return types
}

function text(editor: Editor, from = 0, to = editor.state.doc.content.size): string {
  return editor.state.doc.textBetween(from, to, '|', leaf)
}

/** Content (text and [img]) carrying a link mark with `href`, in document order. */
function linkedContent(editor: Editor, href: string): string {
  let out = ''
  editor.state.doc.descendants((node) => {
    if (!node.isInline) return
    if (node.marks.some((mark) => mark.type.name === 'link' && mark.attrs.href === href)) {
      out += node.isText ? node.text : leaf(node)
    }
  })
  return out
}

function linkTitle(editor: Editor, href: string): string | null {
  let title: string | null = null
  editor.state.doc.descendants((node) => {
    const mark = node.marks.find((m) => m.type.name === 'link' && m.attrs.href === href)
    if (mark) title = mark.attrs.title
  })
  return title
}

function hasMark(editor: Editor, href: string, markName: string): boolean {
  let found = false
  editor.state.doc.descendants((node) => {
    if (
      node.marks.some((m) => m.type.name === 'link' && m.attrs.href === href) &&
      node.marks.some((m) => m.type.name === markName)
    )
      found = true
  })
  return found
}

/** Position of the first occurrence of `word` in a text node. */
function find(editor: Editor, word: string): number {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0 || !node.isText) return
    const index = node.text!.indexOf(word)
    if (index >= 0) at = pos + index
  })
  if (at < 0) throw new Error(`"${word}" not in document`)
  return at
}

function destroyEditor(editor: Editor): void {
  const element = editor.view.dom.parentElement
  editor.destroy()
  element?.remove()
}

/**
 * Post-condition: focus in the editor, a collapsed caret after `caretPrefix`
 * (document text up to the caret), and one typed character landing there
 * without touching anything else; `linkedAfter` is what `href` then covers.
 */
async function expectCaretThenType(
  editor: Editor,
  caretPrefix: string,
  href: string,
  linkedAfter: string,
): Promise<void> {
  await nextFrame()
  expect(editor.view.dom.contains(document.activeElement), 'focus back in the editor').toBe(true)
  const { empty, from } = editor.state.selection
  expect(empty, 'selection collapsed').toBe(true)
  expect(text(editor, 0, from), 'caret position').toBe(caretPrefix)
  const textBefore = text(editor)
  const structureBefore = structure(editor)

  editor.view.dispatch(editor.state.tr.insertText('X'))

  expect(text(editor)).toBe(caretPrefix + 'X' + textBefore.slice(caretPrefix.length))
  expect(structure(editor)).toEqual(structureBefore)
  expect(linkedContent(editor, href)).toBe(linkedAfter)
}

async function setInput(selector: string, value: string): Promise<void> {
  const input = document.body.querySelector<HTMLInputElement>(selector)!
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

function clickButton(label: string): void {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`no "${label}" button`)
  button.click()
}

// ── Dialog ───────────────────────────────────────────────────────────

type Select = (editor: Editor) => void
interface DialogShape {
  name: string
  html: string
  select: Select
  /** What the link covers when it is not simply the selected content (main's result). */
  linked?: string
  /** False when the caret ends outside any link, so a typed character stays plain. */
  typedJoinsLink?: boolean
}

/** Position of the table cell containing `label`. */
function cellPos(editor: Editor, label: string): number {
  const $pos = editor.state.doc.resolve(find(editor, label))
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (['tableCell', 'tableHeader'].includes($pos.node(depth).type.name)) return $pos.before(depth)
  }
  throw new Error(`"${label}" is not in a table cell`)
}

const selectCells =
  (make: (editor: Editor) => CellSelection): Select =>
  (editor) => {
    editor.view.dispatch(editor.state.tr.setSelection(make(editor)))
  }

const grid =
  '<table>' +
  ['1', '2', '3']
    .map(
      (row) => `<tr>${['A', 'B', 'C'].map((col) => `<td><p>${col}${row}</p></td>`).join('')}</tr>`,
    )
    .join('') +
  '</table>'

const word =
  (w: string, toWord = w): Select =>
  (editor) => {
    const from = find(editor, w)
    editor.commands.setTextSelection({ from, to: find(editor, toWord) + toWord.length })
  }
const caretIn =
  (w: string, offset: number): Select =>
  (editor) => {
    editor.commands.setTextSelection(find(editor, w) + offset)
  }

const dialogShapes: DialogShape[] = [
  { name: 'caret in plain text', html: '<p>Hello world</p>', select: caretIn('world', 0) },
  {
    name: 'caret inside bold',
    html: '<p>Hello <strong>boldword</strong> end</p>',
    select: caretIn('boldword', 4),
  },
  {
    name: 'caret inside inline code',
    html: '<p>Hello <code>codeword</code> end</p>',
    select: caretIn('codeword', 4),
  },
  { name: 'heading text at block start', html: '<h2>Alpha beta gamma</h2>', select: word('Alpha') },
  { name: 'heading text mid block', html: '<h2>Alpha beta gamma</h2>', select: word('beta') },
  { name: 'heading text at block end', html: '<h2>Alpha beta gamma</h2>', select: word('gamma') },
  {
    name: 'whole heading text',
    html: '<h2>Alpha beta gamma</h2>',
    select: word('Alpha', 'gamma'),
  },
  {
    name: 'list item text at start',
    html: '<ul><li><p>Alpha beta</p></li></ul>',
    select: word('Alpha'),
  },
  {
    name: 'blockquote text at end',
    html: '<blockquote><p>Alpha beta</p></blockquote>',
    select: word('beta'),
  },
  {
    name: 'selection spanning two blocks',
    html: '<h2>Title here</h2><p>Body text</p>',
    select: word('here', 'Body'),
  },
  {
    name: 'select all (Cmd+A)',
    html: '<h2>Title</h2><p>Body</p>',
    select: (editor) => editor.commands.selectAll(),
  },
  {
    name: 'text in a table cell',
    html: '<table><tr><td><p>Cell one</p></td><td><p>Two</p></td></tr></table>',
    select: word('Cell'),
  },
  {
    name: 'text in a task item',
    html: '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Task item</p></li></ul>',
    select: word('item'),
  },
  {
    name: 'image node selection',
    html: '<p>Hello <img src="cat.png" alt="cat"> world</p>',
    select: (editor) => editor.commands.setNodeSelection(find(editor, 'Hello') + 6),
  },
  {
    name: 'text + image mix',
    html: '<p>Hello <img src="cat.png" alt="cat"> world</p>',
    select: word('Hello', 'world'),
  },
  {
    name: 'selection across a hard break',
    html: '<p>Line one<br>Line two</p>',
    select: word('one', 'two'),
  },
  // Selection classes other than TextSelection. On main the dialog linked every
  // range of the live selection (setLink acts on selection.ranges).
  {
    name: 'CellSelection 1x2',
    html: grid,
    select: selectCells((e) =>
      CellSelection.create(e.state.doc, cellPos(e, 'A1'), cellPos(e, 'B1')),
    ),
  },
  {
    name: 'CellSelection 2x2',
    html: grid,
    select: selectCells((e) =>
      CellSelection.create(e.state.doc, cellPos(e, 'A1'), cellPos(e, 'B2')),
    ),
  },
  {
    name: 'CellSelection whole row',
    html: grid,
    select: selectCells((e) => CellSelection.rowSelection(e.state.doc.resolve(cellPos(e, 'A2')))),
  },
  {
    name: 'CellSelection whole column',
    html: grid,
    select: selectCells((e) => CellSelection.colSelection(e.state.doc.resolve(cellPos(e, 'B1')))),
  },
  {
    // A horizontal rule has no inline content: main linked nothing.
    name: 'NodeSelection on a horizontal rule',
    html: '<p>Before</p><hr><p>After</p>',
    select: (editor) =>
      editor.commands.setNodeSelection(find(editor, 'Before') + 'Before'.length + 1),
    linked: '',
    typedJoinsLink: false,
  },
]

type DialogAction = 'url' | 'text' | 'title'

describe('InsertLinkDialog selection matrix', () => {
  let editor: Editor
  let wrapper: VueWrapper

  afterEach(() => {
    wrapper.unmount()
    destroyEditor(editor)
  })

  function setup(html: string): void {
    editor = createEditor(html)
    // markRaw: Editor.vue passes a shallowRef editor; a deep reactive proxy breaks ProseMirror.
    wrapper = mount(InsertLinkDialog, { props: { editor: markRaw(editor) } })
  }

  for (const shape of dialogShapes) {
    for (const action of ['url', 'text', 'title'] as DialogAction[]) {
      it(`${shape.name} — ${action}`, async () => {
        setup(shape.html)
        shape.select(editor)
        const { from, to, empty } = editor.state.selection
        const before = { structure: structure(editor), prefix: text(editor, 0, from) }
        const suffix = text(editor, to)
        // Every range counts (a CellSelection has one per cell); the caret then
        // collapses to the nearest text position at the end of the last range.
        const ranges = [...editor.state.selection.ranges].sort((x, y) => x.$from.pos - y.$from.pos)
        const selected =
          shape.linked ??
          ranges.map((r) => editor.state.doc.textBetween(r.$from.pos, r.$to.pos, '', leaf)).join('')
        const end = Math.max(...ranges.map((r) => r.$to.pos))
        const fullBefore = text(editor)
        const upToEnd = text(
          editor,
          0,
          Selection.findFrom(editor.state.doc.resolve(end), -1, true)!.from,
        )
        const typedLinked = shape.typedJoinsLink === false ? selected : selected + 'X'

        editor.commands.keyboardShortcut('Mod-k')
        await nextTick()
        await nextTick()
        const textField = document.body.querySelector<HTMLInputElement>('#link-text')!
        expect(textField, 'dialog opens').not.toBeNull()
        // Focus must leave the editor: a disabled text field means the URL field.
        expect(document.activeElement).toBe(
          textField.disabled || textField.value
            ? document.body.querySelector('#link-url')
            : textField,
        )

        await setInput('#link-url', NEW)
        if (action === 'text' && !textField.disabled) await setInput('#link-text', 'NEW')
        if (action === 'title') await setInput('#link-title', 'Tip')
        clickButton('Insert')
        await nextTick()

        expect(structure(editor)).toEqual(before.structure)
        const replaced = action === 'text' && !textField.disabled
        if (empty) {
          const inserted = action === 'text' ? 'NEW' : NEW
          expect(text(editor)).toBe(before.prefix + inserted + suffix)
          expect(linkedContent(editor, NEW)).toBe(inserted)
          expect(hasMark(editor, NEW, 'code')).toBe(false)
          if (action === 'title') expect(linkTitle(editor, NEW)).toBe('Tip')
          await expectCaretThenType(editor, before.prefix + inserted, NEW, inserted + 'X')
        } else if (replaced) {
          expect(text(editor)).toBe(before.prefix + 'NEW' + suffix)
          expect(linkedContent(editor, NEW)).toBe('NEW')
          await expectCaretThenType(editor, before.prefix + 'NEW', NEW, 'NEWX')
        } else {
          expect(text(editor)).toBe(fullBefore)
          expect(linkedContent(editor, NEW)).toBe(selected)
          if (action === 'title' && selected) expect(linkTitle(editor, NEW)).toBe('Tip')
          await expectCaretThenType(editor, upToEnd, NEW, typedLinked)
        }
      })
    }
  }

  it('Cmd+K with the caret inside an existing link removes the whole link', async () => {
    setup(`<p>Go <a href="${OLD}">to docs</a> now</p>`)
    const caret = find(editor, 'docs') + 1
    editor.commands.setTextSelection(caret)
    const before = { structure: structure(editor), text: text(editor) }

    editor.commands.keyboardShortcut('Mod-k')

    expect(linkedContent(editor, OLD)).toBe('')
    expect(text(editor)).toBe(before.text)
    expect(structure(editor)).toEqual(before.structure)
    // The caret stays where it was; a typed character is plain text.
    await expectCaretThenType(editor, text(editor, 0, caret), OLD, '')
  })

  for (const close of ['Cancel', 'Escape'] as const) {
    it(`${close} closes without changes and returns focus and selection to the editor`, async () => {
      setup('<h2>Alpha beta gamma</h2>')
      word('beta')(editor)
      const { from, to } = editor.state.selection
      const before = editor.getJSON()

      editor.commands.keyboardShortcut('Mod-k')
      await nextTick()
      await setInput('#link-url', NEW)
      if (close === 'Cancel') clickButton('Cancel')
      else
        document.body
          .querySelector('#link-url')!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      await nextTick()
      await nextFrame()

      expect(document.body.querySelector('#link-url')).toBeNull()
      expect(editor.getJSON()).toEqual(before)
      expect(editor.view.dom.contains(document.activeElement)).toBe(true)
      expect(editor.state.selection.from).toBe(from)
      expect(editor.state.selection.to).toBe(to)
    })
  }
})

// ── Tooltip ──────────────────────────────────────────────────────────

const a = (inner: string) => `<a href="${OLD}">${inner}</a>`
const tooltipShapes: Array<{
  name: string
  html: string
  plain: boolean
  /** The editor caret is in another paragraph while the link is hovered. */
  caretElsewhere?: boolean
}> = [
  {
    // Hovering does not move the editor selection; Edit/Unlink must act on the
    // hovered link. Main acted on the editor selection instead (pre-existing bug).
    name: 'hovered link while the caret is elsewhere',
    html: `<p>Other line</p><p>Go ${a('docs')} now</p>`,
    plain: true,
    caretElsewhere: true,
  },
  { name: 'link at heading start', html: `<h2>${a('Alpha')} beta</h2>`, plain: true },
  {
    name: 'link mid list item',
    html: `<ul><li><p>Alpha ${a('beta')} gamma</p></li></ul>`,
    plain: true,
  },
  {
    name: 'link at blockquote end',
    html: `<blockquote><p>Alpha ${a('beta')}</p></blockquote>`,
    plain: true,
  },
  {
    name: 'link with bold inside',
    html: `<p>See ${a('the <strong>boldword</strong> docs')} now</p>`,
    plain: true,
  },
  {
    name: 'link in a table cell',
    html: `<table><tr><td><p>${a('Cell')} one</p></td><td><p>Two</p></td></tr></table>`,
    plain: true,
  },
  {
    name: 'link in a task item',
    html: `<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Task ${a('item')}</p></li></ul>`,
    plain: true,
  },
  {
    name: 'link wrapping an image',
    html: `<p>Hello ${a('see <img src="cat.png" alt="cat"> here')} end</p>`,
    plain: false,
  },
  {
    name: 'link across a hard break',
    html: `<p>${a('Line one<br>Line two')}</p>`,
    plain: false,
  },
]

type TooltipAction = 'url' | 'text' | 'unlink'

describe('LinkTooltip link matrix', () => {
  let editor: Editor
  let wrapper: VueWrapper

  beforeEach(() => {
    setActivePinia(createPinia())
    useEditorSettingsStore().linkMode = 'edit'
  })

  afterEach(() => {
    wrapper.unmount()
    destroyEditor(editor)
  })

  /** Range of the OLD link. */
  function oldRange(): { from: number; to: number } {
    let from = -1
    let to = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.marks.some((m) => m.type.name === 'link' && m.attrs.href === OLD)) {
        if (from < 0) from = pos
        to = pos + node.nodeSize
      }
    })
    return { from, to }
  }

  for (const shape of tooltipShapes) {
    for (const action of ['url', 'text', 'unlink'] as TooltipAction[]) {
      it(`${shape.name} — ${action}`, async () => {
        editor = createEditor(shape.html)
        wrapper = mount(LinkTooltip, { props: { editor: markRaw(editor) } })
        const { from, to } = oldRange()
        const before = {
          structure: structure(editor),
          text: text(editor),
          prefix: text(editor, 0, from),
          suffix: text(editor, to),
          linked: linkedContent(editor, OLD),
          upToEnd: text(editor, 0, to),
        }

        editor.commands.setTextSelection(
          shape.caretElsewhere ? find(editor, 'Other') + 2 : from + 1,
        )
        editor.view.dom
          .querySelector('a')!
          .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        await nextTick()

        if (action === 'unlink') {
          clickButton('Unlink')
          await nextTick()
          expect(linkedContent(editor, OLD)).toBe('')
          expect(text(editor)).toBe(before.text)
          expect(structure(editor)).toEqual(before.structure)
          await expectCaretThenType(editor, before.upToEnd, OLD, '')
          return
        }

        clickButton('Edit')
        await nextTick()
        const [urlField, textField] = Array.from(
          document.body.querySelectorAll<HTMLInputElement>('.link-edit-input'),
        )
        expect(textField!.disabled).toBe(!shape.plain)
        await setInput('.link-edit-input[type="url"]', NEW)
        if (action === 'text' && !textField!.disabled) {
          textField!.value = 'NEW'
          textField!.dispatchEvent(new Event('input'))
          await nextTick()
        }
        expect(urlField!.value).toBe(NEW)
        clickButton('Save')
        await nextTick()

        expect(structure(editor)).toEqual(before.structure)
        expect(linkedContent(editor, OLD)).toBe('')
        if (action === 'text' && shape.plain) {
          expect(text(editor)).toBe(before.prefix + 'NEW' + before.suffix)
          expect(linkedContent(editor, NEW)).toBe('NEW')
          await expectCaretThenType(editor, before.prefix + 'NEW', NEW, 'NEWX')
        } else {
          expect(text(editor)).toBe(before.text)
          expect(linkedContent(editor, NEW)).toBe(before.linked)
          await expectCaretThenType(editor, before.upToEnd, NEW, before.linked + 'X')
        }
      })
    }
  }

  for (const close of ['Cancel', 'Escape'] as const) {
    it(`${close} leaves the link unchanged and returns focus to the editor`, async () => {
      editor = createEditor(`<p>Go ${a('docs')} now</p>`)
      wrapper = mount(LinkTooltip, { props: { editor: markRaw(editor) } })
      const before = editor.getJSON()
      editor.commands.setTextSelection(find(editor, 'docs') + 1)
      editor.view.dom
        .querySelector('a')!
        .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      await nextTick()
      clickButton('Edit')
      await nextTick()
      await setInput('.link-edit-input[type="url"]', NEW)
      if (close === 'Cancel') clickButton('Cancel')
      else
        document.body
          .querySelector('.link-edit-input')!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      await nextFrame()

      expect(document.body.querySelector('.link-edit-input')).toBeNull()
      expect(editor.getJSON()).toEqual(before)
      expect(editor.view.dom.contains(document.activeElement)).toBe(true)
    })
  }
})
