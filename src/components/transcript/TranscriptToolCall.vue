<template>
  <div class="transcript-tool-call" :class="{ 'transcript-tool-call--expanded': !collapsed }">
    <button class="transcript-tool-call__toggle" @click="collapsed = !collapsed">
      <span class="transcript-tool-call__chevron">{{ collapsed ? '\u25B6' : '\u25BC' }}</span>
      <span class="transcript-tool-call__name">{{ toolCall.name }}</span>
      <span v-if="filePath" class="transcript-tool-call__path">{{ filePath }}</span>
      <span v-if="toolCall.isError" class="transcript-tool-call__error-badge">error</span>
    </button>
    <div v-if="!collapsed" class="transcript-tool-call__body">
      <div class="transcript-tool-call__section">
        <div class="transcript-tool-call__label">Input</div>
        <pre class="transcript-tool-call__pre">{{ formattedInput }}</pre>
      </div>
      <div v-if="toolCall.result !== null" class="transcript-tool-call__section">
        <div class="transcript-tool-call__label">Result</div>
        <pre
          class="transcript-tool-call__pre"
          :class="{ 'transcript-tool-call__pre--error': toolCall.isError }"
          >{{ toolCall.result }}</pre
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ToolCall } from '../../utils/transcriptParser'

const props = defineProps<{
  toolCall: ToolCall
}>()

const collapsed = ref(true)

const filePath = computed(() => {
  const fp = props.toolCall.input.file_path ?? props.toolCall.input.path
  return typeof fp === 'string' ? fp : null
})

const formattedInput = computed(() => {
  try {
    return JSON.stringify(props.toolCall.input, null, 2)
  } catch {
    return String(props.toolCall.input)
  }
})
</script>

<style scoped>
.transcript-tool-call {
  margin: 4px 0;
  border-radius: 4px;
  overflow: hidden;
}

.transcript-tool-call__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.transcript-tool-call__toggle:hover {
  background: var(--sidebar-hover-bg);
}

.transcript-tool-call__chevron {
  font-size: 10px;
  color: var(--sidebar-chevron-color);
  flex-shrink: 0;
}

.transcript-tool-call__name {
  font-weight: 600;
  color: var(--sidebar-selected-color);
}

.transcript-tool-call__path {
  color: var(--sidebar-text-color);
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transcript-tool-call__error-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--sidebar-error-color);
  color: var(--bg-primary);
  flex-shrink: 0;
}

.transcript-tool-call__body {
  padding: 8px 12px;
  background: var(--sidebar-bg);
  border-radius: 0 0 4px 4px;
}

.transcript-tool-call__section {
  margin-bottom: 8px;
}

.transcript-tool-call__section:last-child {
  margin-bottom: 0;
}

.transcript-tool-call__label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sidebar-title-color);
  margin-bottom: 4px;
}

.transcript-tool-call__pre {
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 8px;
  background: var(--bg-primary);
  border-radius: 3px;
  color: var(--text-primary);
  max-height: 300px;
  overflow-y: auto;
}

.transcript-tool-call__pre--error {
  color: var(--sidebar-error-color);
}
</style>
