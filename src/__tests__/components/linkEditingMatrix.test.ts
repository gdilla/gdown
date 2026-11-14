/**
 * Selection shape × action matrix for both link-editing surfaces:
 * InsertLinkDialog (Cmd+K) and LinkTooltip (hover → Edit / Unlink).
 *
 * For every case: document structure (all non-text node types, in order) is
 * unchanged, no content is lost, and the new link covers exactly the intended
 * content.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { markRaw, nextTick } from 'vue'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import type { Node as PMNode } from '@tiptap/pm/model'
import { GdownLink } from '../../extensions/GdownLink'
import { GdownImage } from '../../extensions/GdownImage'
import { GdownTable, TableRow, TableCell, TableHeader } from '../../extensions/GdownTable'
import { GdownTaskList, GdownTaskItem } from '../../extensions/GdownTaskList'
import InsertLinkDialog from '../../components/InsertLinkDialog.vue'
import LinkTooltip from '../../components/LinkTooltip.vue'
import { useEditorSettingsStore } from '../../stores/editorSettings'

const OLD = 'https://old.example/'
const NEW = 'https://new.example/'

const leaf = (node: PMNode): string => (node.type.name === 'image' ? '[img]' : '\n')

function createEditor(html: string): Editor {
  return new Editor({
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
}

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
]

type DialogAction = 'url' | 'text' | 'title'

describe('InsertLinkDialog selection matrix', () => {
  let editor: Editor
  let wrapper: VueWrapper

  afterEach(() => {
    wrapper.unmount()
    editor.destroy()
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
        const selected = editor.state.doc.textBetween(from, to, '', leaf)
        const fullBefore = text(editor)

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
        } else if (replaced) {
          expect(text(editor)).toBe(before.prefix + 'NEW' + suffix)
          expect(linkedContent(editor, NEW)).toBe('NEW')
        } else {
          expect(text(editor)).toBe(fullBefore)
          expect(linkedContent(editor, NEW)).toBe(selected)
        }
        if (action === 'title') expect(linkTitle(editor, NEW)).toBe('Tip')
      })
    }
  }

  it('Cmd+K with the caret inside an existing link removes the whole link', () => {
    setup(`<p>Go <a href="${OLD}">to docs</a> now</p>`)
    editor.commands.setTextSelection(find(editor, 'docs') + 1)
    const before = { structure: structure(editor), text: text(editor) }

    editor.commands.keyboardShortcut('Mod-k')

    expect(linkedContent(editor, OLD)).toBe('')
    expect(text(editor)).toBe(before.text)
    expect(structure(editor)).toEqual(before.structure)
  })
})

// ── Tooltip ──────────────────────────────────────────────────────────

const a = (inner: string) => `<a href="${OLD}">${inner}</a>`
const tooltipShapes: Array<{ name: string; html: string; plain: boolean }> = [
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
    editor.destroy()
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
        }

        editor.commands.setTextSelection(from + 1)
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
        } else {
          expect(text(editor)).toBe(before.text)
          expect(linkedContent(editor, NEW)).toBe(before.linked)
        }
      })
    }
  }
})
