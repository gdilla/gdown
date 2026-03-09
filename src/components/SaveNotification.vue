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
    case 'success': return '✓'
    case 'error': return '✕'
    case 'warning': return '⚠'
    default: return ''
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
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.notification-error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.notification-warning {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffeeba;
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

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .notification-success {
    background: #1e3a2a;
    color: #8fd4a0;
    border-color: #2d5a3a;
  }
  .notification-error {
    background: #3a1e1e;
    color: #d48f8f;
    border-color: #5a2d2d;
  }
  .notification-warning {
    background: #3a3a1e;
    color: #d4c48f;
    border-color: #5a5a2d;
  }
}
</style>
