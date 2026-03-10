<template>
  <Transition name="toast">
    <div
      v-if="publishStore.status !== 'idle'"
      class="export-toast"
      :class="`export-toast--${publishStore.status}`"
    >
      <span class="export-toast__icon">
        <template v-if="publishStore.status === 'working'">&#8987;</template>
        <template v-else-if="publishStore.status === 'success'">&#10003;</template>
        <template v-else-if="publishStore.status === 'error'">&#10007;</template>
      </span>
      <span class="export-toast__message">{{ publishStore.statusMessage }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { usePublishStore } from '../stores/publish'

const publishStore = usePublishStore()
</script>

<style scoped>
.export-toast {
  position: fixed;
  bottom: 40px;
  right: 20px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 9999;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  background-color: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  border: 1px solid var(--sidebar-border, #e0e0e0);
}

.export-toast--working {
  border-left: 3px solid var(--tab-active-indicator, #4a9eff);
}

.export-toast--success {
  border-left: 3px solid #34c759;
}

.export-toast--error {
  border-left: 3px solid var(--sidebar-error-color, #d32f2f);
}

.export-toast__icon {
  font-size: 15px;
  flex-shrink: 0;
}

.export-toast__message {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Transition */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
