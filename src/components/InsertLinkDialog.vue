<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="cancel">
      <div class="dialog-box">
        <h3>Insert Link</h3>
        <div class="dialog-field">
          <label for="link-text">Text</label>
          <input
            id="link-text"
            ref="textInput"
            v-model="linkText"
            type="text"
            placeholder="Link text"
          />
        </div>
        <div class="dialog-field">
          <label for="link-url">URL</label>
          <input
            id="link-url"
            ref="urlInput"
            v-model="linkUrl"
            type="url"
            placeholder="https://example.com"
            @keydown.enter="confirm"
          />
        </div>
        <div class="dialog-field">
          <label for="link-title">Title (optional)</label>
          <input
            id="link-title"
            v-model="linkTitle"
            type="text"
            placeholder="Tooltip text"
            @keydown.enter="confirm"
          />
        </div>
        <div class="dialog-actions">
          <button class="btn btn-cancel" @click="cancel">Cancel</button>
          <button class="btn btn-confirm" :disabled="!linkUrl" @click="confirm">Insert</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import type { Editor } from '@tiptap/core'

const props = defineProps<{
  editor: Editor
}>()

const visible = ref(false)
const linkText = ref('')
const linkUrl = ref('')
const linkTitle = ref('')
const textInput = ref<HTMLInputElement | null>(null)
const urlInput = ref<HTMLInputElement | null>(null)

let savedFrom = 0
let savedTo = 0
let selectedText = ''

function handleInsertLink(event: Event) {
  const detail = (event as CustomEvent).detail || {}
  savedFrom = detail.from || 0
  savedTo = detail.to || 0
  selectedText = detail.text || ''
  linkText.value = selectedText
  linkUrl.value = ''
  linkTitle.value = ''
  visible.value = true
  nextTick(() => {
    if (linkText.value) {
      urlInput.value?.focus()
    } else {
      textInput.value?.focus()
    }
  })
}

function confirm() {
  const href = linkUrl.value.trim()
  if (!href) return

  const attrs = { href, title: linkTitle.value || null, target: '_blank' }
  const range = { from: savedFrom, to: savedTo }
  const text = linkText.value || href
  const chain = props.editor.chain().focus()

  if (savedFrom !== savedTo && text === selectedText) {
    // Unchanged selection: link it in place, keeping its inline formatting.
    chain.setTextSelection(range).setLink(attrs).run()
  } else {
    chain.insertContentAt(range, { type: 'text', text, marks: [{ type: 'link', attrs }] }).run()
  }

  visible.value = false
}

function cancel() {
  visible.value = false
  props.editor.commands.focus()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && visible.value) {
    cancel()
  }
}

onMounted(() => {
  window.addEventListener('gdown:insert-link', handleInsertLink)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('gdown:insert-link', handleInsertLink)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-box {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 24px;
  width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-box h3 {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
}

.dialog-field {
  margin-bottom: 12px;
}

.dialog-field label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.dialog-field input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--input-border);
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.dialog-field input:focus {
  border-color: var(--focus-outline);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn {
  padding: 6px 16px;
  border-radius: 4px;
  border: 1px solid var(--input-border);
  cursor: pointer;
  font-size: 13px;
}

.btn-cancel {
  background: var(--bg-primary);
}

.btn-confirm {
  background: var(--link-color);
  color: var(--accent-text);
  border-color: var(--link-color);
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
