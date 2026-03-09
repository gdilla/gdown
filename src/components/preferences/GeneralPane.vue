<template>
  <div class="pref-pane">
    <!-- Saving -->
    <div class="pref-group">
      <h3 class="pref-group-title">Saving</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            v-model="prefs.autoSaveEnabled"
          />
          Auto save files after editing
        </label>
      </div>
      <div v-if="prefs.autoSaveEnabled" class="pref-row">
        <label class="pref-label">Auto save delay</label>
        <div class="pref-inline-group">
          <input
            type="range"
            class="pref-range"
            :min="1"
            :max="30"
            :step="1"
            v-model.number="prefs.autoSaveIntervalSec"
          />
          <span class="pref-range-value">{{ prefs.autoSaveIntervalSec }}s</span>
        </div>
      </div>
    </div>

    <!-- Startup -->
    <div class="pref-group">
      <h3 class="pref-group-title">Startup</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            v-model="prefs.restoreSessionOnLaunch"
          />
          Restore last session on startup
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-label">Default editor mode</label>
        <select class="pref-select" v-model="prefs.defaultEditorMode">
          <option value="wysiwyg">WYSIWYG</option>
          <option value="source">Source Code</option>
        </select>
      </div>
    </div>

    <!-- Editor Behavior -->
    <div class="pref-group">
      <h3 class="pref-group-title">Editor</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            v-model="prefs.spellCheckEnabled"
          />
          Enable spell check
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            v-model="prefs.showWordCount"
          />
          Show word count in status bar
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            v-model="prefs.showLineNumbers"
          />
          Show line numbers in source mode
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            v-model="prefs.useHardLineBreaks"
          />
          Strict (Markdown spec) line breaks
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-label">Indent size</label>
        <select class="pref-select pref-select-narrow" v-model.number="prefs.indentSize">
          <option :value="2">2 spaces</option>
          <option :value="4">4 spaces</option>
          <option :value="8">8 spaces</option>
        </select>
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
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--pref-input-border, #ccc);
  border-radius: 2px;
  outline: none;
}

.pref-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: #007aff;
  border-radius: 50%;
  cursor: pointer;
}

.pref-range-value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--pref-hint-color, #888);
  min-width: 32px;
  text-align: right;
}

.pref-select-narrow {
  min-width: 100px;
}
</style>
