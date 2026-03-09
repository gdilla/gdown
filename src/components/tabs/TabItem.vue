<script setup lang="ts">
import { ref } from 'vue'
import type { Tab } from '../../types/tab'

const props = defineProps<{
  tab: Tab
  isActive: boolean
}>()

const emit = defineEmits<{
  select: []
  close: []
}>()

const isHovered = ref(false)

function handleMouseDown(event: MouseEvent) {
  // Middle-click to close
  if (event.button === 1) {
    event.preventDefault()
    emit('close')
  }
}

function handleClick(event: MouseEvent) {
  // Left-click to select
  if (event.button === 0) {
    emit('select')
  }
}

function handleCloseClick(event: MouseEvent) {
  event.stopPropagation()
  emit('close')
}
</script>

<template>
  <div
    class="tab-item"
    :class="{
      'tab-item--active': isActive,
      'tab-item--modified': tab.isModified,
      'tab-item--hovered': isHovered,
    }"
    @mousedown="handleMouseDown"
    @click="handleClick"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    :title="tab.filePath ?? tab.title"
    role="tab"
    :aria-selected="isActive"
    :tabindex="isActive ? 0 : -1"
  >
    <span class="tab-item__title">{{ tab.title }}</span>

    <button
      class="tab-item__close"
      :class="{ 'tab-item__close--visible': isHovered || isActive }"
      @click="handleCloseClick"
      @mousedown.stop
      title="Close"
      aria-label="Close tab"
      tabindex="-1"
    >
      <!-- Modified dot indicator or close X -->
      <span v-if="tab.isModified && !isHovered" class="tab-item__modified-dot" />
      <svg v-else width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  padding: 0 8px 0 14px;
  min-width: 80px;
  max-width: 200px;
  cursor: pointer;
  position: relative;
  border-right: 1px solid var(--tab-separator-color, rgba(0, 0, 0, 0.08));
  background: transparent;
  transition: background-color 0.12s ease;
  font-size: 12px;
  color: var(--tab-text-color, #777);
}

.tab-item:hover {
  background: var(--tab-hover-bg, rgba(0, 0, 0, 0.04));
}

.tab-item--active {
  background: var(--tab-active-bg, #ffffff);
  color: var(--tab-text-active-color, #333);
  border-right-color: var(--tab-separator-color, rgba(0, 0, 0, 0.08));
}

.tab-item--active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--tab-active-indicator, #4a9eff);
}

.tab-item__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 38px;
}

.tab-item__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  min-width: 20px;
  border: none;
  background: transparent;
  color: var(--tab-close-color, #999);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  opacity: 0;
  transition: opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease;
}

.tab-item__close--visible,
.tab-item--modified .tab-item__close {
  opacity: 1;
}

.tab-item__close:hover {
  background: var(--tab-close-hover-bg, rgba(0, 0, 0, 0.1));
  color: var(--tab-close-hover-color, #333);
}

.tab-item__modified-dot {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tab-modified-dot-color, #f59e0b);
}
</style>
