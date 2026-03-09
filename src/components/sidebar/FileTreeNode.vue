<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { startDrag } from '@crabnebula/tauri-plugin-drag'
import type { FileNode } from '../../types/filetree'

const props = defineProps<{
  node: FileNode
  depth: number
  selectedPath: string | null
}>()

const emit = defineEmits<{
  (e: 'select-file', path: string): void
}>()

/** Whether this directory node is expanded */
const expanded = ref(props.depth === 0)

/** Whether the children section is currently animating */
const animating = ref(false)

/** Reference to the children container for animation */
const childrenRef = ref<HTMLDivElement | null>(null)

/** Toggle expand/collapse for directory nodes with animation */
function toggleExpand() {
  if (!props.node.is_dir) return

  const el = childrenRef.value

  if (!expanded.value) {
    // Expanding: set expanded first so children render, then animate
    expanded.value = true
    nextTick(() => {
      const el2 = childrenRef.value
      if (el2) {
        animating.value = true
        el2.style.height = '0px'
        requestAnimationFrame(() => {
          el2.style.height = `${el2.scrollHeight}px`
        })
      }
    })
  } else if (el) {
    // Collapsing: animate from current height to 0
    animating.value = true
    el.style.height = `${el.scrollHeight}px`
    requestAnimationFrame(() => {
      el.style.height = '0px'
    })
    // Set expanded to false after animation completes (handled in onTransitionEnd)
  } else {
    expanded.value = false
  }
}

/** Handle transition end to clean up animation */
function onTransitionEnd() {
  animating.value = false
  const el = childrenRef.value
  if (el) {
    if (el.style.height === '0px') {
      expanded.value = false
    }
    el.style.height = ''
  }
}

/** Handle click on this node */
function handleClick() {
  if (props.node.is_dir) {
    toggleExpand()
  } else {
    emit('select-file', props.node.path)
  }
}

/** Start a native OS file drag for dropping into external apps */
function handleDragStart(event: DragEvent) {
  if (props.node.is_dir) return
  // Prevent the browser's default drag behavior
  event.preventDefault()
  startDrag({ item: [props.node.path], icon: '' })
}

/** Whether this node is currently selected */
const isSelected = computed(() => props.selectedPath === props.node.path)

/** Get file extension for icon styling */
const fileExtension = computed(() => {
  if (props.node.is_dir) return ''
  const parts = props.node.name.split('.')
  return parts.length > 1 ? (parts[parts.length - 1] ?? '').toLowerCase() : ''
})

/** Whether this is a markdown file */
const isMarkdown = computed(() => {
  return ['md', 'markdown', 'mdown', 'mkd'].includes(fileExtension.value)
})

/** File icon color class based on extension */
const fileIconClass = computed(() => {
  const ext = fileExtension.value
  if (['md', 'markdown', 'mdown', 'mkd'].includes(ext)) return 'icon-markdown'
  if (['js', 'mjs', 'cjs'].includes(ext)) return 'icon-javascript'
  if (['ts', 'mts', 'cts'].includes(ext)) return 'icon-typescript'
  if (['json'].includes(ext)) return 'icon-json'
  if (['yaml', 'yml'].includes(ext)) return 'icon-yaml'
  if (['html', 'htm'].includes(ext)) return 'icon-html'
  if (['css', 'scss', 'less'].includes(ext)) return 'icon-css'
  if (['xml', 'svg'].includes(ext)) return 'icon-xml'
  if (['txt', 'text', 'log'].includes(ext)) return 'icon-text'
  if (['toml', 'ini', 'cfg', 'conf'].includes(ext)) return 'icon-config'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'].includes(ext)) return 'icon-image'
  if (['pdf'].includes(ext)) return 'icon-pdf'
  if (['rs'].includes(ext)) return 'icon-rust'
  if (['py'].includes(ext)) return 'icon-python'
  return 'icon-file-default'
})

/** Sorted children: directories first, then alphabetical */
const sortedChildren = computed(() => {
  if (!props.node.children) return []
  return [...props.node.children].sort((a, b) => {
    if (a.is_dir && !b.is_dir) return -1
    if (!a.is_dir && b.is_dir) return 1
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  })
})

/** Indentation style based on depth */
const indentStyle = computed(() => ({
  paddingLeft: `${props.depth * 16 + 8}px`,
}))
</script>

<template>
  <div class="file-tree-node">
    <div
      class="node-row"
      :class="{
        'is-dir': node.is_dir,
        'is-file': !node.is_dir,
        'is-selected': isSelected,
        'is-markdown': isMarkdown,
      }"
      :style="indentStyle"
      :draggable="!node.is_dir"
      :title="node.path"
      role="treeitem"
      :aria-expanded="node.is_dir ? expanded : undefined"
      :aria-selected="isSelected"
      tabindex="0"
      @click="handleClick"
      @dragstart="handleDragStart"
      @keydown.enter.prevent="handleClick"
      @keydown.space.prevent="handleClick"
    >
      <!-- Expand/collapse chevron for directories -->
      <span v-if="node.is_dir" class="chevron" :class="{ expanded }">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path
            d="M4.5 2L8.5 6L4.5 10"
            stroke="currentColor"
            stroke-width="1.5"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span v-else class="chevron-placeholder"></span>

      <!-- File/folder icon -->
      <span class="node-icon">
        <!-- Open folder icon -->
        <svg
          v-if="node.is_dir && expanded"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="icon-folder-open"
        >
          <path
            d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H13.5A1.5 1.5 0 0 1 15 5.5v.25H2.25A1.75 1.75 0 0 0 .5 7.5v4.325L1 3.5z"
          />
          <path
            d="M1.505 7A1.5 1.5 0 0 1 3 5.5h11.5a1.5 1.5 0 0 1 1.476 1.77l-1 5.5A1.5 1.5 0 0 1 13.5 14H2.5a1.5 1.5 0 0 1-1.496-1.37l-.999-5.63z"
          />
        </svg>
        <!-- Closed folder icon -->
        <svg
          v-else-if="node.is_dir"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="icon-folder"
        >
          <path
            d="M2.5 2A1.5 1.5 0 0 0 1 3.5v9A1.5 1.5 0 0 0 2.5 14h11a1.5 1.5 0 0 0 1.5-1.5V5.5A1.5 1.5 0 0 0 13.5 4H9.621a1.5 1.5 0 0 1-1.06-.44L7.439 2.44A1.5 1.5 0 0 0 6.38 2H2.5z"
          />
        </svg>
        <!-- Markdown file icon (distinctive M-down-arrow icon) -->
        <svg
          v-else-if="isMarkdown"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          :class="fileIconClass"
        >
          <path
            d="M2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2zm1 3v6h1.5V7.707l1.75 2.043L8 7.707V11h1.5V5H8L6.25 7.293 4.5 5H3zm8 0v3.293L9.354 8.646l-1.061 1.06L11 12.414l2.707-2.707-1.061-1.06L11 10.292V5h-1.5z"
          />
        </svg>
        <!-- Image file icon -->
        <svg
          v-else-if="fileIconClass === 'icon-image'"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          :class="fileIconClass"
        >
          <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
          <path
            d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"
          />
        </svg>
        <!-- Generic file icon for all other types -->
        <svg
          v-else
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          :class="fileIconClass"
        >
          <path
            d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"
          />
        </svg>
      </span>

      <!-- File/folder name -->
      <span class="node-name" :class="{ 'name-markdown': isMarkdown }">
        {{ node.name }}
      </span>
    </div>

    <!-- Children (recursive) with expand/collapse animation -->
    <div
      v-if="node.is_dir && (expanded || animating)"
      ref="childrenRef"
      class="node-children"
      :class="{ 'node-children-animating': animating }"
      role="group"
      @transitionend.self="onTransitionEnd"
    >
      <FileTreeNode
        v-for="child in sortedChildren"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :selected-path="selectedPath"
        @select-file="(path: string) => emit('select-file', path)"
      />
    </div>
  </div>
</template>

<style scoped>
.file-tree-node {
  user-select: none;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 0.1s ease;
  outline: none;
}

.node-row:hover {
  background-color: var(--sidebar-hover-bg, rgba(0, 0, 0, 0.06));
}

.node-row:focus-visible {
  outline: 2px solid var(--sidebar-selected-color, #007aff);
  outline-offset: -2px;
}

.node-row.is-selected {
  background-color: var(--sidebar-selected-bg, rgba(0, 122, 255, 0.12));
  color: var(--sidebar-selected-color, #007aff);
}

.node-row.is-selected:hover {
  background-color: var(--sidebar-selected-bg, rgba(0, 122, 255, 0.18));
}

.chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform 0.15s ease;
  color: var(--sidebar-chevron-color, #999);
}

.chevron.expanded {
  transform: rotate(90deg);
}

.chevron-placeholder {
  display: inline-block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.node-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* Folder icons */
.icon-folder,
.icon-folder-open {
  color: var(--sidebar-folder-color, #e8a838);
}

/* File type-specific icon colors */
.icon-file-default {
  color: var(--sidebar-file-color, #999);
}

.icon-markdown {
  color: var(--sidebar-markdown-color, #519aba);
}

.icon-javascript {
  color: #f0db4f;
}

.icon-typescript {
  color: #3178c6;
}

.icon-json {
  color: #cbcb41;
}

.icon-yaml {
  color: #cb171e;
}

.icon-html {
  color: #e34c26;
}

.icon-css {
  color: #563d7c;
}

.icon-xml {
  color: #e37933;
}

.icon-text {
  color: #aaa;
}

.icon-config {
  color: #8e8e8e;
}

.icon-image {
  color: #a074c4;
}

.icon-pdf {
  color: #ec1c24;
}

.icon-rust {
  color: #dea584;
}

.icon-python {
  color: #3572a5;
}

.node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--sidebar-text-color, #333);
}

.node-name.name-markdown {
  color: var(--sidebar-text-color, #333);
}

/* Children container with expand/collapse animation */
.node-children {
  overflow: hidden;
}

.node-children-animating {
  transition: height 0.15s ease;
}
</style>
