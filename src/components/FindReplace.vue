<template>
  <Transition name="find-panel">
    <div v-if="store.visible" class="find-replace-panel" @keydown="handlePanelKeydown">
      <!-- Find row -->
      <div class="find-row">
        <button
          class="toggle-replace-btn"
          :class="{ expanded: store.showReplace }"
          @click="store.toggleReplace()"
          title="Toggle Replace"
          tabindex="-1"
        >
          <span class="chevron">›</span>
        </button>

        <div class="input-wrapper">
          <input
            ref="searchInputRef"
            v-model="store.searchQuery"
            type="text"
            class="find-input"
            placeholder="Find"
            @input="onSearchInput"
            @keydown.enter.prevent="onNext"
            @keydown.shift.enter.prevent="onPrev"
          />
          <div class="input-options">
            <button
              class="option-btn"
              :class="{ active: store.caseSensitive }"
              @click="onToggleCaseSensitive"
              title="Match Case (⌥⌘C)"
            >
              Aa
            </button>
            <button
              class="option-btn regex-btn"
              :class="{ active: store.useRegex }"
              @click="onToggleRegex"
              title="Use Regular Expression (⌥⌘R)"
            >
              .*
            </button>
          </div>
        </div>

        <span class="match-count" :class="{ 'no-results': store.searchQuery && store.matchCount === 0 }">
          {{ store.matchDisplay }}
        </span>

        <div class="action-buttons">
          <button
            class="action-btn"
            @click="onPrev"
            :disabled="store.matchCount === 0"
            title="Previous Match (⇧Enter)"
          >
            <span class="btn-icon">‹</span>
          </button>
          <button
            class="action-btn"
            @click="onNext"
            :disabled="store.matchCount === 0"
            title="Next Match (Enter)"
          >
            <span class="btn-icon">›</span>
          </button>
          <button class="action-btn close-btn" @click="onClose" title="Close (Esc)">
            <span class="btn-icon">✕</span>
          </button>
        </div>
      </div>

      <!-- Replace row (conditionally shown) -->
      <div v-if="store.showReplace" class="replace-row">
        <div class="replace-spacer"></div>
        <div class="input-wrapper">
          <input
            ref="replaceInputRef"
            v-model="store.replaceQuery"
            type="text"
            class="find-input replace-input"
            placeholder="Replace"
            @keydown.enter.prevent="onReplace"
          />
        </div>
        <div class="action-buttons replace-actions">
          <button
            class="action-btn"
            @click="onReplace"
            :disabled="store.matchCount === 0"
            title="Replace (⌘⇧1)"
          >
            <span class="btn-icon replace-icon">↻</span>
          </button>
          <button
            class="action-btn"
            @click="onReplaceAll"
            :disabled="store.matchCount === 0"
            title="Replace All (⌘⌥Enter)"
          >
            <span class="btn-icon replace-all-icon">↻⁺</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useFindReplaceStore } from '../stores/findReplace'

const store = useFindReplaceStore()

const searchInputRef = ref<HTMLInputElement | null>(null)
const replaceInputRef = ref<HTMLInputElement | null>(null)

// Emits for parent to handle actual search/replace logic in the editor
const emit = defineEmits<{
  search: [query: string, caseSensitive: boolean, useRegex: boolean]
  next: []
  prev: []
  replace: [replacement: string]
  replaceAll: [replacement: string]
  close: []
}>()

// Auto-focus the search input when panel opens
watch(
  () => store.visible,
  (isVisible) => {
    if (isVisible) {
      nextTick(() => {
        searchInputRef.value?.focus()
        searchInputRef.value?.select()
      })
    } else {
      emit('close')
    }
  }
)

// Focus replace input when replace row is shown
watch(
  () => store.showReplace,
  (showReplace) => {
    if (showReplace && store.visible) {
      nextTick(() => {
        replaceInputRef.value?.focus()
      })
    }
  }
)

// Re-emit search when case sensitivity or regex toggles change
watch(
  () => [store.caseSensitive, store.useRegex],
  () => {
    if (store.searchQuery) {
      emit('search', store.searchQuery, store.caseSensitive, store.useRegex)
    }
  }
)

function onSearchInput() {
  emit('search', store.searchQuery, store.caseSensitive, store.useRegex)
}

function onNext() {
  emit('next')
}

function onPrev() {
  emit('prev')
}

function onReplace() {
  emit('replace', store.replaceQuery)
}

function onReplaceAll() {
  emit('replaceAll', store.replaceQuery)
}

function onClose() {
  store.close()
}

function onToggleCaseSensitive() {
  store.toggleCaseSensitive()
}

function onToggleRegex() {
  store.toggleRegex()
}

function handlePanelKeydown(e: KeyboardEvent) {
  // Escape closes the panel
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    onClose()
    return
  }

  // Cmd+G / Cmd+Shift+G for next/prev (Typora shortcuts)
  if (e.metaKey && (e.key === 'g' || e.key === 'G')) {
    e.preventDefault()
    e.stopPropagation()
    if (e.shiftKey) {
      onPrev()
    } else {
      onNext()
    }
    return
  }
}
</script>

<style scoped>
.find-replace-panel {
  position: absolute;
  top: 0;
  right: 20px;
  z-index: 200;
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--sidebar-border, #e0e0e0);
  border-top: none;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 380px;
  max-width: 500px;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
}

/* Slide-down animation */
.find-panel-enter-active {
  transition: transform 0.15s ease-out, opacity 0.15s ease-out;
}
.find-panel-leave-active {
  transition: transform 0.1s ease-in, opacity 0.1s ease-in;
}
.find-panel-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}
.find-panel-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

/* ── Find row ── */
.find-row,
.replace-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Chevron toggle for replace */
.toggle-replace-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: var(--tab-text-color, #777);
  cursor: pointer;
  border-radius: 3px;
  font-size: 14px;
  line-height: 1;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
}

.toggle-replace-btn:hover {
  background: var(--tab-hover-bg, rgba(0, 0, 0, 0.06));
  color: var(--text-primary, #333);
}

.toggle-replace-btn .chevron {
  display: inline-block;
  transition: transform 0.15s ease;
}

.toggle-replace-btn.expanded .chevron {
  transform: rotate(90deg);
}

/* ── Input wrapper ── */
.input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}

.find-input {
  width: 100%;
  height: 28px;
  padding: 0 60px 0 8px;
  border: 1px solid var(--sidebar-border, #e0e0e0);
  border-radius: 4px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #333);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.find-input:focus {
  border-color: var(--tab-active-indicator, #4a9eff);
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.15);
}

.replace-input {
  padding-right: 8px;
}

/* ── Option buttons inside the find input ── */
.input-options {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
}

.option-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 20px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: none;
  color: var(--tab-text-color, #777);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  transition: all 0.1s;
}

.option-btn:hover {
  background: var(--tab-hover-bg, rgba(0, 0, 0, 0.06));
  color: var(--text-primary, #333);
}

.option-btn.active {
  background: var(--tab-active-indicator, #4a9eff);
  color: #ffffff;
  border-color: var(--tab-active-indicator, #4a9eff);
}

.regex-btn {
  font-size: 10px;
  letter-spacing: -0.5px;
}

/* ── Match count ── */
.match-count {
  font-size: 12px;
  color: var(--tab-text-color, #777);
  white-space: nowrap;
  min-width: 60px;
  text-align: center;
  flex-shrink: 0;
}

.match-count.no-results {
  color: var(--sidebar-error-color, #d32f2f);
}

/* ── Action buttons ── */
.action-buttons {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--tab-text-color, #777);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.1s;
}

.action-btn:hover:not(:disabled) {
  background: var(--tab-hover-bg, rgba(0, 0, 0, 0.06));
  color: var(--text-primary, #333);
}

.action-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.action-btn:active:not(:disabled) {
  background: rgba(0, 0, 0, 0.1);
}

.close-btn .btn-icon {
  font-size: 11px;
}

.btn-icon {
  line-height: 1;
}

.replace-icon {
  font-size: 13px;
}

.replace-all-icon {
  font-size: 12px;
}

/* ── Replace row ── */
.replace-spacer {
  width: 20px;
  flex-shrink: 0;
}

.replace-actions {
  /* Align replace buttons with nav buttons above */
  margin-left: auto;
}
</style>
