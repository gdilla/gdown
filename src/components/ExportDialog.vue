<template>
  <Teleport to="body">
    <div
      v-if="exportStore.dialogVisible"
      class="export-overlay"
      @click.self="handleOverlayClick"
      @keydown.escape="exportStore.closeDialog"
    >
      <div class="export-dialog" role="dialog" aria-labelledby="export-title">
        <!-- Header -->
        <div class="export-header">
          <h2 id="export-title" class="export-title">Export Document</h2>
          <button
            class="export-close-btn"
            @click="exportStore.closeDialog"
            title="Close"
            :disabled="exportStore.isExporting"
          >
            &times;
          </button>
        </div>

        <!-- Pandoc Not Installed Warning -->
        <div v-if="exportStore.pandocChecked && !exportStore.isPandocAvailable" class="pandoc-missing">
          <div class="pandoc-missing-header">
            <span class="pandoc-missing-icon">&#9888;</span>
            <div>
              <strong class="pandoc-missing-title">Pandoc is required for export</strong>
              <p class="pandoc-missing-subtitle">
                gdown uses <a href="#" @click.prevent="openPandocHomepage" class="inline-link">Pandoc</a> to convert Markdown to other formats.
                It was not found on your system.
              </p>
            </div>
          </div>

          <div class="install-methods">
            <p class="install-methods-label">Install Pandoc using one of these methods:</p>

            <div class="install-method">
              <div class="install-method-header">
                <span class="method-badge recommended">Recommended</span>
                <span class="method-name">Homebrew</span>
              </div>
              <div class="install-command" @click="copyToClipboard('brew install pandoc')">
                <code>brew install pandoc</code>
                <span class="copy-hint" :class="{ copied: copiedMethod === 'brew' }">
                  {{ copiedMethod === 'brew' ? 'Copied!' : 'Click to copy' }}
                </span>
              </div>
            </div>

            <div class="install-method">
              <div class="install-method-header">
                <span class="method-badge">Alternative</span>
                <span class="method-name">MacPorts</span>
              </div>
              <div class="install-command" @click="copyToClipboard('sudo port install pandoc')">
                <code>sudo port install pandoc</code>
                <span class="copy-hint" :class="{ copied: copiedMethod === 'port' }">
                  {{ copiedMethod === 'port' ? 'Copied!' : 'Click to copy' }}
                </span>
              </div>
            </div>

            <div class="install-method">
              <div class="install-method-header">
                <span class="method-badge">Alternative</span>
                <span class="method-name">Official Installer (.pkg)</span>
              </div>
              <p class="method-description">
                Download the macOS installer from the
                <a href="#" @click.prevent="openPandocInstallPage" class="inline-link">Pandoc releases page</a>.
              </p>
            </div>
          </div>

          <div class="pandoc-missing-actions">
            <button
              class="retry-btn"
              @click="retryPandocCheck"
              :disabled="isRetrying"
            >
              <span v-if="isRetrying" class="spinner small"></span>
              {{ isRetrying ? 'Checking...' : '↻ Re-check Pandoc' }}
            </button>
            <button class="help-btn" @click="openPandocInstallPage">
              Open Install Guide ↗
            </button>
          </div>

          <p v-if="exportStore.pandocError" class="pandoc-error-detail">
            <strong>Details:</strong> {{ exportStore.pandocError }}
          </p>
        </div>

        <!-- Pandoc Info -->
        <div v-if="exportStore.pandocInfo" class="pandoc-info">
          <span class="pandoc-badge">{{ exportStore.pandocInfo.version }}</span>
        </div>

        <!-- Format Selection -->
        <div class="export-section">
          <label class="export-label">Format</label>
          <div class="format-grid">
            <button
              v-for="format in exportStore.formats"
              :key="format.id"
              class="format-option"
              :class="{ selected: exportStore.selectedFormatId === format.id }"
              @click="selectFormat(format.id)"
              :disabled="exportStore.isExporting || !exportStore.isPandocAvailable"
            >
              <span class="format-icon">{{ formatIcon(format.id) }}</span>
              <span class="format-label">{{ format.label }}</span>
              <span class="format-ext">.{{ format.extension }}</span>
            </button>
          </div>
        </div>

        <!-- Output Path -->
        <div class="export-section">
          <label class="export-label">Output Path</label>
          <div class="output-path-row">
            <input
              type="text"
              class="output-path-input"
              :value="displayOutputPath"
              readonly
              :placeholder="exportStore.getDefaultOutputPath() || 'Choose output location...'"
            />
            <button
              class="browse-btn"
              @click="exportStore.chooseOutputPath"
              :disabled="exportStore.isExporting || !exportStore.isPandocAvailable"
            >
              Browse...
            </button>
          </div>
        </div>

        <!-- Options -->
        <div class="export-section">
          <label class="export-label">Options</label>
          <div class="export-options">
            <label class="option-checkbox">
              <input
                type="checkbox"
                v-model="exportStore.includeToc"
                :disabled="exportStore.isExporting || !exportStore.isPandocAvailable"
              />
              <span>Include Table of Contents</span>
            </label>
          </div>
        </div>

        <!-- Extra Pandoc Flags (advanced) -->
        <details class="export-advanced">
          <summary class="advanced-summary">Advanced Options</summary>
          <div class="export-section">
            <label class="export-label">Extra Pandoc Flags</label>
            <input
              type="text"
              class="extra-flags-input"
              v-model="exportStore.extraFlags"
              placeholder="e.g., --highlight-style=tango --number-sections"
              :disabled="exportStore.isExporting || !exportStore.isPandocAvailable"
            />
            <p class="help-text">Additional command-line flags passed directly to Pandoc.</p>
          </div>
        </details>

        <!-- Status / Progress -->
        <div v-if="exportStore.status !== 'idle'" class="export-status" :class="exportStore.status">
          <div v-if="exportStore.status === 'checking'" class="status-content">
            <span class="spinner"></span>
            <span>Checking Pandoc installation...</span>
          </div>
          <div v-else-if="exportStore.status === 'exporting'" class="status-content">
            <span class="spinner"></span>
            <span>{{ exportStore.statusMessage }}</span>
          </div>
          <div v-else-if="exportStore.status === 'success'" class="status-content">
            <span class="status-icon success-icon">&#10003;</span>
            <span>{{ exportStore.statusMessage }}</span>
          </div>
          <div v-else-if="exportStore.status === 'error'" class="status-content">
            <span class="status-icon error-icon">&#10007;</span>
            <span class="error-message">{{ exportStore.statusMessage }}</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="export-actions">
          <button
            class="export-btn secondary"
            @click="exportStore.closeDialog"
            :disabled="exportStore.isExporting"
          >
            Cancel
          </button>
          <button
            class="export-btn primary"
            @click="handleExport"
            :disabled="!exportStore.canExport"
          >
            {{ exportStore.isExporting ? 'Exporting...' : 'Export' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useExportStore } from '../stores/export'

const exportStore = useExportStore()
const copiedMethod = ref<string | null>(null)
const isRetrying = ref(false)

const displayOutputPath = computed(() => {
  return exportStore.customOutputPath || exportStore.getDefaultOutputPath()
})

function selectFormat(formatId: string) {
  exportStore.selectedFormatId = formatId
  // Reset custom output path when format changes
  exportStore.customOutputPath = null
}

function formatIcon(formatId: string): string {
  const icons: Record<string, string> = {
    pdf: '\uD83D\uDCC4',
    html: '\uD83C\uDF10',
    word: '\uD83D\uDCDD',
    latex: '\uD835\uDCAB',
    epub: '\uD83D\uDCD6',
    rtf: '\uD83D\uDCC3',
  }
  return icons[formatId] || '\uD83D\uDCC4'
}

function handleOverlayClick() {
  if (!exportStore.isExporting) {
    exportStore.closeDialog()
  }
}

async function handleExport() {
  const success = await exportStore.performExport()
  if (success) {
    // Auto-close after a brief delay on success
    setTimeout(() => {
      exportStore.closeDialog()
    }, 2000)
  }
}

async function openPandocInstallPage() {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl('https://pandoc.org/installing.html')
  } catch {
    window.open('https://pandoc.org/installing.html', '_blank')
  }
}

async function openPandocHomepage() {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl('https://pandoc.org/')
  } catch {
    window.open('https://pandoc.org/', '_blank')
  }
}

async function retryPandocCheck() {
  isRetrying.value = true
  // Reset pandocChecked so checkPandoc runs fresh
  exportStore.pandocChecked = false
  exportStore.pandocError = null
  exportStore.status = 'idle'
  exportStore.statusMessage = ''
  await exportStore.checkPandoc()
  isRetrying.value = false
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    // Determine which method was copied for UI feedback
    copiedMethod.value = text.includes('port') ? 'port' : 'brew'
    setTimeout(() => {
      copiedMethod.value = null
    }, 2000)
  } catch {
    // Fallback: select text (won't work in all contexts but worth trying)
    console.warn('Failed to copy to clipboard')
  }
}
</script>

<style scoped>
.export-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(2px);
}

.export-dialog {
  background: var(--bg-primary, #ffffff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.08);
  width: 520px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px;
  animation: dialog-enter 0.2s ease-out;
}

@keyframes dialog-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Header */
.export-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.export-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin: 0;
}

.export-close-btn {
  background: none;
  border: none;
  font-size: 22px;
  color: #999;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  transition: all 0.15s ease;
}

.export-close-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #333;
}

.export-close-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Pandoc Missing Prompt */
.pandoc-missing {
  background: #fffbf0;
  border: 1px solid #f0d78e;
  border-radius: 10px;
  padding: 18px;
  margin-bottom: 20px;
}

.pandoc-missing-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.pandoc-missing-icon {
  font-size: 28px;
  flex-shrink: 0;
  line-height: 1;
}

.pandoc-missing-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #7a5d00;
  margin-bottom: 4px;
}

.pandoc-missing-subtitle {
  font-size: 12px;
  color: #8a7230;
  margin: 0;
  line-height: 1.5;
}

.inline-link {
  color: #0d6efd;
  text-decoration: underline;
  cursor: pointer;
}

.inline-link:hover {
  color: #0a58ca;
}

/* Install Methods */
.install-methods {
  margin-bottom: 14px;
}

.install-methods-label {
  font-size: 12px;
  font-weight: 600;
  color: #7a5d00;
  margin: 0 0 10px 0;
}

.install-method {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid #e8dbb8;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.install-method:last-child {
  margin-bottom: 0;
}

.install-method-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.method-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: #e8e8e8;
  color: #666;
}

.method-badge.recommended {
  background: #d4edda;
  color: #155724;
}

.method-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.method-description {
  font-size: 12px;
  color: #666;
  margin: 0;
  line-height: 1.4;
}

.install-command {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1e1e2e;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.install-command:hover {
  background: #2a2a3e;
}

.install-command code {
  font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: #a6e3a1;
}

.copy-hint {
  font-size: 10px;
  color: #888;
  transition: color 0.15s ease;
}

.copy-hint.copied {
  color: #a6e3a1;
  font-weight: 500;
}

/* Pandoc Missing Actions */
.pandoc-missing-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.retry-btn,
.help-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  gap: 4px;
}

.retry-btn {
  background: #4a9eff;
  color: #fff;
  border-color: #3d8ee6;
}

.retry-btn:hover:not(:disabled) {
  background: #3d8ee6;
}

.retry-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.help-btn {
  background: #f5f5f5;
  border-color: #d0d0d0;
  color: var(--text-primary, #333);
}

.help-btn:hover {
  background: #e8e8e8;
  border-color: #bbb;
}

.spinner.small {
  width: 12px;
  height: 12px;
  border-width: 1.5px;
}

.pandoc-error-detail {
  font-size: 11px;
  color: #a07830;
  margin: 0;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
  word-break: break-word;
}

.pandoc-error-detail strong {
  color: #8a6a20;
}

/* Pandoc Badge */
.pandoc-info {
  margin-bottom: 16px;
}

.pandoc-badge {
  display: inline-block;
  padding: 2px 10px;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

/* Sections */
.export-section {
  margin-bottom: 18px;
}

.export-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

/* Format Grid */
.format-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.format-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: var(--bg-primary, #ffffff);
  cursor: pointer;
  transition: all 0.15s ease;
}

.format-option:hover:not(:disabled) {
  border-color: #bbb;
  background: #f9f9f9;
}

.format-option.selected {
  border-color: #4a9eff;
  background: rgba(74, 158, 255, 0.06);
  box-shadow: 0 0 0 1px #4a9eff;
}

.format-option:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.format-icon {
  font-size: 20px;
}

.format-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #333);
}

.format-ext {
  font-size: 10px;
  color: #999;
}

/* Output Path */
.output-path-row {
  display: flex;
  gap: 8px;
}

.output-path-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary, #333);
  background: var(--bg-primary, #ffffff);
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
}

.output-path-input::placeholder {
  direction: ltr;
  color: #aaa;
}

.browse-btn {
  padding: 8px 14px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: #f5f5f5;
  color: var(--text-primary, #333);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.browse-btn:hover:not(:disabled) {
  background: #e8e8e8;
  border-color: #bbb;
}

.browse-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Options */
.export-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary, #333);
  cursor: pointer;
}

.option-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #4a9eff;
}

.option-checkbox input:disabled {
  cursor: not-allowed;
}

/* Advanced */
.export-advanced {
  margin-bottom: 18px;
}

.advanced-summary {
  font-size: 12px;
  color: #888;
  cursor: pointer;
  padding: 6px 0;
  user-select: none;
}

.advanced-summary:hover {
  color: #555;
}

.extra-flags-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary, #333);
  background: var(--bg-primary, #ffffff);
  font-family: 'SF Mono', Menlo, Monaco, monospace;
}

.extra-flags-input:disabled {
  opacity: 0.5;
}

.help-text {
  font-size: 11px;
  color: #aaa;
  margin-top: 4px;
}

/* Status */
.export-status {
  padding: 12px 14px;
  border-radius: 8px;
  margin-bottom: 18px;
  font-size: 13px;
}

.export-status.checking,
.export-status.exporting {
  background: #e3f2fd;
  color: #1565c0;
}

.export-status.success {
  background: #e8f5e9;
  color: #2e7d32;
}

.export-status.error {
  background: #fce4ec;
  color: #c62828;
}

.status-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-icon {
  font-size: 16px;
  font-weight: bold;
}

.success-icon {
  color: #2e7d32;
}

.error-icon {
  color: #c62828;
}

.error-message {
  word-break: break-word;
  max-height: 80px;
  overflow-y: auto;
  font-size: 12px;
}

/* Spinner */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Actions */
.export-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}

.export-btn {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.export-btn.secondary {
  background: #f5f5f5;
  border-color: #d0d0d0;
  color: var(--text-primary, #333);
}

.export-btn.secondary:hover:not(:disabled) {
  background: #e8e8e8;
}

.export-btn.primary {
  background: #4a9eff;
  color: #fff;
  border-color: #3d8ee6;
}

.export-btn.primary:hover:not(:disabled) {
  background: #3d8ee6;
}

.export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
