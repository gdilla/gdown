<template>
  <div class="pref-pane">
    <!-- Default Mode -->
    <div class="pref-group">
      <h3 class="pref-group-title">Default Mode</h3>
      <div class="pref-row">
        <label class="pref-label">Editing mode</label>
        <select class="pref-select" v-model="settings.defaultMode">
          <option value="wysiwyg">WYSIWYG</option>
          <option value="source">Source Code</option>
        </select>
      </div>
      <p class="pref-hint">New files will open in this mode by default.</p>
    </div>

    <!-- Font -->
    <div class="pref-group">
      <h3 class="pref-group-title">Font</h3>
      <div class="pref-row">
        <label class="pref-label">Font family</label>
        <input
          type="text"
          class="pref-input"
          v-model="settings.fontFamily"
          placeholder="Default (System)"
        />
      </div>
      <p class="pref-hint">Leave empty for system default. Use CSS font family names, e.g. "JetBrains Mono", "Fira Code".</p>
      <div class="pref-row">
        <label class="pref-label">Font size</label>
        <div class="pref-number-group">
          <input
            type="number"
            class="pref-number"
            v-model.number="settings.fontSize"
            min="10"
            max="32"
            step="1"
          />
          <span class="pref-unit">px</span>
        </div>
      </div>
      <div class="pref-row">
        <label class="pref-label">Line height</label>
        <div class="pref-number-group">
          <input
            type="number"
            class="pref-number"
            v-model.number="settings.lineHeight"
            min="1.0"
            max="3.0"
            step="0.1"
          />
        </div>
      </div>
      <div class="pref-row">
        <label class="pref-label">Max editor width</label>
        <div class="pref-number-group">
          <input
            type="number"
            class="pref-number"
            v-model.number="settings.maxEditorWidth"
            min="0"
            max="2000"
            step="20"
          />
          <span class="pref-unit">px</span>
        </div>
      </div>
      <p class="pref-hint">0 = unlimited width (content stretches to fill window).</p>
    </div>

    <!-- Editor Behavior -->
    <div class="pref-group">
      <h3 class="pref-group-title">Behavior</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" v-model="settings.spellCheck" />
          Enable spell check
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" v-model="settings.highlightCurrentLine" />
          Highlight current line
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" v-model="settings.wordWrap" />
          Word wrap
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" v-model="settings.showFrontMatter" />
          Show YAML front matter
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-label">Auto-pair brackets &amp; quotes</label>
        <select class="pref-select" v-model="settings.autoPairBrackets">
          <option value="always">Always</option>
          <option value="never">Never</option>
        </select>
      </div>
      <div class="pref-row">
        <label class="pref-label">Auto-pair markdown syntax</label>
        <select class="pref-select" v-model="settings.autoPairMarkdownSyntax">
          <option value="always">Always</option>
          <option value="never">Never</option>
        </select>
      </div>
      <p class="pref-hint">Automatically close bold (**), italic (*), code (`), etc.</p>
    </div>

    <!-- Source Mode -->
    <div class="pref-group">
      <h3 class="pref-group-title">Source Mode</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" v-model="settings.showLineNumbers" />
          Show line numbers
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" v-model="settings.showWhitespace" />
          Show whitespace characters
        </label>
      </div>
    </div>

    <!-- Indentation -->
    <div class="pref-group">
      <h3 class="pref-group-title">Indentation</h3>
      <div class="pref-row">
        <label class="pref-label">Indent size</label>
        <select class="pref-select" v-model.number="settings.indentSize">
          <option :value="2">2 spaces</option>
          <option :value="4">4 spaces</option>
          <option :value="8">8 spaces</option>
        </select>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" v-model="settings.softTabs" />
          Use soft tabs (spaces instead of tab characters)
        </label>
      </div>
    </div>

    <!-- Saving -->
    <div class="pref-group">
      <h3 class="pref-group-title">Saving</h3>
      <div class="pref-row">
        <label class="pref-label">Auto-save delay</label>
        <div class="pref-number-group">
          <input
            type="number"
            class="pref-number"
            :value="autoSaveSeconds"
            @input="onAutoSaveInput"
            min="0"
            max="60"
            step="0.5"
          />
          <span class="pref-unit">sec</span>
        </div>
      </div>
      <p class="pref-hint">Set to 0 to disable auto-save. Changes are saved after this delay.</p>
      <div class="pref-row">
        <label class="pref-label">Default line ending</label>
        <select class="pref-select" v-model="settings.lineEnding">
          <option value="lf">LF (Unix/macOS)</option>
          <option value="crlf">CRLF (Windows)</option>
        </select>
      </div>
    </div>

    <!-- Default Modes -->
    <div class="pref-group">
      <h3 class="pref-group-title">Default View Modes</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" v-model="settings.defaultTypewriterMode" />
          Enable typewriter mode on startup
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" v-model="settings.defaultFocusMode" />
          Enable focus mode on startup
        </label>
      </div>
    </div>

    <!-- Reset -->
    <div class="pref-group editor-pane-actions">
      <button class="pref-btn-reset" @click="resetDefaults">
        Reset to Defaults
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorSettingsStore } from '../../stores/editorSettings'

const settings = useEditorSettingsStore()

/** Display auto-save delay as seconds (store uses milliseconds) */
const autoSaveSeconds = computed(() => {
  return Math.round((settings.autoSaveDelay / 1000) * 10) / 10
})

function onAutoSaveInput(e: Event) {
  const target = e.target as HTMLInputElement
  const seconds = parseFloat(target.value)
  if (!isNaN(seconds) && seconds >= 0) {
    settings.autoSaveDelay = Math.round(seconds * 1000)
  }
}

function resetDefaults() {
  if (confirm('Reset all editor settings to their default values?')) {
    settings.resetToDefaults()
  }
}
</script>

<style scoped>
/* Additional styles specific to EditorPane that extend global pref-* styles */
.pref-number-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pref-unit {
  font-size: 12px;
  color: var(--pref-hint-color, #888);
  min-width: 20px;
}

.editor-pane-actions {
  display: flex;
  justify-content: flex-start;
  background: transparent;
  border: none;
  padding: 8px 0;
}

.pref-btn-reset {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--pref-input-bg, #fff);
  border: 1px solid var(--pref-input-border, #ccc);
  color: var(--pref-label-color, #444);
}

.pref-btn-reset:hover {
  background: #f0f0f0;
  border-color: #bbb;
}

.pref-btn-reset:active {
  background: #e4e4e4;
}
</style>
