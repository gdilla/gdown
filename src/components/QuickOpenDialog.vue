<template>
  <Teleport to="body">
    <div v-if="visible" class="quick-open-overlay" @click.self="close">
      <div class="quick-open-box">
        <div class="quick-open-field">
          <input
            ref="inputEl"
            v-model="inputPath"
            type="text"
            placeholder="Enter file path (supports ~ for home)..."
            spellcheck="false"
            autocomplete="off"
            @keydown.enter="submit"
            @keydown.escape="close"
            @input="clearError"
          />
        </div>
        <div v-if="error" class="quick-open-error">{{ error }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useTabsStore } from '../stores/tabs'
import { useSidebarStore } from '../stores/sidebar'

interface ResolveResult {
  canonical_path: string
  exists: boolean
  is_file: boolean
}

const tabsStore = useTabsStore()
const sidebarStore = useSidebarStore()

const visible = ref(false)
const inputPath = ref('')
const error = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

function open() {
  inputPath.value = ''
  error.value = ''
  visible.value = true
  nextTick(() => {
    inputEl.value?.focus()
  })
}

function close() {
  visible.value = false
}

function clearError() {
  error.value = ''
}

async function submit() {
  const path = inputPath.value.trim()
  if (!path) return

  try {
    const result = await invoke<ResolveResult>('resolve_file_path', {
      path,
      baseDir: sidebarStore.rootPath ?? undefined,
    })

    if (!result.exists) {
      error.value = 'File does not exist'
      return
    }

    if (!result.is_file) {
      error.value = 'Path is a directory, not a file'
      return
    }

    await tabsStore.openFile(result.canonical_path)
    close()
  } catch (err) {
    error.value = String(err)
  }
}

function handleQuickOpen() {
  if (visible.value) {
    close()
  } else {
    open()
  }
}

onMounted(() => {
  window.addEventListener('gdown:quick-open', handleQuickOpen)
})

onUnmounted(() => {
  window.removeEventListener('gdown:quick-open', handleQuickOpen)
})
</script>

<style scoped>
.quick-open-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20vh;
  z-index: 9999;
}

.quick-open-box {
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  padding: 8px;
  width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.quick-open-field input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  font-size: 14px;
  font-family: var(--font-mono, ui-monospace, monospace);
  outline: none;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.quick-open-field input:focus {
  border-color: var(--accent-color, #4183c4);
}

.quick-open-error {
  padding: 4px 12px 4px;
  font-size: 12px;
  color: var(--error-color, #d32f2f);
}
</style>
