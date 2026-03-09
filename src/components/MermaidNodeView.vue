<template>
  <node-view-wrapper class="mermaid-block" :class="{ 'is-editing': isEditing }">
    <div class="mermaid-header">
      <span class="mermaid-label">Mermaid Diagram</span>
      <button
        class="mermaid-toggle-btn"
        @click="toggleEditing"
        :title="isEditing ? 'Preview diagram' : 'Edit source'"
      >
        {{ isEditing ? 'Preview' : 'Edit' }}
      </button>
    </div>

    <!-- Editable source code area -->
    <div v-if="isEditing" class="mermaid-source">
      <textarea
        ref="sourceTextarea"
        :value="node.textContent"
        @input="handleInput"
        @keydown="handleKeydown"
        spellcheck="false"
        placeholder="Enter Mermaid diagram code..."
        rows="6"
      ></textarea>
    </div>

    <!-- Rendered diagram preview -->
    <div v-else class="mermaid-preview" @dblclick="startEditing">
      <div v-if="renderError" class="mermaid-error">
        <span class="mermaid-error-icon">&#x26A0;</span>
        <span>{{ renderError }}</span>
      </div>
      <div v-else-if="svgOutput" v-html="svgOutput" class="mermaid-svg-container"></div>
      <div v-else class="mermaid-placeholder">
        <span>Double-click to add Mermaid diagram code</span>
      </div>
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import type { NodeViewProps } from '@tiptap/vue-3'
import mermaid from 'mermaid'

const props = defineProps<NodeViewProps>()

const isEditing = ref(false)
const svgOutput = ref('')
const renderError = ref('')
const sourceTextarea = ref<HTMLTextAreaElement | null>(null)

// Initialize mermaid with sensible defaults
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
})

let renderCounter = 0

async function renderDiagram() {
  const code = props.node.textContent.trim()
  if (!code) {
    svgOutput.value = ''
    renderError.value = ''
    return
  }

  try {
    renderCounter++
    const id = `mermaid-${Date.now()}-${renderCounter}`
    const { svg } = await mermaid.render(id, code)
    svgOutput.value = svg
    renderError.value = ''
  } catch (err: any) {
    renderError.value = err?.message || 'Failed to render diagram'
    svgOutput.value = ''
    // Clean up any error elements mermaid may have injected
    const errorEl = document.getElementById(`d${renderCounter}`)
    if (errorEl) errorEl.remove()
  }
}

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  const newContent = target.value

  // Update the node content through ProseMirror transaction
  const { tr } = props.editor.state
  const pos = props.getPos()
  if (typeof pos !== 'number') return

  // Replace the node's content
  const nodeStart = pos + 1 // +1 to get inside the node
  const nodeEnd = pos + props.node.nodeSize - 1

  if (newContent) {
    tr.replaceWith(
      nodeStart,
      nodeEnd,
      props.editor.state.schema.text(newContent)
    )
  } else {
    tr.delete(nodeStart, nodeEnd)
  }

  props.editor.view.dispatch(tr)
}

function handleKeydown(event: KeyboardEvent) {
  // Cmd+Enter or Escape: switch to preview mode
  if ((event.metaKey && event.key === 'Enter') || event.key === 'Escape') {
    event.preventDefault()
    stopEditing()
    return
  }

  // Tab: insert 2 spaces
  if (event.key === 'Tab') {
    event.preventDefault()
    const textarea = event.target as HTMLTextAreaElement
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const value = textarea.value
    textarea.value = value.substring(0, start) + '  ' + value.substring(end)
    textarea.selectionStart = textarea.selectionEnd = start + 2

    // Trigger input event to update node content
    textarea.dispatchEvent(new Event('input'))
  }
}

function toggleEditing() {
  if (isEditing.value) {
    stopEditing()
  } else {
    startEditing()
  }
}

function startEditing() {
  isEditing.value = true
  nextTick(() => {
    if (sourceTextarea.value) {
      sourceTextarea.value.focus()
      // Auto-resize
      autoResize(sourceTextarea.value)
    }
  })
}

function stopEditing() {
  isEditing.value = false
  renderDiagram()
}

function autoResize(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto'
  textarea.style.height = textarea.scrollHeight + 'px'
}

// Render on mount
onMounted(() => {
  renderDiagram()
})

// Re-render when node content changes externally (e.g., undo/redo)
watch(
  () => props.node.textContent,
  () => {
    if (!isEditing.value) {
      renderDiagram()
    }
    // Auto-resize textarea if editing
    if (isEditing.value && sourceTextarea.value) {
      nextTick(() => autoResize(sourceTextarea.value!))
    }
  }
)
</script>

<style scoped>
.mermaid-block {
  margin: 1em 0;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
  transition: border-color 0.2s;
}

.mermaid-block:hover {
  border-color: #c8ccd0;
}

.mermaid-block.is-editing {
  border-color: #4183c4;
  box-shadow: 0 0 0 1px #4183c4;
}

.mermaid-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background: #f6f8fa;
  border-bottom: 1px solid #e1e4e8;
  font-size: 12px;
}

.mermaid-label {
  color: #586069;
  font-weight: 500;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}

.mermaid-toggle-btn {
  background: none;
  border: 1px solid #d1d5da;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: #586069;
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  transition: background 0.15s, color 0.15s;
}

.mermaid-toggle-btn:hover {
  background: #e1e4e8;
  color: #24292e;
}

.mermaid-source {
  padding: 0;
}

.mermaid-source textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px 16px;
  border: none;
  outline: none;
  resize: vertical;
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #24292e;
  background: #fafbfc;
  box-sizing: border-box;
  tab-size: 2;
}

.mermaid-source textarea::placeholder {
  color: #aaa;
}

.mermaid-preview {
  padding: 16px;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.mermaid-svg-container {
  width: 100%;
  display: flex;
  justify-content: center;
}

.mermaid-svg-container :deep(svg) {
  max-width: 100%;
  height: auto;
}

.mermaid-placeholder {
  color: #aaa;
  font-size: 14px;
  font-style: italic;
  padding: 20px;
}

.mermaid-error {
  color: #cb2431;
  background: #ffeef0;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 13px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
}

.mermaid-error-icon {
  flex-shrink: 0;
}
</style>
