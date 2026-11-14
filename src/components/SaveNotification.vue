<template>
  <Teleport to="body">
    <Transition name="notification">
      <div
        v-if="autoSaveStore.saveNotification"
        class="save-notification"
        :class="'notification-' + autoSaveStore.saveNotification.type"
      >
        <span class="notification-icon">{{ icon }}</span>
        <span class="notification-text">{{ autoSaveStore.saveNotification.message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAutoSaveStore } from '../stores/autoSave'

const autoSaveStore = useAutoSaveStore()

const icon = computed(() => {
  if (!autoSaveStore.saveNotification) return ''
  switch (autoSaveStore.saveNotification.type) {
    case 'success':
      return '✓'
    case 'error':
      return '✕'
    case 'warning':
      return '⚠'
    default:
      return ''
  }
})
</script>

<style scoped>
.save-notification {
  position: fixed;
  bottom: 40px;
  right: 16px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  z-index: 9999;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 360px;
}

.notification-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.notification-success {
  background: var(--notice-success-bg);
  color: var(--notice-success-text);
  border: 1px solid var(--notice-success-border);
}

.notification-error {
  background: var(--notice-danger-bg);
  color: var(--notice-danger-text);
  border: 1px solid var(--notice-danger-border);
}

.notification-warning {
  background: var(--notice-warning-bg);
  color: var(--notice-warning-text);
  border: 1px solid var(--notice-warning-border);
}

/* Transition */
.notification-enter-active {
  transition: all 0.3s ease;
}
.notification-leave-active {
  transition: all 0.2s ease;
}
.notification-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.notification-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
