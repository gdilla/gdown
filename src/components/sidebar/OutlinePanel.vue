<script setup lang="ts">
import { useOutlineStore, type OutlineHeading } from '../../stores/outline'

const outlineStore = useOutlineStore()

const emit = defineEmits<{
  (e: 'navigate', heading: OutlineHeading): void
}>()

/** Indent level relative to the minimum heading level in the document */
function indentLevel(heading: OutlineHeading): number {
  return heading.level - outlineStore.minLevel
}

/** CSS class for heading level styling */
function headingClass(heading: OutlineHeading): string[] {
  const classes = [`outline-item-h${heading.level}`]
  if (heading.id === outlineStore.activeHeadingId) {
    classes.push('outline-item-active')
  }
  return classes
}

function handleClick(heading: OutlineHeading) {
  emit('navigate', heading)
}
</script>

<template>
  <div class="outline-panel">
    <div class="outline-header">
      <span class="outline-title">OUTLINE</span>
    </div>

    <div class="outline-content">
      <!-- No headings state -->
      <div v-if="!outlineStore.hasHeadings" class="outline-empty">
        <p class="outline-empty-text">No headings found</p>
        <p class="outline-empty-hint">
          Use <kbd>#</kbd> to create headings
        </p>
      </div>

      <!-- Heading list -->
      <nav v-else class="outline-list" role="navigation" aria-label="Document outline">
        <button
          v-for="heading in outlineStore.headings"
          :key="heading.id"
          class="outline-item"
          :class="headingClass(heading)"
          :style="{ paddingLeft: `${12 + indentLevel(heading) * 16}px` }"
          :title="heading.text"
          @click="handleClick(heading)"
        >
          <span class="outline-item-text">{{ heading.text }}</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.outline-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.outline-header {
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--sidebar-border, #e0e0e0);
  flex-shrink: 0;
}

.outline-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sidebar-title-color, #888);
}

.outline-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.outline-content::-webkit-scrollbar {
  width: 6px;
}

.outline-content::-webkit-scrollbar-track {
  background: transparent;
}

.outline-content::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

.outline-content::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.25);
}

.outline-list {
  display: flex;
  flex-direction: column;
}

.outline-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 4px 12px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sidebar-text-color, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 0;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.outline-item:hover {
  background-color: var(--sidebar-hover-bg, rgba(0, 0, 0, 0.06));
}

.outline-item-active {
  background-color: var(--sidebar-selected-bg, rgba(0, 122, 255, 0.12));
  color: var(--sidebar-selected-color, #007aff);
  font-weight: 500;
}

.outline-item-active:hover {
  background-color: var(--sidebar-selected-bg, rgba(0, 122, 255, 0.15));
}

/* Heading level visual differentiation */
.outline-item-h1 {
  font-weight: 600;
  font-size: 13px;
}

.outline-item-h2 {
  font-weight: 500;
  font-size: 13px;
}

.outline-item-h3 {
  font-weight: 400;
  font-size: 12.5px;
}

.outline-item-h4,
.outline-item-h5,
.outline-item-h6 {
  font-weight: 400;
  font-size: 12px;
  color: var(--sidebar-text-color, #666);
}

.outline-item-text {
  display: inline;
}

/* Empty state */
.outline-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}

.outline-empty-text {
  color: var(--sidebar-text-color, #999);
  font-size: 13px;
  margin: 0 0 8px;
}

.outline-empty-hint {
  font-size: 11px;
  color: var(--sidebar-text-color, #aaa);
  margin: 0;
}

.outline-empty-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  font-size: 10px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Monaco, monospace;
  border: 1px solid var(--sidebar-border, #ccc);
  border-radius: 3px;
  background: var(--sidebar-bg, #f0f0f0);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08);
  margin: 0 1px;
}
</style>
