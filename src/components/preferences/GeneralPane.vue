<template>
  <div class="pref-pane">
    <div class="pref-group">
      <h3 class="pref-group-title">Saving</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label" for="general-auto-save">
          <input
            id="general-auto-save"
            v-model="prefs.autoSaveEnabled"
            type="checkbox"
            class="pref-checkbox"
          />
          Save files automatically after editing
        </label>
      </div>
      <div v-if="prefs.autoSaveEnabled" class="pref-row">
        <label class="pref-label" for="general-auto-save-delay">Auto-save delay</label>
        <div class="pref-inline-group">
          <input
            id="general-auto-save-delay"
            v-model.number="prefs.autoSaveIntervalSec"
            type="range"
            class="pref-range"
            min="1"
            max="30"
            step="1"
          />
          <span class="pref-range-value">{{ prefs.autoSaveIntervalSec }}s</span>
        </div>
      </div>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Startup</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label" for="general-restore-session">
          <input
            id="general-restore-session"
            v-model="prefs.restoreSessionOnLaunch"
            type="checkbox"
            class="pref-checkbox"
          />
          Restore last session on startup
        </label>
      </div>
      <p class="pref-hint">
        Reopen the tabs and sidebar state from your previous session when Leaf starts.
      </p>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Status Bar</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label" for="general-show-word-count">
          <input
            id="general-show-word-count"
            v-model="prefs.showWordCount"
            type="checkbox"
            class="pref-checkbox"
          />
          Show word count in the status bar
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePreferencesStore } from '../../stores/preferences'

const prefs = usePreferencesStore()
</script>

<style scoped>
.pref-inline-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pref-range {
  width: 120px;
}

.pref-range-value {
  min-width: 32px;
  color: var(--pref-hint-color, #888);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
