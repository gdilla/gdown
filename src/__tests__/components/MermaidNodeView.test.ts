import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { defineComponent, h } from 'vue'
import mermaid from 'mermaid'
import { openUrl } from '@tauri-apps/plugin-opener'
import { MermaidBlock } from '../../extensions/MermaidBlock'

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}))

// Pie charts need no SVG layout measurement, so real Mermaid renders them under jsdom.
const PIE = 'pie title Pets\n  "Dogs": 3\n  "Cats": 2'

describe('MermaidNodeView', () => {
  let editor: Editor | undefined
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    editor?.destroy()
    wrapper = undefined
    editor = undefined
    document.documentElement.removeAttribute('data-theme')
    vi.restoreAllMocks()
  })

  function mountDiagram(code: string): VueWrapper {
    const Harness = defineComponent({
      setup() {
        const instance = new Editor({
          extensions: [StarterKit.configure({ codeBlock: false }), MermaidBlock],
          content: `<pre><code class="language-mermaid">${code}</code></pre>`,
        })
        editor = instance
        return () => h(EditorContent, { editor: instance })
      },
    })
    wrapper = mount(Harness)
    return wrapper
  }

  function lastInitConfig(spy: ReturnType<typeof vi.spyOn>) {
    return spy.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined
  }

  it('renders with securityLevel strict and the light Mermaid theme by default', async () => {
    const init = vi.spyOn(mermaid, 'initialize')
    document.documentElement.setAttribute('data-theme', 'github')
    const mounted = mountDiagram(PIE)

    await vi.waitFor(() => {
      expect(mounted.find('.mermaid-svg-container svg').exists()).toBe(true)
    })
    expect(lastInitConfig(init)).toMatchObject({ securityLevel: 'strict', theme: 'default' })
  })

  it.each(['dark', 'solarized-dark'])(
    'uses the dark Mermaid theme for the %s app theme',
    async (theme) => {
      const init = vi.spyOn(mermaid, 'initialize')
      document.documentElement.setAttribute('data-theme', theme)
      const mounted = mountDiagram(PIE)

      await vi.waitFor(() => {
        expect(mounted.find('.mermaid-svg-container svg').exists()).toBe(true)
      })
      expect(lastInitConfig(init)).toMatchObject({ securityLevel: 'strict', theme: 'dark' })
    },
  )

  it('re-renders with the new Mermaid theme when the app theme changes', async () => {
    const init = vi.spyOn(mermaid, 'initialize')
    const render = vi.spyOn(mermaid, 'render')
    document.documentElement.setAttribute('data-theme', 'light')
    const mounted = mountDiagram(PIE)
    await vi.waitFor(() => {
      expect(mounted.find('.mermaid-svg-container svg').exists()).toBe(true)
    })
    const rendersBefore = render.mock.calls.length

    document.documentElement.setAttribute('data-theme', 'dark')

    await vi.waitFor(() => {
      expect(render.mock.calls.length).toBeGreaterThan(rendersBefore)
    })
    expect(lastInitConfig(init)).toMatchObject({ securityLevel: 'strict', theme: 'dark' })
  })

  describe('links inside a rendered diagram', () => {
    // `click A href "…"` output; flowcharts cannot lay out under jsdom, so the
    // SVG Mermaid emits for them is stubbed here.
    const LINKED_SVG =
      '<svg><a href="https://example.com/docs"><text>web</text></a>' +
      '<a xlink:href="https://example.com/legacy" xmlns:xlink="http://www.w3.org/1999/xlink"><text>legacy</text></a>' +
      '<a href="file:///etc/passwd"><text>file</text></a></svg>'

    async function mountLinked(): Promise<VueWrapper> {
      vi.mocked(openUrl).mockClear()
      vi.spyOn(mermaid, 'render').mockResolvedValue({
        svg: LINKED_SVG,
        diagramType: 'flowchart-v2',
      })
      const mounted = mountDiagram('graph TD\n  A --> B')
      await vi.waitFor(() => {
        expect(mounted.find('.mermaid-svg-container a').exists()).toBe(true)
      })
      return mounted
    }

    function clickLink(mounted: VueWrapper, text: string, init: MouseEventInit = {}): MouseEvent {
      const link = mounted.findAll('.mermaid-svg-container a').find((a) => a.text() === text)
      if (!link) throw new Error(`no link ${text}`)
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
      link.element.querySelector('text')!.dispatchEvent(event)
      return event
    }

    it('never lets a plain click navigate the app webview', async () => {
      const mounted = await mountLinked()
      const event = clickLink(mounted, 'web')
      expect(event.defaultPrevented).toBe(true)
      expect(openUrl).not.toHaveBeenCalled()
    })

    it('opens http(s) links in the system browser on Cmd/Ctrl+click', async () => {
      const mounted = await mountLinked()
      expect(clickLink(mounted, 'web', { metaKey: true }).defaultPrevented).toBe(true)
      expect(clickLink(mounted, 'legacy', { ctrlKey: true }).defaultPrevented).toBe(true)
      expect(vi.mocked(openUrl).mock.calls).toEqual([
        ['https://example.com/docs'],
        ['https://example.com/legacy'],
      ])
    })

    it('ignores non-http(s) schemes', async () => {
      const mounted = await mountLinked()
      const event = clickLink(mounted, 'file', { metaKey: true })
      expect(event.defaultPrevented).toBe(true)
      expect(openUrl).not.toHaveBeenCalled()
    })
  })
})
