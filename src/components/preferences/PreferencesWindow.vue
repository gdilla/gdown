<template>
  <Teleport to="body">
    <Transition name="prefs-fade">
      <div v-if="prefsStore.visible" class="prefs-overlay" @mousedown.self="prefsStore.close()">
        <div class="prefs-window" @keydown.escape="prefsStore.close()">
          <!-- macOS-style toolbar with tab icons -->
          <div class="prefs-toolbar">
            <div class="prefs-toolbar-inner">
              <button
                v-for="tab in PREFERENCES_TABS"
                :key="tab.id"
                :class="['prefs-tab-btn', { active: prefsStore.activeTab === tab.id }]"
                @click="prefsStore.setTab(tab.id)"
                :title="tab.label"
              >
                <span class="prefs-tab-icon">
                  <PrefsIcon :name="tab.icon" />
                </span>
                <span class="prefs-tab-label">{{ tab.label }}</span>
              </button>
            </div>
          </div>

          <!-- Content area -->
          <div class="prefs-content">
            <KeepAlive>
              <component :is="activeComponent" />
            </KeepAlive>
          </div>

          <!-- Close button (top-left, macOS style) -->
          <button class="prefs-close-btn" @click="prefsStore.close()" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { usePreferencesStore, PREFERENCES_TABS } from '../../stores/preferences'
import PrefsIcon from './PrefsIcon.vue'
import GeneralPane from './GeneralPane.vue'
import AppearancePane from './AppearancePane.vue'
import EditorPane from './EditorPane.vue'
import ImagePane from './ImagePane.vue'
import ExportPane from './ExportPane.vue'
import AdvancedPane from './AdvancedPane.vue'

const prefsStore = usePreferencesStore()

const paneMap: Record<string, any> = {
  general: GeneralPane,
  appearance: AppearancePane,
  editor: EditorPane,
  image: ImagePane,
  export: ExportPane,
  advanced: AdvancedPane,
}

const activeComponent = computed(() => {
  return paneMap[prefsStore.activeTab] || GeneralPane
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && prefsStore.visible) {
    e.preventDefault()
    e.stopPropagation()
    prefsStore.close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})
</script>

<style scoped>
/* ── Overlay ── */
.prefs-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* ── Window shell ── */
.prefs-window {
  position: relative;
  width: 640px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 60px);
  background: var(--prefs-bg, #f6f6f6);
  border-radius: 12px;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.25),
    0 0 0 0.5px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* macOS vibrancy effect approximation */
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
}

/* ── Close button (top-left, macOS traffic light position) ── */
.prefs-close-btn {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.06);
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  z-index: 10;
}

.prefs-close-btn:hover {
  background: #ff5f57;
  color: #fff;
}

/* ── Toolbar (macOS System Preferences style tab bar) ── */
.prefs-toolbar {
  background: var(--prefs-toolbar-bg, #ececec);
  border-bottom: 1px solid var(--prefs-border, #d4d4d4);
  padding: 8px 16px 6px;
  -webkit-user-select: none;
  user-select: none;
  /* Leave room for close button */
  padding-left: 44px;
}

.prefs-toolbar-inner {
  display: flex;
  justify-content: center;
  gap: 2px;
}

/* ── Tab buttons ── */
.prefs-tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 14px 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: 64px;
}

.prefs-tab-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.prefs-tab-btn.active {
  background: rgba(0, 122, 255, 0.12);
}

.prefs-tab-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--prefs-icon-color, #555);
  transition: color 0.15s ease;
}

.prefs-tab-btn.active .prefs-tab-icon {
  color: var(--prefs-icon-active-color, #007aff);
}

.prefs-tab-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--prefs-tab-text, #555);
  white-space: nowrap;
  transition: color 0.15s ease;
}

.prefs-tab-btn.active .prefs-tab-label {
  color: var(--prefs-tab-text-active, #007aff);
}

/* ── Content area ── */
.prefs-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px 24px;
  min-height: 360px;
  max-height: calc(100vh - 180px);
}

/* ── Transitions ── */
.prefs-fade-enter-active {
  transition: opacity 0.2s ease;
}

.prefs-fade-leave-active {
  transition: opacity 0.15s ease;
}

.prefs-fade-enter-from,
.prefs-fade-leave-to {
  opacity: 0;
}

.prefs-fade-enter-active .prefs-window {
  animation: prefs-scale-in 0.2s ease;
}

.prefs-fade-leave-active .prefs-window {
  animation: prefs-scale-out 0.15s ease;
}

@keyframes prefs-scale-in {
  from {
    transform: scale(0.96);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes prefs-scale-out {
  from {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(0.96);
    opacity: 0;
  }
}

/* ── Dark theme overrides ── */
:root[data-theme="dark"] .prefs-window,
.dark .prefs-window {
  --prefs-bg: #2d2d2d;
  --prefs-toolbar-bg: #383838;
  --prefs-border: #4a4a4a;
  --prefs-icon-color: #aaa;
  --prefs-icon-active-color: #58a6ff;
  --prefs-tab-text: #aaa;
  --prefs-tab-text-active: #58a6ff;
}
</style>

<!-- Global styles for pane form elements (used by all pane components) -->
<style>
/* ── Preference pane common styles ── */
.pref-pane {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pref-group {
  background: var(--pref-group-bg, #fff);
  border-radius: 8px;
  padding: 14px 16px;
  border: 1px solid var(--pref-group-border, #e0e0e0);
}

.pref-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--pref-group-title-color, #333);
  margin-bottom: 10px;
  letter-spacing: -0.01em;
}

.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding: 3px 0;
}

.pref-row + .pref-row {
  border-top: 1px solid var(--pref-row-border, #f0f0f0);
  padding-top: 6px;
  margin-top: 3px;
}

.pref-label {
  font-size: 13px;
  color: var(--pref-label-color, #444);
  flex-shrink: 0;
}

.pref-select {
  appearance: none;
  -webkit-appearance: none;
  padding: 4px 28px 4px 10px;
  border: 1px solid var(--pref-input-border, #ccc);
  border-radius: 6px;
  background: var(--pref-input-bg, #fff);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 10px;
  font-size: 13px;
  color: var(--pref-input-color, #333);
  cursor: pointer;
  min-width: 140px;
  outline: none;
  transition: border-color 0.15s ease;
}

.pref-select:focus {
  border-color: #007aff;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
}

.pref-input {
  padding: 4px 10px;
  border: 1px solid var(--pref-input-border, #ccc);
  border-radius: 6px;
  background: var(--pref-input-bg, #fff);
  font-size: 13px;
  color: var(--pref-input-color, #333);
  min-width: 140px;
  outline: none;
  transition: border-color 0.15s ease;
}

.pref-input:focus {
  border-color: #007aff;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
}

.pref-number {
  padding: 4px 8px;
  border: 1px solid var(--pref-input-border, #ccc);
  border-radius: 6px;
  background: var(--pref-input-bg, #fff);
  font-size: 13px;
  color: var(--pref-input-color, #333);
  width: 80px;
  text-align: right;
  outline: none;
  transition: border-color 0.15s ease;
}

.pref-number:focus {
  border-color: #007aff;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
}

.pref-checkbox-label {
  font-size: 13px;
  color: var(--pref-label-color, #444);
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  width: 100%;
}

.pref-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #007aff;
  cursor: pointer;
  flex-shrink: 0;
}

.pref-hint {
  font-size: 12px;
  color: var(--pref-hint-color, #888);
  margin-top: 8px;
  line-height: 1.4;
}

.pref-link {
  color: #007aff;
  text-decoration: none;
}

.pref-link:hover {
  text-decoration: underline;
}

.pref-status-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
}

.pref-status-ok {
  background: rgba(52, 199, 89, 0.15);
  color: #28a745;
}

.pref-status-error {
  background: rgba(255, 59, 48, 0.12);
  color: #dc3545;
}

/* ── Path row (input + browse button) ── */
.pref-path-row {
  display: flex;
  gap: 6px;
  flex: 1;
  align-items: center;
}

.pref-input-path {
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  font-size: 12px;
}

.pref-path-display {
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  font-size: 11px;
  color: #999;
  display: block;
  margin-top: 2px;
  word-break: break-all;
}

/* ── Buttons ── */
.pref-btn {
  padding: 5px 14px;
  border: 1px solid var(--pref-input-border, #ccc);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  background: var(--pref-input-bg, #fff);
  color: var(--pref-input-color, #333);
}

.pref-btn:hover {
  border-color: #007aff;
}

.pref-btn-browse {
  background: var(--pref-group-bg, #fff);
}

.pref-btn-browse:hover {
  background: rgba(0, 122, 255, 0.06);
  border-color: #007aff;
}

.pref-btn-clear {
  background: transparent;
  color: #999;
  border-color: transparent;
  padding: 5px 8px;
}

.pref-btn-clear:hover {
  color: #dc3545;
}

.pref-btn-secondary {
  background: var(--pref-group-bg, #fff);
}

.pref-btn-secondary:hover {
  background: rgba(0, 122, 255, 0.06);
  border-color: #007aff;
}

.pref-group-actions {
  border: none;
  padding-top: 4px;
  background: transparent;
}

.pref-pandoc-status {
  margin-bottom: 8px;
}

.pref-hint code {
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
}

/* ── Dark theme for pane elements ── */
:root[data-theme="dark"] .pref-group,
.dark .pref-group {
  --pref-group-bg: #383838;
  --pref-group-border: #4a4a4a;
  --pref-group-title-color: #e0e0e0;
  --pref-row-border: #4a4a4a;
  --pref-label-color: #ccc;
  --pref-input-border: #555;
  --pref-input-bg: #2d2d2d;
  --pref-input-color: #e0e0e0;
  --pref-hint-color: #888;
}
</style>
