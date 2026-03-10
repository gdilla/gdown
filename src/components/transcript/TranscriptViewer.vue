<template>
  <div class="transcript-viewer">
    <div v-if="transcriptStore.loading" class="transcript-viewer__status">
      Loading transcript...
    </div>
    <div
      v-else-if="transcriptStore.error"
      class="transcript-viewer__status transcript-viewer__status--error"
    >
      {{ transcriptStore.error }}
    </div>
    <template v-else-if="transcriptStore.transcript">
      <TranscriptSummary :summary="transcriptStore.transcript.summary" />
      <div class="transcript-viewer__messages">
        <div class="transcript-viewer__content">
          <TranscriptMessage
            v-for="msg in transcriptStore.transcript.messages"
            :key="msg.id"
            :message="msg"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useTranscriptStore } from '../../stores/transcript'
import { useTabsStore } from '../../stores/tabs'
import TranscriptSummary from './TranscriptSummary.vue'
import TranscriptMessage from './TranscriptMessage.vue'

const transcriptStore = useTranscriptStore()
const tabsStore = useTabsStore()

watch(
  () => tabsStore.activeTab,
  (tab) => {
    if (tab?.fileType === 'transcript' && tab.filePath) {
      transcriptStore.loadTranscript(tab.filePath)
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.transcript-viewer {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.transcript-viewer__status {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--sidebar-title-color);
}

.transcript-viewer__status--error {
  color: var(--sidebar-error-color);
}

.transcript-viewer__messages {
  flex: 1;
  overflow-y: auto;
}

.transcript-viewer__content {
  max-width: 860px;
  margin: 0 auto;
  padding: 40px 60px;
}
</style>
