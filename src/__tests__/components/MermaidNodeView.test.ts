import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { defineComponent, h } from 'vue'
import mermaid from 'mermaid'
import { MermaidBlock } from '../../extensions/MermaidBlock'

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
})
