import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OutlinePanel from '../../../components/sidebar/OutlinePanel.vue'
import { useTabsStore } from '../../../stores/tabs'
import { MAX_RICH_CHARS } from '../../../utils/documentLimits'

describe('OutlinePanel without headings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('suggests adding a heading to a markdown document that has none', () => {
    useTabsStore().createTab('/tmp/note.md', 'plain text')

    const text = mount(OutlinePanel).text()

    expect(text).toContain('No headings found')
    expect(text).toContain('to create headings')
  })

  // No outline is built for a source-only tab, whatever it contains: adding a
  // heading would change nothing, so do not suggest it.
  it.each([
    ['/tmp/book.md', '# Chapter\n' + 'a'.repeat(MAX_RICH_CHARS)],
    ['/tmp/data.csv', 'a,b\n'],
  ])('says the outline is unavailable for a source-only tab (%s)', (path, content) => {
    useTabsStore().createTab(path, content)

    const text = mount(OutlinePanel).text()

    expect(text).toContain('No outline for this document')
    expect(text).not.toContain('No headings found')
    expect(text).not.toContain('to create headings')
  })
})
