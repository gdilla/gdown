import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from '../../../components/tabs/TabBar.vue'
import { useTabsStore } from '../../../stores/tabs'

describe('TabBar', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountTabBar() {
    const tabsStore = useTabsStore()
    const firstTab = tabsStore.createTab('/notes/first-document.md')
    const secondTab = tabsStore.createTab('/notes/second-document.md')
    tabsStore.setActiveTab(firstTab.id)

    return {
      tabsStore,
      firstTab,
      secondTab,
      wrapper: mount(TabBar, { attachTo: document.body }),
    }
  }

  it('exposes a semantic tablist with a single roving tab stop', () => {
    const { wrapper, firstTab, secondTab } = mountTabBar()
    const tabs = wrapper.findAll('[role="tab"]')

    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Open documents')
    expect(tabs[0]!.attributes('tabindex')).toBe('0')
    expect(tabs[1]!.attributes('tabindex')).toBe('-1')
    expect(tabs[0]!.attributes('data-tab-id')).toBe(firstTab.id)
    expect(tabs[1]!.attributes('data-tab-id')).toBe(secondTab.id)
  })

  it('moves selection and the roving tab stop with arrow keys', async () => {
    const { wrapper, tabsStore, firstTab, secondTab } = mountTabBar()
    const firstTabElement = wrapper.find(`[data-tab-id="${firstTab.id}"]`)

    await firstTabElement.trigger('keydown', { key: 'ArrowRight' })

    expect(tabsStore.activeTabId).toBe(secondTab.id)
    expect(wrapper.find(`[data-tab-id="${secondTab.id}"]`).attributes('tabindex')).toBe('0')
    expect(wrapper.find(`[data-tab-id="${firstTab.id}"]`).attributes('tabindex')).toBe('-1')
  })

  it('keeps the active close button reachable and labels unsaved tabs', async () => {
    const { wrapper, tabsStore, firstTab, secondTab } = mountTabBar()
    tabsStore.setModified(firstTab.id, true)
    await nextTick()

    expect(
      wrapper.find(`[data-tab-id="${firstTab.id}"] .tab-item__close`).attributes('tabindex'),
    ).toBe('0')
    expect(
      wrapper.find(`[data-tab-id="${firstTab.id}"] .tab-item__close`).attributes('aria-label'),
    ).toContain('unsaved changes')
    expect(
      wrapper.find(`[data-tab-id="${secondTab.id}"] .tab-item__close`).attributes('tabindex'),
    ).toBe('-1')
  })

  it('provides a compact open-document menu', () => {
    const { wrapper } = mountTabBar()
    const summary = wrapper.get('summary')

    expect(summary.attributes('aria-label')).toBe('Open documents (2)')
    expect(wrapper.findAll('.document-list-item')).toHaveLength(2)
  })

  it('selects from the document list and returns focus after Escape', async () => {
    const { wrapper, tabsStore, secondTab } = mountTabBar()
    const details = wrapper.get('details')
    const summary = wrapper.get('summary')
    const documents = wrapper.findAll('.document-list-item')

    ;(details.element as HTMLDetailsElement).open = true
    await documents[1]!.trigger('click')
    expect(tabsStore.activeTabId).toBe(secondTab.id)
    ;(details.element as HTMLDetailsElement).open = true
    ;(documents[0]!.element as HTMLElement).focus()
    await documents[0]!.trigger('keydown', { key: 'Escape' })

    expect((details.element as HTMLDetailsElement).open).toBe(false)
    expect(document.activeElement).toBe(summary.element)
  })

  it('keeps the active tab when the async close guard cancels', async () => {
    const { wrapper, tabsStore, firstTab } = mountTabBar()
    const closeTab = vi
      .spyOn(tabsStore, 'closeTab')
      .mockImplementation(() => Promise.resolve(false))

    await wrapper.find(`[data-tab-id="${firstTab.id}"] .tab-item__close`).trigger('click')
    await vi.waitFor(() => expect(closeTab).toHaveBeenCalledWith(firstTab.id))

    expect(tabsStore.activeTabId).toBe(firstTab.id)
    expect(tabsStore.tabs).toHaveLength(2)
  })
})
