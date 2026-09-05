<template>
  <div class="pref-pane">
    <div class="pref-group">
      <h3 class="pref-group-title">Startup</h3>
      <div class="pref-row">
        <label class="pref-label" for="editor-default-mode">Startup editing mode</label>
        <select id="editor-default-mode" v-model="settings.defaultMode" class="pref-select">
          <option value="wysiwyg">WYSIWYG</option>
          <option value="source">Source</option>
        </select>
      </div>
      <p class="pref-hint">Start Leaf in this editing mode.</p>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Editor</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label" for="editor-spell-check">
          <input
            id="editor-spell-check"
            v-model="settings.spellCheck"
            type="checkbox"
            class="pref-checkbox"
          />
          Enable spell check
        </label>
      </div>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Source Mode</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label" for="editor-line-numbers">
          <input
            id="editor-line-numbers"
            v-model="settings.showLineNumbers"
            type="checkbox"
            class="pref-checkbox"
          />
          Show line numbers
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label" for="editor-whitespace">
          <input
            id="editor-whitespace"
            v-model="settings.showWhitespace"
            type="checkbox"
            class="pref-checkbox"
          />
          Show whitespace characters
        </label>
      </div>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Indentation</h3>
      <div class="pref-row">
        <label class="pref-label" for="editor-indent-size">Indent size</label>
        <select id="editor-indent-size" v-model.number="settings.indentSize" class="pref-select">
          <option :value="2">2 spaces</option>
          <option :value="4">4 spaces</option>
          <option :value="8">8 spaces</option>
        </select>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label" for="editor-soft-tabs">
          <input
            id="editor-soft-tabs"
            v-model="settings.softTabs"
            type="checkbox"
            class="pref-checkbox"
          />
          Use spaces when inserting tabs
        </label>
      </div>
    </div>

    <div class="pref-group pref-group-actions">
      <button class="pref-btn pref-btn-secondary" type="button" @click="resetDefaults">
        Reset Editor Settings
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorSettingsStore } from '../../stores/editorSettings'

const settings = useEditorSettingsStore()

function resetDefaults() {
  if (confirm('Reset editor settings to their default values?')) {
    settings.resetToDefaults()
  }
}
</script>

<style scoped>
.pref-group-actions {
  border: none;
  padding: 8px 0;
  background: transparent;
}
</style>
