<template>
  <div class="pref-pane">
    <!-- Pandoc Binary Path -->
    <div class="pref-group">
      <h3 class="pref-group-title">Pandoc</h3>
      <div class="pref-row pref-row-status">
        <label class="pref-label">Status</label>
        <span :class="['pref-status-badge', store.pandocAvailable ? 'pref-status-ok' : 'pref-status-error']">
          {{ store.pandocAvailable ? 'Installed' : 'Not Found' }}
        </span>
      </div>
      <div class="pref-row">
        <label class="pref-label">Pandoc binary path</label>
        <div class="pref-path-row">
          <input
            type="text"
            class="pref-input pref-input-path"
            :value="store.settings.pandocPath"
            :placeholder="store.detectedPandocPath || '/usr/local/bin/pandoc'"
            @input="onPandocPathInput(($event.target as HTMLInputElement).value)"
          />
          <button class="pref-btn pref-btn-browse" @click="store.selectPandocPath()" title="Browse for Pandoc binary">
            Browse...
          </button>
          <button
            v-if="store.settings.pandocPath"
            class="pref-btn pref-btn-clear"
            @click="store.clearPandocPath()"
            title="Clear custom path and auto-detect"
          >
            Clear
          </button>
        </div>
      </div>
      <p class="pref-hint pref-pandoc-status">
        <template v-if="store.pandocAvailable">
          {{ store.pandocVersion }}
          <span class="pref-path-display">{{ store.effectivePandocPath }}</span>
        </template>
        <template v-else>
          Pandoc is required for exporting to PDF, Word, LaTeX, EPUB, and RTF.
          <a href="#" class="pref-link" @click.prevent="openPandocInstall">Install Pandoc</a>
        </template>
      </p>
      <div class="pref-row">
        <button class="pref-btn pref-btn-secondary" @click="store.detectPandoc()">
          Re-detect Pandoc
        </button>
      </div>
    </div>

    <!-- Default Export Format -->
    <div class="pref-group">
      <h3 class="pref-group-title">Export Defaults</h3>
      <div class="pref-row">
        <label class="pref-label">Default export format</label>
        <select
          class="pref-select"
          :value="store.settings.defaultFormat"
          @change="store.update('defaultFormat', ($event.target as HTMLSelectElement).value as any)"
        >
          <option
            v-for="fmt in store.exportFormats"
            :key="fmt.id"
            :value="fmt.id"
          >
            {{ fmt.label }}
          </option>
        </select>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            :checked="store.settings.standalone"
            @change="store.update('standalone', ($event.target as HTMLInputElement).checked)"
          />
          Generate standalone documents (include headers/footers)
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            :checked="store.settings.addTableOfContents"
            @change="store.update('addTableOfContents', ($event.target as HTMLInputElement).checked)"
          />
          Include table of contents
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            :checked="store.settings.openAfterExport"
            @change="store.update('openAfterExport', ($event.target as HTMLInputElement).checked)"
          />
          Open file after export
        </label>
      </div>
    </div>

    <!-- Export Template -->
    <div class="pref-group">
      <h3 class="pref-group-title">Export Template</h3>
      <div class="pref-row">
        <label class="pref-label">Custom Pandoc template</label>
        <div class="pref-path-row">
          <input
            type="text"
            class="pref-input pref-input-path"
            :value="store.settings.customTemplatePath"
            placeholder="Use default Pandoc template"
            readonly
          />
          <button class="pref-btn pref-btn-browse" @click="store.selectExportTemplate()">
            Browse...
          </button>
          <button
            v-if="store.settings.customTemplatePath"
            class="pref-btn pref-btn-clear"
            @click="store.clearExportTemplate()"
            title="Clear custom template"
          >
            Clear
          </button>
        </div>
      </div>
      <p class="pref-hint">
        Specify a custom Pandoc template file for exports.
        Leave empty to use Pandoc's default templates.
      </p>
    </div>

    <!-- Advanced Export Settings -->
    <div class="pref-group">
      <h3 class="pref-group-title">Advanced</h3>
      <div class="pref-row">
        <label class="pref-label">Extra Pandoc arguments</label>
        <input
          type="text"
          class="pref-input"
          :value="store.settings.extraPandocArgs"
          placeholder="e.g., --highlight-style=tango --toc-depth=3"
          @input="store.update('extraPandocArgs', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <p class="pref-hint">
        Additional command-line arguments passed to Pandoc during export.
        These are appended after gdown's default arguments.
      </p>
    </div>

    <!-- Reset -->
    <div class="pref-group pref-group-actions">
      <button class="pref-btn pref-btn-secondary" @click="store.reset()">
        Reset to Defaults
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useExportSettingsStore } from '../../stores/exportSettings'

const store = useExportSettingsStore()

let pandocPathDebounce: ReturnType<typeof setTimeout> | null = null

function onPandocPathInput(value: string) {
  // Debounce manual path input to avoid excessive Pandoc detection
  if (pandocPathDebounce) clearTimeout(pandocPathDebounce)
  store.update('pandocPath', value)
  pandocPathDebounce = setTimeout(() => {
    store.detectPandoc()
  }, 800)
}

function openPandocInstall() {
  try {
    window.open('https://pandoc.org/installing.html', '_blank')
  } catch {
    console.log('Open https://pandoc.org/installing.html to install Pandoc')
  }
}
</script>
