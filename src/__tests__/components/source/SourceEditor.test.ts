import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { EditorView } from '@codemirror/view'
import { SearchQuery, setSearchQuery } from '@codemirror/search'
import SourceEditor from '../../../components/source/SourceEditor.vue'
import { useTabsStore } from '../../../stores/tabs'
import { useEditorModeStore } from '../../../stores/editorMode'
import { useOutlineStore } from '../../../stores/outline'

interface SourceEditorApi {
  openFind: () => void
  navigateToHeading: (pos: number) => void
}

describe('SourceEditor find and outline', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    useEditorModeStore().setMode('source')
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  function mountEditor(): { api: SourceEditorApi; view: EditorView } {
    wrapper = mount(SourceEditor, { attachTo: document.body })
    const dom = wrapper.element.querySelector('.cm-editor') as HTMLElement
    const view = EditorView.findFromDOM(dom)
    if (!view) throw new Error('CodeMirror view not mounted')
    return { api: wrapper.vm as unknown as SourceEditorApi, view }
  }

  it('populates the outline on mount with offsets into the shown document', () => {
    const tabsStore = useTabsStore()
    const tab = tabsStore.createTab(null, '# Body\n\n```sh\n# not a heading\n```\n\n## Next')
    tabsStore.saveEditorState(tab.id, { frontmatter: 'title: x' })
    const { view } = mountEditor()
    const doc = view.state.doc.toString()

    const outline = useOutlineStore()
    expect(outline.headings.map((h) => h.text)).toEqual(['Body', 'Next'])
    expect(outline.headings[0]!.pos).toBe(doc.indexOf('# Body'))
    expect(outline.headings[1]!.pos).toBe(doc.indexOf('## Next'))
  })

  it('refreshes the outline after edits settle, not on every keystroke', () => {
    const tabsStore = useTabsStore()
    tabsStore.createTab(null, '# One')
    const { view } = mountEditor()
    const outline = useOutlineStore()

    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n\n## Two' } })
    expect(outline.headings.map((h) => h.text)).toEqual(['One'])

    vi.advanceTimersByTime(500)
    expect(outline.headings.map((h) => h.text)).toEqual(['One', 'Two'])
  })

  it('refreshes the outline when a tab switch swaps the editor state', async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab(null, '# First')
    const second = tabsStore.createTab(null, '# Second\n\n## Child')
    tabsStore.setActiveTab(first.id)
    mountEditor()
    const outline = useOutlineStore()
    expect(outline.headings.map((h) => h.text)).toEqual(['First'])

    tabsStore.setActiveTab(second.id)
    await nextTick()
    await nextTick()

    expect(outline.headings.map((h) => h.text)).toEqual(['Second', 'Child'])
  })

  it('refreshes the outline after an external file reload', async () => {
    const tabsStore = useTabsStore()
    const tab = tabsStore.createTab(null, '# Old')
    mountEditor()
    const outline = useOutlineStore()

    tabsStore.saveEditorState(tab.id, { markdown: '# New\n\n## Added' })
    window.dispatchEvent(
      new CustomEvent('gdown:file-reloaded', {
        detail: { tabId: tab.id, markdown: '# New\n\n## Added' },
      }),
    )
    await nextTick()

    expect(outline.headings.map((h) => h.text)).toEqual(['New', 'Added'])
  })

  it('closes the search panel on tab switch and can reopen it', async () => {
    const tabsStore = useTabsStore()
    const first = tabsStore.createTab(null, 'alpha')
    const second = tabsStore.createTab(null, 'beta')
    tabsStore.setActiveTab(first.id)
    const { api } = mountEditor()
    api.openFind()
    await nextTick()
    expect(wrapper!.element.querySelector('.cm-search')).not.toBeNull()

    tabsStore.setActiveTab(second.id)
    await nextTick()
    await nextTick()
    expect(wrapper!.element.querySelector('.cm-search')).toBeNull()

    api.openFind()
    await nextTick()
    expect(wrapper!.element.querySelector('.cm-search')).not.toBeNull()
  })

  it('navigates to a heading and highlights it as the cursor moves', () => {
    const tabsStore = useTabsStore()
    tabsStore.createTab(null, '# One\n\ntext\n\n## Two\n\nmore')
    const { api, view } = mountEditor()
    const outline = useOutlineStore()
    const two = outline.headings[1]!

    api.navigateToHeading(two.pos)

    expect(view.state.selection.main.head).toBe(two.pos)
    expect(outline.activeHeadingId).toBe(two.id)

    view.dispatch({ selection: { anchor: 2 } })
    expect(outline.activeHeadingId).toBe(outline.headings[0]!.id)
  })

  it('clamps navigation to the document length', () => {
    const tabsStore = useTabsStore()
    tabsStore.createTab(null, '# One')
    const { api, view } = mountEditor()

    api.navigateToHeading(9999)

    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })

  it('opens the CodeMirror search panel with replace controls', async () => {
    const tabsStore = useTabsStore()
    tabsStore.createTab(null, 'alpha beta alpha')
    const { api } = mountEditor()

    api.openFind()
    await nextTick()

    const panel = wrapper!.element.querySelector('.cm-search')
    expect(panel).not.toBeNull()
    expect(panel!.querySelector('input[name="replace"]')).not.toBeNull()
  })

  it("selects every match with the panel's all button; capture keeps the main range", async () => {
    const tabsStore = useTabsStore()
    const tab = tabsStore.createTab(null, 'alpha beta alpha')
    const { api, view } = mountEditor()
    api.openFind()
    await nextTick()
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'alpha' })) })

    const all = wrapper!.element.querySelector(
      '.cm-search button[name="select"]',
    ) as HTMLButtonElement | null
    all!.click()

    expect(view.state.selection.ranges.map((r) => [r.from, r.to])).toEqual([
      [0, 5],
      [11, 16],
    ])
    const main = view.state.selection.main
    window.dispatchEvent(new Event('gdown:capture-state'))
    expect(tab.editorState.selection).toEqual({ from: main.from, to: main.to })
    expect(tab.editorState.markdown).toBe('alpha beta alpha')
  })

  it('clears its outline and pending refresh on unmount', () => {
    const tabsStore = useTabsStore()
    tabsStore.createTab(null, '# One')
    const { view } = mountEditor()
    const outline = useOutlineStore()

    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n## Two' } })
    wrapper!.unmount()
    wrapper = undefined
    vi.advanceTimersByTime(500)

    expect(outline.headings).toEqual([])
    expect(outline.activeHeadingId).toBeNull()
  })
})
