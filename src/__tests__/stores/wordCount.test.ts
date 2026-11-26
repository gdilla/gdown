import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useTabsStore } from '../../stores/tabs'
import { useWordCountStore } from '../../stores/wordCount'

describe('useWordCountStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('strips markdown syntax when counting a markdown document', () => {
    useTabsStore().createTab('/tmp/note.md', '# Title\n\nSome **bold** [link](https://example.com)')
    const store = useWordCountStore()

    store.updateStats()

    expect(store.stats.words).toBe(4)
  })

  // The markdown-stripping patterns are quadratic on text such as a CSV with
  // `<LOD` values and no `>` (3.6 s at 200 KB), so a source-only tab is counted
  // as plain whitespace-separated words.
  it('counts a source-only tab as plain text, without the markdown patterns', () => {
    useTabsStore().createTab('/tmp/data.csv', '# id,value\nsensor-1,<LOD\n[x y')
    const store = useWordCountStore()

    store.updateStats()

    // '#', 'id,value', 'sensor-1,<LOD', '[x', 'y'
    expect(store.stats.words).toBe(5)
    expect(store.stats.lines).toBe(3)
  })

  it('counts a CSV full of unclosed < quickly', () => {
    const csv = 'sensor-1,<LOD,12.5,ok\n'.repeat(20000)
    useTabsStore().createTab('/tmp/data.csv', csv)
    const store = useWordCountStore()

    const start = performance.now()
    store.updateStats()
    const elapsed = performance.now() - start

    expect(store.stats.words).toBe(20000)
    // Was 3.6 s at 200 KB (and four times that per doubling); this is 440 KB.
    expect(elapsed).toBeLessThan(1000)
  })

  it('reports every statistic for a source-only tab from one pass over the text', () => {
    // Two blocks separated by a blank line; CJK characters each count as a word.
    useTabsStore().createTab('/tmp/data.csv', 'a b\tc\n日本 d\n\n  \ne,f\n')
    const store = useWordCountStore()

    store.updateStats()

    expect(store.stats).toEqual({
      words: 7, // a, b, c, 日, 本, d, "e,f"
      characters: 19,
      charactersNoSpaces: 9,
      lines: 6,
      paragraphs: 2,
    })
  })

  // Save As can turn a markdown tab into a plain-text one (and back) without
  // changing its text or the active tab.
  it('recounts when Save As changes how the active tab is counted', async () => {
    const tabs = useTabsStore()
    const tab = tabs.createTab('/tmp/note.md', '# Title\n\n**bold** [link](https://example.com)')
    const store = useWordCountStore()
    expect(store.stats.words).toBe(3)

    tabs.setFilePath(tab.id, '/tmp/note.csv')
    await nextTick()
    // '#', 'Title', '**bold**', '[link](https://example.com)'
    expect(store.stats.words).toBe(4)

    tabs.setFilePath(tab.id, '/tmp/note.md')
    await nextTick()
    expect(store.stats.words).toBe(3)
  })
})
