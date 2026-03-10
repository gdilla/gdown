<template>
  <div class="transcript-summary">
    <div class="transcript-summary__stats">
      <span class="transcript-summary__stat">
        <strong>{{ summary.messageCount }}</strong> messages
      </span>
      <span class="transcript-summary__separator">&middot;</span>
      <span class="transcript-summary__stat">
        <strong>{{ summary.toolCallCount }}</strong> tool calls
      </span>
      <template v-if="summary.duration">
        <span class="transcript-summary__separator">&middot;</span>
        <span class="transcript-summary__stat">{{ summary.duration }}</span>
      </template>
    </div>
    <div v-if="summary.filesReferenced.length > 0" class="transcript-summary__files">
      <span class="transcript-summary__files-label">Files:</span>
      <span v-for="file in summary.filesReferenced" :key="file" class="transcript-summary__file">{{
        file
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TranscriptSummary } from '../../utils/transcriptParser'

defineProps<{
  summary: TranscriptSummary
}>()
</script>

<style scoped>
.transcript-summary {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--tab-bar-bg);
  border-bottom: 1px solid var(--sidebar-border);
  padding: 12px 20px;
}

.transcript-summary__stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.transcript-summary__separator {
  color: var(--sidebar-title-color);
}

.transcript-summary__files {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.transcript-summary__files-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sidebar-title-color);
  margin-right: 4px;
}

.transcript-summary__file {
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  font-size: 11px;
  padding: 2px 6px;
  background: var(--sidebar-bg);
  border-radius: 3px;
  color: var(--sidebar-text-color);
}
</style>
