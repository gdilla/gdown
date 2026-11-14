import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FindReplace from '../../components/FindReplace.vue'
import { useFindReplaceStore } from '../../stores/findReplace'

describe('FindReplace panel', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  function mountPanel(withReplace = false) {
    const store = useFindReplaceStore()
    store.open(withReplace)
    wrapper = mount(FindReplace, { attachTo: document.body })
    return { store, wrapper }
  }

  async function type(w: VueWrapper, value: string) {
    await w.find('input.find-input').setValue(value)
  }

  it('debounces search-as-you-type', async () => {
    const { wrapper: w } = mountPanel()
    await type(w, 'f')
    await type(w, 'fo')
    await type(w, 'foo')
    expect(w.emitted('search')).toBeUndefined()

    vi.advanceTimersByTime(150)
    expect(w.emitted('search')).toEqual([['foo', false, false]])
  })

  it('Enter searches immediately when a search is pending', async () => {
    const { wrapper: w } = mountPanel()
    await type(w, 'foo')
    await w.find('input.find-input').trigger('keydown', { key: 'Enter' })

    expect(w.emitted('search')).toEqual([['foo', false, false]])
    expect(w.emitted('next')).toBeUndefined()
    vi.advanceTimersByTime(500)
    expect(w.emitted('search')).toHaveLength(1)

    await w.find('input.find-input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('next')).toHaveLength(1)
  })

  it('Shift+Enter goes to the previous match only', async () => {
    const { wrapper: w } = mountPanel()
    await w.find('input.find-input').trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(w.emitted('prev')).toHaveLength(1)
    expect(w.emitted('next')).toBeUndefined()
  })

  it('runs a pending search before replacing', async () => {
    const { wrapper: w } = mountPanel(true)
    await type(w, 'foo')
    await w.find('input.replace-input').setValue('bar')
    await w.find('input.replace-input').trigger('keydown', { key: 'Enter' })

    expect(w.emitted('search')).toEqual([['foo', false, false]])
    expect(w.emitted('replace')).toEqual([['bar']])
  })

  it('does not search after the panel closes with a search pending', async () => {
    const { store, wrapper: w } = mountPanel()
    await type(w, 'foo')
    store.close()
    await w.vm.$nextTick()
    vi.advanceTimersByTime(500)
    expect(w.emitted('search')).toBeUndefined()
  })

  it('wires the advertised Match Case and Regex shortcuts (⌥⌘C / ⌥⌘R)', async () => {
    const { store, wrapper: w } = mountPanel()
    const panel = w.find('.find-replace-panel')
    await panel.trigger('keydown', { key: 'ç', code: 'KeyC', metaKey: true, altKey: true })
    expect(store.caseSensitive).toBe(true)
    await panel.trigger('keydown', { key: '®', code: 'KeyR', metaKey: true, altKey: true })
    expect(store.useRegex).toBe(true)
  })

  it('wires the advertised Replace All shortcut (⌘⌥Enter)', async () => {
    const { wrapper: w } = mountPanel(true)
    await w.find('input.replace-input').setValue('bar')
    await w
      .find('input.replace-input')
      .trigger('keydown', { key: 'Enter', metaKey: true, altKey: true })
    expect(w.emitted('replaceAll')).toEqual([['bar']])
    expect(w.emitted('replace')).toBeUndefined()
  })

  it('Replace All shortcut does nothing in Find-only mode', async () => {
    const { store, wrapper: w } = mountPanel(false)
    store.replaceQuery = 'stale hidden replacement'
    await type(w, 'foo')
    await w
      .find('input.find-input')
      .trigger('keydown', { key: 'Enter', metaKey: true, altKey: true })
    expect(w.emitted('replaceAll')).toBeUndefined()
    expect(w.emitted('replace')).toBeUndefined()
  })

  it('leaves Shift+Cmd+G to the app (Open by Path) instead of going to the previous match', async () => {
    const { wrapper: w } = mountPanel()
    const reachedWindow = vi.fn((e: KeyboardEvent) => e.defaultPrevented)
    window.addEventListener('keydown', reachedWindow)
    await w.find('input.find-input').trigger('keydown', { key: 'G', metaKey: true, shiftKey: true })
    window.removeEventListener('keydown', reachedWindow)

    expect(w.emitted('prev')).toBeUndefined()
    expect(w.emitted('next')).toBeUndefined()
    expect(reachedWindow).toHaveReturnedWith(false)
  })

  it('does not advertise the outline shortcut for Replace', () => {
    const { wrapper: w } = mountPanel(true)
    const titles = w.findAll('button').map((b) => b.attributes('title') ?? '')
    expect(titles.some((t) => t.includes('⌘⇧1'))).toBe(false)
    expect(titles).toContain('Replace (Enter)')
  })

  it('Cmd+G goes to the next match with focus outside the panel', () => {
    const { store, wrapper: w } = mountPanel()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', metaKey: true }))
    expect(w.emitted('next')).toHaveLength(1)

    store.close()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', metaKey: true }))
    expect(w.emitted('next')).toHaveLength(1)
  })

  it('Cmd+G inside the panel goes to the next match exactly once', async () => {
    const { wrapper: w } = mountPanel()
    await w.find('input.find-input').trigger('keydown', { key: 'g', metaKey: true })
    expect(w.emitted('next')).toHaveLength(1)
  })
})
