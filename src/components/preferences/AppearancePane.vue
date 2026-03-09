<template>
  <div class="pref-pane">
    <!-- Theme Selection -->
    <div class="pref-group">
      <h3 class="pref-group-title">Theme</h3>
      <div class="theme-picker">
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          class="theme-option"
          :class="{ active: prefs.theme === opt.value }"
          @click="prefs.theme = opt.value"
        >
          <div class="theme-preview" :class="`preview-${opt.value}`">
            <div class="preview-sidebar" />
            <div class="preview-content">
              <div class="preview-line short" />
              <div class="preview-line" />
              <div class="preview-line medium" />
            </div>
          </div>
          <span class="theme-label">{{ opt.label }}</span>
        </button>
      </div>
      <p v-if="prefs.theme === 'auto'" class="pref-hint">
        Currently using <strong>{{ prefs.resolvedTheme }}</strong> mode (follows system preference)
      </p>
    </div>

    <!-- Typography -->
    <div class="pref-group">
      <h3 class="pref-group-title">Typography</h3>

      <div class="pref-row">
        <label class="pref-label">Font size</label>
        <div class="stepper-control">
          <button
            class="stepper-btn"
            @click="adjustFontSize(-1)"
            :disabled="prefs.fontSize <= 10"
          >−</button>
          <span class="stepper-value">{{ prefs.fontSize }}px</span>
          <button
            class="stepper-btn"
            @click="adjustFontSize(1)"
            :disabled="prefs.fontSize >= 32"
          >+</button>
        </div>
      </div>

      <div class="pref-row">
        <label class="pref-label">Line height</label>
        <div class="range-control">
          <input
            type="range"
            class="pref-range"
            :min="1.0"
            :max="2.5"
            :step="0.1"
            v-model.number="prefs.lineHeight"
          />
          <span class="range-value">{{ prefs.lineHeight.toFixed(1) }}</span>
        </div>
      </div>

      <div class="pref-row">
        <label class="pref-label">Editor max width</label>
        <div class="range-control">
          <input
            type="range"
            class="pref-range"
            :min="0"
            :max="1200"
            :step="50"
            v-model.number="prefs.editorWidth"
          />
          <span class="range-value">
            {{ prefs.editorWidth === 0 ? 'Full' : `${prefs.editorWidth}px` }}
          </span>
        </div>
      </div>
    </div>

    <!-- Live Preview -->
    <div class="pref-group">
      <h3 class="pref-group-title">Preview</h3>
      <div
        class="font-preview"
        :style="{
          fontSize: prefs.fontSize + 'px',
          lineHeight: prefs.lineHeight,
        }"
      >
        The quick brown fox jumps over the lazy dog.
        <strong>Bold text</strong>, <em>italic text</em>, and <code>inline code</code>.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePreferencesStore, type ThemeMode } from '../../stores/preferences'

const prefs = usePreferencesStore()

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'System' },
  { value: 'solarized-light', label: 'Sol. Light' },
  { value: 'solarized-dark', label: 'Sol. Dark' },
  { value: 'github', label: 'GitHub' },
]

function adjustFontSize(delta: number) {
  const newSize = prefs.fontSize + delta
  if (newSize >= 10 && newSize <= 32) {
    prefs.fontSize = newSize
  }
}
</script>

<style scoped>
/* Theme picker */
.theme-picker {
  display: flex;
  gap: 12px;
  margin-bottom: 4px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border: 2px solid transparent;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.theme-option:hover {
  border-color: var(--pref-input-border, #ccc);
}

.theme-option.active {
  border-color: #007aff;
}

.theme-preview {
  width: 100px;
  height: 68px;
  border-radius: 6px;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--pref-input-border, #ddd);
}

.preview-sidebar {
  width: 24px;
  flex-shrink: 0;
}

.preview-content {
  flex: 1;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-line {
  height: 4px;
  border-radius: 2px;
  width: 100%;
}

.preview-line.short { width: 50%; }
.preview-line.medium { width: 75%; }

/* Light */
.preview-light { background: #fff; }
.preview-light .preview-sidebar { background: #f0f0f0; border-right: 1px solid #ddd; }
.preview-light .preview-line { background: #ddd; }

/* Dark */
.preview-dark { background: #1e1e1e; border-color: #333; }
.preview-dark .preview-sidebar { background: #252525; border-right: 1px solid #333; }
.preview-dark .preview-line { background: #444; }

/* Auto (split) */
.preview-auto { background: linear-gradient(135deg, #fff 50%, #1e1e1e 50%); border-color: #999; }
.preview-auto .preview-sidebar { background: linear-gradient(135deg, #f0f0f0 50%, #252525 50%); border-right: 1px solid #999; }
.preview-auto .preview-line { background: linear-gradient(135deg, #ddd 50%, #444 50%); }

/* Solarized Light */
.preview-solarized-light { background: #fdf6e3; border-color: #ddd6c1; }
.preview-solarized-light .preview-sidebar { background: #eee8d5; border-right: 1px solid #ddd6c1; }
.preview-solarized-light .preview-line { background: #b58900; opacity: 0.3; }

/* Solarized Dark */
.preview-solarized-dark { background: #002b36; border-color: #0a4f5e; }
.preview-solarized-dark .preview-sidebar { background: #073642; border-right: 1px solid #0a4f5e; }
.preview-solarized-dark .preview-line { background: #586e75; }

/* GitHub */
.preview-github { background: #ffffff; border-color: #d0d7de; }
.preview-github .preview-sidebar { background: #f6f8fa; border-right: 1px solid #d0d7de; }
.preview-github .preview-line { background: #d0d7de; }

.theme-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--pref-label-color, #444);
}

/* Stepper control */
.stepper-control {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stepper-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--pref-input-border, #ccc);
  background: var(--pref-input-bg, #fff);
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: var(--pref-label-color, #444);
  transition: all 0.15s ease;
  user-select: none;
}

.stepper-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.04);
}

.stepper-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stepper-value {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  min-width: 44px;
  text-align: center;
  color: var(--pref-label-color, #444);
}

/* Range control */
.range-control {
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

.range-value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--pref-hint-color, #888);
  min-width: 44px;
  text-align: right;
}

/* Font preview */
.font-preview {
  padding: 14px;
  border: 1px solid var(--pref-input-border, #ddd);
  border-radius: 8px;
  background: var(--pref-input-bg, #fff);
  color: var(--pref-label-color, #444);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
}

.font-preview code {
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}

:root[data-theme="dark"] .font-preview code,
.dark .font-preview code {
  background: rgba(255, 255, 255, 0.1);
}

:root[data-theme="dark"] .stepper-btn:hover:not(:disabled),
.dark .stepper-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}
</style>
