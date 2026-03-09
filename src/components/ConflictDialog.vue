<template>
  <Teleport to="body">
    <Transition name="conflict-banner">
      <div
        v-if="autoSaveStore.conflictDialog"
        class="conflict-banner"
        role="alert"
      >
        <span class="conflict-banner-icon">↻</span>
        <span class="conflict-banner-text">
          <strong>{{ fileName }}</strong> was modified externally.
        </span>
        <div class="conflict-banner-actions">
          <button class="conflict-btn-primary" @click="handleReload">
            Reload from disk
          </button>
          <button class="conflict-btn-secondary" @click="handleOverwrite">
            Keep mine
          </button>
          <button class="conflict-btn-dismiss" @click="handleCancel" title="Dismiss">
            ✕
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAutoSaveStore } from '../stores/autoSave'

const autoSaveStore = useAutoSaveStore()

const fileName = computed(() => {
  if (!autoSaveStore.conflictDialog) return ''
  const path = autoSaveStore.conflictDialog.filePath
  return path.split('/').pop() || path
})

function handleReload() {
  autoSaveStore.resolveConflict('reload')
}

function handleOverwrite() {
  autoSaveStore.resolveConflict('overwrite')
}

function handleCancel() {
  autoSaveStore.resolveConflict('cancel')
}
</script>

<style scoped>
.conflict-banner {
  position: fixed;
  top: 36px; /* below tab bar */
  left: 50%;
  transform: translateX(-50%);
  z-index: 9000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--tab-active-indicator, #4a9eff);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  font-size: 12px;
  white-space: nowrap;
  max-width: calc(100vw - 48px);
}

.conflict-banner-icon {
  font-size: 14px;
  color: var(--tab-active-indicator, #4a9eff);
  flex-shrink: 0;
}

.conflict-banner-text {
  color: var(--text-primary, #333);
  overflow: hidden;
  text-overflow: ellipsis;
}

.conflict-banner-text strong {
  font-weight: 600;
}

.conflict-banner-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 4px;
}

.conflict-btn-primary {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: var(--tab-active-indicator, #4a9eff);
  color: #fff;
  transition: opacity 0.15s;
}

.conflict-btn-primary:hover {
  opacity: 0.85;
}

.conflict-btn-secondary {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--tab-bar-border, #d0d0d0);
  background: transparent;
  color: var(--text-primary, #333);
  transition: background 0.15s;
}

.conflict-btn-secondary:hover {
  background: var(--tab-hover-bg, rgba(0,0,0,0.05));
}

.conflict-btn-dismiss {
  padding: 2px 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--sidebar-title-color, #999);
  border-radius: 4px;
  line-height: 1;
  transition: color 0.15s;
}

.conflict-btn-dismiss:hover {
  color: var(--text-primary, #333);
}

/* Slide-down animation */
.conflict-banner-enter-active,
.conflict-banner-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.conflict-banner-enter-from,
.conflict-banner-leave-to {
  transform: translateX(-50%) translateY(-12px);
  opacity: 0;
}
</style>
