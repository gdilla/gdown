import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import Editor from '../../components/Editor.vue'
import { useTabsStore } from '../../stores/tabs'
import { buildRenderedBody } from '../../utils/publishDocument'

/**
 * A .md file opened from anywhere is untrusted. markdown-it runs with
 * `html: true`, so raw HTML reaches Tiptap's setContent. These tests pin the
 * guarantee that the editor schema (not markdown-it) is what strips
 * script-capable markup, through the real Editor.vue extension list.
 */

const HOSTILE_MARKDOWN = [
  '# Title',
  '<script>window.__leafPwned = 1</script>',
  '<img src="x" onerror="window.__leafPwned = 1">',
  '<svg onload="window.__leafPwned = 1"><circle r="1"/></svg>',
  '<iframe src="javascript:window.__leafPwned=1"></iframe>',
  '<object data="javascript:window.__leafPwned=1"></object>',
  '<embed src="javascript:window.__leafPwned=1">',
  '<form action="javascript:window.__leafPwned=1"><button>go</button></form>',
  '<meta http-equiv="refresh" content="0;url=javascript:window.__leafPwned=1">',
  '<base href="javascript:/">',
  '<link rel="stylesheet" href="https://attacker.example/x.css">',
  '<style>body{background:url(https://attacker.example/t)}</style>',
  '<p onclick="window.__leafPwned = 1" style="background:url(https://attacker.example/t)">para</p>',
  '[md link](javascript:window.__leafPwned=1)',
  '<a href="JaVaScRiPt:window.__leafPwned=1">mixed case</a>',
  '<a href="&#106;avascript:window.__leafPwned=1">entity</a>',
  '<a href="data:text/html,<script>window.__leafPwned=1</script>">data</a>',
  '<a href="https://example.com" onmouseover="window.__leafPwned=1">ok link</a>',
].join('\n\n')

// Kept separate: math nodes currently make editor.getHTML() throw
// ("Content hole not allowed in a leaf node spec"), so these are checked on the
// rendered node views and on the export renderer directly.
const HOSTILE_MATH = [
  '<span data-type="math-inline" data-latex="\\href{javascript:window.__leafPwned=1}{x}"></span>',
  '<div data-type="math-block" data-latex="\\href{javascript:window.__leafPwned=1}{x}"></div>',
].join('\n\n')

const SCRIPT_CAPABLE_SELECTOR = 'script, iframe, object, embed, form, meta, base, link, style'

function scriptCapableFindings(root: ParentNode): string[] {
  const findings: string[] = []
  root.querySelectorAll(SCRIPT_CAPABLE_SELECTOR).forEach((el) => findings.push(`<${el.tagName}>`))
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const value = attr.value.trim().toLowerCase()
      if (
        attr.name.toLowerCase().startsWith('on') ||
        value.startsWith('javascript:') ||
        (/^(href|src|action|data)$/.test(attr.name) && value.startsWith('data:text/html'))
      ) {
        findings.push(`${el.tagName}[${attr.name}="${attr.value}"]`)
      }
    }
  })
  return findings
}

describe('Editor with untrusted markdown', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    delete (window as unknown as Record<string, unknown>).__leafPwned
  })

  async function openUntrusted(markdown: string): Promise<TiptapEditor> {
    useTabsStore().createTab(null, markdown)
    wrapper = mount(Editor, {
      global: {
        stubs: {
          EditorContent: { template: '<div />' },
          LinkTooltip: true,
          InsertLinkDialog: true,
          FindReplace: true,
        },
      },
    })
    await nextTick()
    const editor = (wrapper.vm as unknown as { getEditor: () => TiptapEditor | null }).getEditor()
    if (!editor) throw new Error('Editor did not initialise')
    return editor
  }

  it('drops script-capable tags, event handlers and javascript: URLs from the document', async () => {
    const editor = await openUntrusted(HOSTILE_MARKDOWN)
    const serialized = document.createElement('div')
    serialized.innerHTML = editor.getHTML()

    // The safe parts of the document survive.
    expect(serialized.querySelector('h1')?.textContent).toBe('Title')
    expect(serialized.querySelector('a[href="https://example.com"]')?.textContent).toBe('ok link')

    expect(scriptCapableFindings(serialized)).toEqual([])
    expect(scriptCapableFindings(editor.view.dom)).toEqual([])
    expect(serialized.querySelector('[style]')).toBeNull()
    expect((window as unknown as Record<string, unknown>).__leafPwned).toBeUndefined()
  })

  it('renders KaTeX without trust, so \\href{javascript:} never becomes a link', async () => {
    const editor = await openUntrusted(HOSTILE_MATH)

    expect(editor.view.dom.querySelectorAll('.katex').length).toBe(2)
    expect(editor.view.dom.querySelector('a')).toBeNull()
    expect(scriptCapableFindings(editor.view.dom)).toEqual([])
  })

  it('keeps the HTML export body free of script-capable markup', async () => {
    const editor = await openUntrusted(HOSTILE_MARKDOWN)
    const body = document.createElement('div')
    body.innerHTML = await buildRenderedBody(editor.getHTML() + HOSTILE_MATH)

    expect(body.querySelectorAll('.katex').length).toBe(2)
    expect(scriptCapableFindings(body)).toEqual([])
  })
})
