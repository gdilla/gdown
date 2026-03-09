<template>
  <Teleport to="body">
    <div v-if="autoSaveStore.conflictDialog" class="conflict-overlay" @click.self="handleCancel">
      <div class="conflict-dialog">
        <div class="conflict-icon">⚠️</div>
        <h3 class="conflict-title">File Changed Externally</h3>
        <p class="conflict-message">
          <strong>{{ fileName }}</strong> has been modified outside of gdown.
          Your local changes may conflict with the external changes.
        </p>
        <p class="conflict-sub">What would you like to do?</p>
        <div class="conflict-actions">
          <button class="conflict-btn conflict-btn-reload" @click="handleReload" title="Discard your changes and load the version from disk">
            Reload from Disk
          </button>
          <button class="conflict-btn conflict-btn-overwrite" @click="handleOverwrite" title="Keep your version and overwrite the file on disk">
            Overwrite with Mine
          </button>
          <button class="conflict-btn conflict-btn-cancel" @click="handleCancel" title="Cancel and keep editing without saving">
            Cancel
          </button>
        </div>
      </div>
    </div>
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
.conflict-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(2px);
}

.conflict-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 28px 32px;
  max-width: 460px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
}

.conflict-icon {
  font-size: 36px;
  margin-bottom: 12px;
}

.conflict-title {
  font-size: 17px;
  font-weight: 600;
  color: #1d1d1f;
  margin: 0 0 10px;
}

.conflict-message {
  font-size: 13px;
  color: #555;
  line-height: 1.5;
  margin: 0 0 6px;
}

.conflict-sub {
  font-size: 13px;
  color: #777;
  margin: 0 0 20px;
}

.conflict-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conflict-btn {
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid #d0d0d0;
  transition: all 0.15s ease;
}

.conflict-btn-reload {
  background: #007aff;
  color: #fff;
  border-color: #007aff;
}

.conflict-btn-reload:hover {
  background: #005ec4;
}

.conflict-btn-overwrite {
  background: #f5f5f5;
  color: #333;
}

.conflict-btn-overwrite:hover {
  background: #e8e8e8;
}

.conflict-btn-cancel {
  background: transparent;
  color: #888;
  border-color: transparent;
}

.conflict-btn-cancel:hover {
  color: #555;
  background: #f0f0f0;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .conflict-dialog {
    background: #2d2d2d;
  }
  .conflict-title {
    color: #f0f0f0;
  }
  .conflict-message {
    color: #aaa;
  }
  .conflict-sub {
    color: #888;
  }
  .conflict-btn-overwrite {
    background: #3d3d3d;
    color: #e0e0e0;
    border-color: #555;
  }
  .conflict-btn-overwrite:hover {
    background: #4d4d4d;
  }
  .conflict-btn-cancel {
    color: #888;
  }
  .conflict-btn-cancel:hover {
    background: #3d3d3d;
    color: #bbb;
  }
}
</style>
