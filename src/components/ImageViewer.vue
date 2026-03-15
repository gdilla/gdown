<template>
  <div class="image-viewer">
    <div class="image-viewer-container">
      <img
        v-if="assetUrl"
        :src="assetUrl"
        :alt="fileName"
        class="image-preview"
        @error="handleError"
      />
      <div v-if="loadError" class="image-error">
        <p>Failed to load image</p>
        <p class="image-error-path">{{ filePath }}</p>
      </div>
    </div>
    <div class="image-info-bar">
      <span class="image-file-name">{{ fileName }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useTabsStore } from '../stores/tabs'

const tabsStore = useTabsStore()
const loadError = ref(false)

const filePath = computed(() => tabsStore.activeTab?.filePath ?? '')

const fileName = computed(() => {
  if (!filePath.value) return ''
  const parts = filePath.value.split('/')
  return parts[parts.length - 1] || ''
})

const assetUrl = computed(() => {
  if (!filePath.value) return ''
  return convertFileSrc(filePath.value)
})

function handleError() {
  loadError.value = true
}
</script>

<style>
.image-viewer {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--editor-bg, #fff);
}

.image-viewer-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 24px;
}

.image-preview {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.image-info-bar {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  border-top: 1px solid var(--sidebar-border, #e0e0e0);
  background: var(--sidebar-bg, #f5f5f5);
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.image-file-name {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.image-error {
  text-align: center;
  color: var(--text-secondary, #888);
}

.image-error-path {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  margin-top: 8px;
}
</style>
