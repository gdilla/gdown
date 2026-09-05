<template>
  <div class="pref-pane">
    <div class="pref-group">
      <h3 class="pref-group-title">Pandoc</h3>
      <div class="pref-row pref-row-status">
        <span class="pref-label">Status</span>
        <span
          :class="[
            'pref-status-badge',
            store.pandocAvailable ? 'pref-status-ok' : 'pref-status-error',
          ]"
        >
          {{ store.pandocAvailable ? 'Installed' : 'Not Found' }}
        </span>
      </div>
      <p class="pref-hint pref-pandoc-status">
        <template v-if="store.pandocAvailable">
          {{ store.pandocVersion }}
          <span class="pref-path-display">{{ store.effectivePandocPath }}</span>
        </template>
        <template v-else>
          Pandoc is required for exporting to HTML, PDF, Word, LaTeX, EPUB, and RTF.
          <a href="#" class="pref-link" @click.prevent="openPandocInstall">Install Pandoc</a>
        </template>
      </p>
      <div class="pref-row">
        <button class="pref-btn pref-btn-secondary" type="button" @click="store.detectPandoc()">
          Re-detect Pandoc
        </button>
      </div>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Export Defaults</h3>
      <div class="pref-row">
        <label class="pref-label" for="export-default-format">Default export format</label>
        <select
          id="export-default-format"
          class="pref-select"
          :value="store.settings.defaultFormat"
          @change="setDefaultFormat"
        >
          <option v-for="format in store.exportFormats" :key="format.id" :value="format.id">
            {{ format.label }}
          </option>
        </select>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label" for="export-standalone">
          <input
            id="export-standalone"
            v-model="store.settings.standalone"
            type="checkbox"
            class="pref-checkbox"
          />
          Generate standalone documents
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label" for="export-toc">
          <input
            id="export-toc"
            v-model="store.settings.addTableOfContents"
            type="checkbox"
            class="pref-checkbox"
          />
          Include a table of contents
        </label>
      </div>
      <p class="pref-hint">These values are used as the defaults in the Export dialog.</p>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Template</h3>
      <div class="pref-row">
        <label class="pref-label" for="export-template">Custom Pandoc template</label>
        <div class="pref-path-row">
          <input
            id="export-template"
            type="text"
            class="pref-input pref-input-path"
            :value="store.settings.customTemplatePath"
            placeholder="Use Pandoc's default template"
            readonly
          />
          <button
            class="pref-btn pref-btn-browse"
            type="button"
            @click="store.selectExportTemplate()"
          >
            Browse...
          </button>
          <button
            v-if="store.settings.customTemplatePath"
            class="pref-btn pref-btn-clear"
            type="button"
            title="Clear custom template"
            @click="store.clearExportTemplate()"
          >
            Clear
          </button>
        </div>
      </div>
      <p class="pref-hint">Leave empty to use Pandoc's default template.</p>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Additional Arguments</h3>
      <div class="pref-row">
        <label class="pref-label" for="export-extra-args">Pandoc flags</label>
        <input
          id="export-extra-args"
          v-model="store.settings.extraPandocArgs"
          type="text"
          class="pref-input"
          placeholder="e.g. --toc-depth=3 --number-sections"
        />
      </div>
      <p class="pref-hint">Appended to the Pandoc command when you export.</p>
    </div>

    <div class="pref-group pref-group-actions">
      <button class="pref-btn pref-btn-secondary" type="button" @click="store.reset()">
        Reset Export Settings
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useExportSettingsStore, type ExportFormat } from '../../stores/exportSettings'

const store = useExportSettingsStore()

function setDefaultFormat(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (store.exportFormats.some((format) => format.id === value)) {
    store.update('defaultFormat', value as ExportFormat)
  }
}

async function openPandocInstall() {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl('https://pandoc.org/installing.html')
  } catch {
    window.open('https://pandoc.org/installing.html', '_blank')
  }
}
</script>
