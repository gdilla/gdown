<template>
  <div class="transcript-message" :class="`transcript-message--${message.role}`">
    <div class="transcript-message__header">
      <span class="transcript-message__role">{{
        message.role === 'human' ? 'Human' : 'Assistant'
      }}</span>
      <span v-if="formattedTime" class="transcript-message__time">{{ formattedTime }}</span>
    </div>
    <pre v-if="message.textContent" class="transcript-message__text">{{ message.textContent }}</pre>
    <div v-if="message.toolCalls.length > 0" class="transcript-message__tools">
      <TranscriptToolCall v-for="tc in message.toolCalls" :key="tc.id" :tool-call="tc" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ConversationMessage } from '../../utils/transcriptParser'
import TranscriptToolCall from './TranscriptToolCall.vue'

const props = defineProps<{
  message: ConversationMessage
}>()

const formattedTime = computed(() => {
  if (!props.message.timestamp) return null
  return props.message.timestamp.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})
</script>

<style scoped>
.transcript-message {
  padding: 16px 20px;
  border-radius: 6px;
  margin-bottom: 12px;
}

.transcript-message--human {
  background: var(--sidebar-bg);
}

.transcript-message--assistant {
  background: var(--bg-primary);
  border-left: 3px solid var(--sidebar-selected-color);
}

.transcript-message__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.transcript-message__role {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
}

.transcript-message__time {
  font-size: 11px;
  color: var(--sidebar-title-color);
}

.transcript-message__text {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: var(--text-primary);
}

.transcript-message__tools {
  margin-top: 8px;
}
</style>
