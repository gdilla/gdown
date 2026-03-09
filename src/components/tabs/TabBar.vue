<script setup lang="ts">
import { useTabsStore } from '../../stores/tabs'
import TabItem from './TabItem.vue'

const tabsStore = useTabsStore()

function handleNewTab() {
  tabsStore.createTab()
}
</script>

<template>
  <div class="tab-bar">
    <div class="tab-bar-scroll">
      <div class="tabs-container">
        <TabItem
          v-for="tab in tabsStore.tabs"
          :key="tab.id"
          :tab="tab"
          :is-active="tab.id === tabsStore.activeTabId"
          @select="tabsStore.setActiveTab(tab.id)"
          @close="tabsStore.closeTab(tab.id)"
        />
      </div>
      <button
        class="new-tab-button"
        @click="handleNewTab"
        title="New Tab"
        aria-label="New Tab"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 38px;
  min-height: 38px;
  background: var(--tab-bar-bg, #e8e8e8);
  border-bottom: 1px solid var(--tab-bar-border, #d0d0d0);
  user-select: none;
  -webkit-app-region: drag;
  overflow: hidden;
}

.tab-bar-scroll {
  display: flex;
  align-items: stretch;
  flex: 1;
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
  min-width: 0;
}

.new-tab-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  min-width: 32px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--tab-text-color, #666);
  cursor: pointer;
  padding: 0;
  -webkit-app-region: no-drag;
  transition: color 0.15s ease, background-color 0.15s ease;
  border-radius: 4px;
  margin: 3px 4px;
}

.new-tab-button:hover {
  background: var(--tab-hover-bg, rgba(0, 0, 0, 0.08));
  color: var(--tab-text-active-color, #333);
}
</style>
