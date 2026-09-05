<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useTabsStore } from '../../stores/tabs'
import TabItem from './TabItem.vue'

const tabsStore = useTabsStore()
const tabList = ref<HTMLElement | null>(null)
const documentList = ref<HTMLDetailsElement | null>(null)

function handleNewTab() {
  tabsStore.createTab()
}

async function handleClose(tabId: string) {
  const wasActive = tabsStore.activeTabId === tabId
  await tabsStore.closeTab(tabId)

  if (wasActive && tabsStore.activeTabId) {
    await nextTick()
    focusTab(tabsStore.activeTabId)
  }
}

function findTabElement(tabId: string): HTMLElement | null {
  const elements = tabList.value?.querySelectorAll<HTMLElement>('[data-tab-id]')
  if (!elements) return null

  return Array.from(elements).find((element) => element.dataset.tabId === tabId) ?? null
}

function revealTab(tabId: string) {
  const element = findTabElement(tabId)
  if (element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

function focusTab(tabId: string) {
  const element = findTabElement(tabId)
  if (!element) return

  element.focus()
  revealTab(tabId)
}

function handleSelect(tabId: string) {
  tabsStore.setActiveTab(tabId)
}

function closeDocumentList(restoreFocus = true) {
  const list = documentList.value
  if (!list) return

  list.open = false
  document.removeEventListener('click', handleDocumentListOutsideClick, true)
  if (restoreFocus) list.querySelector<HTMLElement>('summary')?.focus()
}

function handleDocumentListOutsideClick(event: MouseEvent) {
  const list = documentList.value
  if (list?.open && event.target instanceof Node && !list.contains(event.target)) {
    closeDocumentList(false)
  }
}

function handleDocumentListToggle() {
  if (documentList.value?.open) {
    document.addEventListener('click', handleDocumentListOutsideClick, true)
  } else {
    document.removeEventListener('click', handleDocumentListOutsideClick, true)
  }
}

function handleDocumentListFocusOut(event: FocusEvent) {
  const list = documentList.value
  if (!list?.open || (event.relatedTarget instanceof Node && list.contains(event.relatedTarget)))
    return

  closeDocumentList(false)
}

function handleDocumentSelect(tabId: string) {
  handleSelect(tabId)
  closeDocumentList(false)
  void nextTick(() => focusTab(tabId))
}

function tabIdFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (!(event.target instanceof Element)) return null

  return event.target.closest<HTMLElement>('[role="tab"]')?.dataset.tabId ?? null
}

function handleTabKeydown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

  const currentTabId = tabIdFromKeyboardEvent(event) ?? tabsStore.activeTabId
  if (!currentTabId) return

  const currentIndex = tabsStore.tabs.findIndex((tab) => tab.id === currentTabId)
  if (currentIndex === -1) return

  const tabCount = tabsStore.tabs.length
  let targetIndex: number | undefined

  switch (event.key) {
    case 'ArrowRight':
      targetIndex = (currentIndex + 1) % tabCount
      break
    case 'ArrowLeft':
      targetIndex = (currentIndex - 1 + tabCount) % tabCount
      break
    case 'Home':
      targetIndex = 0
      break
    case 'End':
      targetIndex = tabCount - 1
      break
    case 'Enter':
    case ' ':
    case 'Spacebar':
      event.preventDefault()
      handleSelect(currentTabId)
      focusTab(currentTabId)
      return
    default:
      return
  }

  event.preventDefault()
  if (targetIndex === undefined) return
  const targetTab = tabsStore.tabs[targetIndex]
  if (!targetTab) return

  handleSelect(targetTab.id)
  void nextTick(() => focusTab(targetTab.id))
}

watch(
  () => tabsStore.activeTabId,
  (tabId) => {
    if (tabId) void nextTick(() => revealTab(tabId))
  },
  { flush: 'post', immediate: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentListOutsideClick, true)
})
</script>

<template>
  <div class="tab-bar">
    <div ref="tabList" class="tab-bar-scroll">
      <div
        class="tabs-container"
        role="tablist"
        aria-label="Open documents"
        aria-orientation="horizontal"
        @keydown="handleTabKeydown"
      >
        <TabItem
          v-for="tab in tabsStore.tabs"
          :key="tab.id"
          :tab="tab"
          :is-active="tab.id === tabsStore.activeTabId"
          @select="handleSelect(tab.id)"
          @close="void handleClose(tab.id)"
        />
      </div>
    </div>
    <div class="tab-bar-actions">
      <details
        ref="documentList"
        class="document-list"
        @toggle="handleDocumentListToggle"
        @keydown.esc.prevent="closeDocumentList()"
        @focusout="handleDocumentListFocusOut"
      >
        <summary
          class="tab-action-button"
          :aria-label="`Open documents (${tabsStore.tabs.length})`"
          tabindex="0"
          title="Open documents"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2.5 3.5h11M2.5 8h11M2.5 12.5h11"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            />
          </svg>
          <span class="document-count" aria-hidden="true">{{ tabsStore.tabs.length }}</span>
        </summary>
        <ul class="document-list-menu" aria-label="Open documents">
          <li v-for="tab in tabsStore.tabs" :key="tab.id" class="document-list-entry">
            <button
              class="document-list-item"
              :class="{ 'document-list-item--active': tab.id === tabsStore.activeTabId }"
              :aria-current="tab.id === tabsStore.activeTabId ? 'page' : undefined"
              :title="tab.filePath ?? tab.title"
              @click="handleDocumentSelect(tab.id)"
            >
              <span class="document-list-title">{{ tab.title }}</span>
              <span
                v-if="tab.isModified"
                class="document-list-modified"
                aria-label="Unsaved changes"
                >•</span
              >
            </button>
          </li>
          <li v-if="tabsStore.tabs.length === 0" class="document-list-empty">No open documents</li>
        </ul>
      </details>
      <button class="new-tab-button" title="New Tab" aria-label="New Tab" @click="handleNewTab">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 1v10M1 6h10"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: stretch;
  height: 38px;
  min-height: 38px;
  background: var(--tab-bar-bg, #e8e8e8);
  border-bottom: 1px solid var(--tab-bar-border, #d0d0d0);
  user-select: none;
  -webkit-app-region: drag;
  overflow: visible;
}

.tab-bar-scroll {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-app-region: no-drag;
}

.tab-bar-scroll::-webkit-scrollbar {
  height: 0;
  display: none;
}

.tabs-container {
  display: flex;
  align-items: stretch;
  flex: 0 0 auto;
  width: max-content;
  min-width: 100%;
}

.tab-bar-actions {
  display: flex;
  align-items: stretch;
  flex: 0 0 auto;
  gap: 2px;
  padding: 0 4px;
  border-left: 1px solid var(--tab-bar-border);
  background: var(--tab-bar-bg);
  -webkit-app-region: no-drag;
}

.document-list {
  position: relative;
  -webkit-app-region: no-drag;
}

.document-list > summary {
  list-style: none;
}

.document-list > summary::-webkit-details-marker {
  display: none;
}

.tab-action-button,
.new-tab-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--tab-text-color);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.tab-action-button {
  width: 42px;
  gap: 3px;
  padding: 0 5px;
  font-size: 10px;
}

.tab-action-button:hover,
.document-list[open] > .tab-action-button,
.new-tab-button:hover {
  background: var(--tab-hover-bg);
  color: var(--tab-text-active-color);
}

.tab-action-button:focus-visible,
.new-tab-button:focus-visible,
.document-list-item:focus-visible {
  outline: 2px solid var(--tab-focus-ring);
  outline-offset: -2px;
}

.document-count {
  min-width: 1em;
  font-variant-numeric: tabular-nums;
}

.document-list-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  width: min(280px, calc(100vw - 24px));
  max-height: min(360px, 60vh);
  padding: 4px;
  overflow-y: auto;
  list-style: none;
  background: var(--tab-active-bg);
  border: 1px solid var(--tab-bar-border);
  border-radius: 6px;
  box-shadow: var(--tab-menu-shadow);
}

.document-list-entry {
  display: block;
}

.document-list-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 8px;
  padding: 7px 9px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--tab-text-color);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.document-list-item:hover,
.document-list-item--active {
  background: var(--tab-hover-bg);
  color: var(--tab-text-active-color);
}

.document-list-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-list-modified {
  flex: 0 0 auto;
  color: var(--tab-modified-dot-color);
}

.document-list-empty {
  padding: 8px 9px;
  color: var(--tab-text-color);
  font-size: 12px;
}

.new-tab-button {
  width: 32px;
  min-width: 32px;
  height: calc(100% - 6px);
  align-self: center;
  padding: 0;
  border-radius: 4px;
  margin: 3px 4px;
}
</style>
