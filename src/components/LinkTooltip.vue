<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="link-popup"
      :style="{ left: position.x + 'px', top: position.y + 'px' }"
      @mouseenter="cancelHide"
      @mouseleave="scheduleHide"
    >
      <!-- View mode -->
      <template v-if="!editing">
        <div class="link-url-row">
          <svg class="link-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 9.5H4a2 2 0 0 1 0-4h1.535c.218-.376.495-.71.82-1z"/>
            <path d="M9 5.5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6.5h3a2 2 0 0 1 0 4h-1.535a4 4 0 0 1-.82 1H12a3 3 0 1 0 0-6H9z"/>
          </svg>
          <span class="link-url-text" :title="href">{{ displayUrl }}</span>
        </div>
        <div class="link-actions">
          <button class="link-btn link-btn-primary" @click="openLink">Open ↗</button>
          <button class="link-btn" @click="copyLink">{{ copied ? '✓ Copied' : 'Copy URL' }}</button>
          <button class="link-btn" @click="startEdit">Edit</button>
          <div class="link-btn-divider" />
          <button class="link-btn link-btn-remove" @click="removeLink">Unlink</button>
        </div>
      </template>

      <!-- Edit mode -->
      <template v-else>
        <div class="link-edit-form">
          <label class="link-edit-label">URL</label>
          <input
            ref="urlInput"
            v-model="editUrl"
            class="link-edit-input"
            type="url"
            placeholder="https://example.com"
            @keydown.enter="saveEdit"
            @keydown.esc="cancelEdit"
          />
          <label class="link-edit-label">Display text</label>
          <input
            v-model="editText"
            class="link-edit-input"
            type="text"
            placeholder="Link text"
            @keydown.enter="saveEdit"
            @keydown.esc="cancelEdit"
          />
          <div class="link-edit-actions">
            <button class="link-btn" @click="cancelEdit">Cancel</button>
            <button class="link-btn link-btn-primary" @click="saveEdit">Save</button>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import type { Editor } from "@tiptap/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEditorSettingsStore } from "../stores/editorSettings";

const props = defineProps<{ editor: Editor }>();
const editorSettings = useEditorSettingsStore();

const visible = ref(false);
const href = ref("");
const position = ref({ x: 0, y: 0 });
const editing = ref(false);
const editUrl = ref("");
const editText = ref("");
const copied = ref(false);
const urlInput = ref<HTMLInputElement | null>(null);

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
let linkFrom = 0;
let linkTo = 0;

const displayUrl = computed(() => {
  const url = href.value;
  return url.length > 52 ? url.substring(0, 49) + "…" : url;
});

// ── Show / hide ──────────────────────────────────────────────────────

function show(linkHref: string, anchorEl: HTMLElement) {
  cancelHide();
  href.value = linkHref;
  editing.value = false;

  // Use fixed viewport coords — works regardless of scroll position
  const linkRect = anchorEl.getBoundingClientRect();
  position.value = {
    x: Math.min(linkRect.left, window.innerWidth - 320),
    y: linkRect.bottom + 6,
  };
  visible.value = true;
}

function scheduleHide() {
  cancelHide();
  hideTimer = setTimeout(() => {
    visible.value = false;
    editing.value = false;
  }, 300);
}

function cancelHide() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}

// ── Actions ──────────────────────────────────────────────────────────

async function openLink() {
  if (!href.value) return;
  try {
    await openUrl(href.value);
  } catch {
    window.open(href.value, "_blank");
  }
}

async function copyLink() {
  await navigator.clipboard.writeText(href.value);
  copied.value = true;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copied.value = false; }, 1500);
}

function removeLink() {
  props.editor.chain().focus().extendMarkRange("link").unsetLink().run();
  visible.value = false;
}

function startEdit() {
  props.editor.chain().extendMarkRange("link").run();
  const { from, to } = props.editor.state.selection;
  linkFrom = from;
  linkTo = to;
  editText.value = props.editor.state.doc.textBetween(linkFrom, linkTo, " ");
  editUrl.value = href.value;
  editing.value = true;
  nextTick(() => urlInput.value?.focus());
}

function saveEdit() {
  if (!editUrl.value.trim()) return;
  props.editor
    .chain()
    .focus()
    .setTextSelection({ from: linkFrom, to: linkTo })
    .extendMarkRange("link")
    .setLink({ href: editUrl.value.trim() })
    .run();

  const currentText = props.editor.state.doc.textBetween(linkFrom, linkTo, " ");
  if (editText.value.trim() && editText.value.trim() !== currentText) {
    const { from, to } = props.editor.state.selection;
    props.editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, [{
        type: "text",
        text: editText.value.trim(),
        marks: [{ type: "link", attrs: { href: editUrl.value.trim() } }],
      }])
      .run();
  }

  href.value = editUrl.value.trim();
  editing.value = false;
}

function cancelEdit() {
  editing.value = false;
  props.editor.commands.focus();
}

// ── Hover detection ───────────────────────────────────────────────────
// Only active in 'edit' link mode.

function findLinkEl(target: HTMLElement | null): HTMLAnchorElement | null {
  return target?.closest("a.gdown-link") as HTMLAnchorElement | null;
}

function handleMouseover(e: MouseEvent) {
  if (editorSettings.linkMode !== 'edit') return;
  const linkEl = findLinkEl(e.target as HTMLElement);
  if (!linkEl) return;
  const linkHref = linkEl.getAttribute("href");
  if (linkHref) show(linkHref, linkEl);
}

function handleMouseout(e: MouseEvent) {
  if (editorSettings.linkMode !== 'edit') return;
  const related = e.relatedTarget as HTMLElement | null;
  // Stay open if moving to another link OR to the popup itself
  if (findLinkEl(related) || related?.closest(".link-popup")) return;
  scheduleHide();
}

onMounted(() => {
  const dom = props.editor.view.dom;
  dom.addEventListener("mouseover", handleMouseover);
  dom.addEventListener("mouseout", handleMouseout);
});

onUnmounted(() => {
  const dom = props.editor.view.dom;
  dom.removeEventListener("mouseover", handleMouseover);
  dom.removeEventListener("mouseout", handleMouseout);
  if (hideTimer) clearTimeout(hideTimer);
  if (copiedTimer) clearTimeout(copiedTimer);
});
</script>

<style>
/* Not scoped — rendered via Teleport outside component tree */
.link-popup {
  position: fixed;
  z-index: 9999;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--sidebar-border, #ddd);
  border-radius: 8px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14);
  padding: 8px;
  min-width: 240px;
  max-width: 360px;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.link-url-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--sidebar-border, #eee);
  margin-bottom: 6px;
}

.link-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--sidebar-markdown-color, #4183c4);
}

.link-url-text {
  color: var(--sidebar-markdown-color, #4183c4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 11px;
}

.link-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.link-btn-divider {
  width: 1px;
  height: 14px;
  background: var(--sidebar-border, #e0e0e0);
  margin: 0 2px;
}

.link-btn {
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-primary, #333);
  white-space: nowrap;
  transition: background 0.12s;
  font-family: inherit;
}

.link-btn:hover {
  background: var(--tab-hover-bg, rgba(0,0,0,0.06));
}

.link-btn-primary {
  background: var(--tab-active-indicator, #4a9eff);
  color: #fff !important;
}

.link-btn-primary:hover {
  opacity: 0.85;
  background: var(--tab-active-indicator, #4a9eff) !important;
}

.link-btn-remove {
  color: var(--sidebar-error-color, #c0392b);
  margin-left: auto;
}

.link-btn-remove:hover {
  background: rgba(192, 57, 43, 0.08) !important;
}

.link-edit-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link-edit-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--sidebar-title-color, #999);
  padding: 0 2px;
}

.link-edit-input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--sidebar-border, #ddd);
  border-radius: 5px;
  font-size: 12px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.link-edit-input:focus {
  border-color: var(--tab-active-indicator, #4a9eff);
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.15);
}

.link-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
}
</style>
