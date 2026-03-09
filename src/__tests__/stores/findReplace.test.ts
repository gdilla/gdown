import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFindReplaceStore } from '../../stores/findReplace'

describe('useFindReplaceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has correct default state', () => {
    const store = useFindReplaceStore()

    expect(store.visible).toBe(false)
    expect(store.showReplace).toBe(false)
    expect(store.searchQuery).toBe('')
    expect(store.replaceQuery).toBe('')
    expect(store.caseSensitive).toBe(false)
    expect(store.useRegex).toBe(false)
    expect(store.matchCount).toBe(0)
    expect(store.currentMatchIndex).toBe(-1)
  })

  it('open() makes panel visible', () => {
    const store = useFindReplaceStore()

    store.open()

    expect(store.visible).toBe(true)
    expect(store.showReplace).toBe(false)
  })

  it('open(true) shows replace panel', () => {
    const store = useFindReplaceStore()

    store.open(true)

    expect(store.visible).toBe(true)
    expect(store.showReplace).toBe(true)
  })

  it('close() resets everything', () => {
    const store = useFindReplaceStore()

    store.open(true)
    store.searchQuery = 'test'
    store.replaceQuery = 'replaced'
    store.setMatchInfo(5, 2)

    store.close()

    expect(store.visible).toBe(false)
    expect(store.showReplace).toBe(false)
    expect(store.searchQuery).toBe('')
    expect(store.replaceQuery).toBe('')
    expect(store.matchCount).toBe(0)
    expect(store.currentMatchIndex).toBe(-1)
  })

  it('toggleCaseSensitive flips the flag', () => {
    const store = useFindReplaceStore()

    expect(store.caseSensitive).toBe(false)

    store.toggleCaseSensitive()
    expect(store.caseSensitive).toBe(true)

    store.toggleCaseSensitive()
    expect(store.caseSensitive).toBe(false)
  })

  it('toggleRegex flips the flag', () => {
    const store = useFindReplaceStore()

    expect(store.useRegex).toBe(false)

    store.toggleRegex()
    expect(store.useRegex).toBe(true)

    store.toggleRegex()
    expect(store.useRegex).toBe(false)
  })

  it('setMatchInfo updates count and index', () => {
    const store = useFindReplaceStore()

    store.setMatchInfo(10, 3)

    expect(store.matchCount).toBe(10)
    expect(store.currentMatchIndex).toBe(3)
  })

  describe('matchDisplay', () => {
    it('shows empty string when no search query', () => {
      const store = useFindReplaceStore()

      expect(store.matchDisplay).toBe('')
    })

    it('shows "No results" when query has no matches', () => {
      const store = useFindReplaceStore()

      store.searchQuery = 'something'
      store.setMatchInfo(0, -1)

      expect(store.matchDisplay).toBe('No results')
    })

    it('shows correct format with matches', () => {
      const store = useFindReplaceStore()

      store.searchQuery = 'test'
      store.setMatchInfo(5, 1)

      expect(store.matchDisplay).toBe('2 of 5')
    })

    it('shows "1 of 1" for single match', () => {
      const store = useFindReplaceStore()

      store.searchQuery = 'unique'
      store.setMatchInfo(1, 0)

      expect(store.matchDisplay).toBe('1 of 1')
    })
  })
})
