<template>
  <node-view-wrapper class="frontmatter-block" :class="{ 'is-collapsed': collapsed, 'is-editing-raw': editingRaw }">
    <!-- Header bar with collapse toggle -->
    <div class="frontmatter-header" @click="toggleCollapse">
      <span class="frontmatter-chevron">{{ collapsed ? '▶' : '▼' }}</span>
      <span class="frontmatter-label">Front Matter</span>
      <div class="frontmatter-actions" @click.stop>
        <button
          class="frontmatter-btn"
          @click="toggleRawEdit"
          :title="editingRaw ? 'Switch to fields view' : 'Edit raw YAML'"
        >
          {{ editingRaw ? 'Fields' : 'Raw' }}
        </button>
        <button
          class="frontmatter-btn frontmatter-btn-add"
          @click="addField"
          title="Add field"
          v-if="!editingRaw && !collapsed"
        >
          +
        </button>
      </div>
    </div>

    <!-- Collapsible content area -->
    <div v-show="!collapsed" class="frontmatter-body">

      <!-- Structured fields view -->
      <div v-if="!editingRaw" class="frontmatter-fields">
        <div
          v-for="(field, index) in fields"
          :key="index"
          class="frontmatter-field"
        >
          <input
            class="frontmatter-key"
            :value="field.key"
            @input="(e) => updateFieldKey(index, (e.target as HTMLInputElement).value)"
            @blur="commitChanges"
            @keydown.enter="commitChanges"
            placeholder="key"
            spellcheck="false"
          />
          <span class="frontmatter-separator">:</span>
          <input
            class="frontmatter-value"
            :value="field.value"
            @input="(e) => updateFieldValue(index, (e.target as HTMLInputElement).value)"
            @blur="commitChanges"
            @keydown.enter="commitChanges"
            :placeholder="'value'"
            spellcheck="false"
            :class="{ [`type-${detectType(field.value)}`]: true }"
          />
          <button
            class="frontmatter-field-remove"
            @click="removeField(index)"
            title="Remove field"
          >
            ×
          </button>
        </div>
        <div v-if="fields.length === 0" class="frontmatter-empty">
          <span>No metadata fields. Click + to add one.</span>
        </div>
      </div>

      <!-- Raw YAML editing view -->
      <div v-else class="frontmatter-raw">
        <textarea
          ref="rawTextarea"
          :value="rawYaml"
          @input="handleRawInput"
          @blur="commitRawChanges"
          spellcheck="false"
          placeholder="Enter YAML metadata..."
          rows="4"
        ></textarea>
      </div>
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import type { NodeViewProps } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

interface FieldEntry {
  key: string
  value: string
}

const collapsed = ref(false)
const editingRaw = ref(false)
const rawTextarea = ref<HTMLTextAreaElement | null>(null)

// Reactive local field state (parsed from the node's text content)
const fields = ref<FieldEntry[]>([])
const rawYaml = ref('')

// Flag to prevent loops during updates
let isUpdating = false

/**
 * Parse the YAML text content from the ProseMirror node into fields.
 */
function parseNodeContent(): void {
  const content = props.node.textContent || ''
  rawYaml.value = content

  const parsed: FieldEntry[] = []
  if (!content.trim()) {
    fields.value = parsed
    return
  }

  const lines = content.split('\n')
  let currentKey = ''
  let currentValue = ''

  for (const line of lines) {
    // Skip comments
    if (line.trimStart().startsWith('#')) continue

    // Top-level key-value pair
    const kvMatch = line.match(/^([a-zA-Z_][\w.-]*)\s*:\s*(.*)$/)
    if (kvMatch) {
      // Save previous field
      if (currentKey) {
        parsed.push({ key: currentKey, value: currentValue.trim() })
      }
      currentKey = kvMatch[1] ?? ''
      currentValue = (kvMatch[2] ?? '').trim()
    } else if (currentKey && (line.startsWith('  ') || line.startsWith('\t') || line.match(/^\s*-\s/))) {
      // Continuation/array line
      currentValue += '\n' + line
    }
  }

  // Save last field
  if (currentKey) {
    parsed.push({ key: currentKey, value: currentValue.trim() })
  }

  fields.value = parsed
}

/**
 * Serialize fields back to YAML text and update the ProseMirror node.
 */
function commitChanges(): void {
  if (isUpdating) return

  const yaml = fields.value
    .filter(f => f.key.trim())
    .map(f => {
      if (f.value.includes('\n')) {
        return `${f.key}:\n${f.value}`
      }
      return `${f.key}: ${f.value}`
    })
    .join('\n')

  updateNodeContent(yaml)
}

/**
 * Update the ProseMirror node's text content.
 */
function updateNodeContent(newContent: string): void {
  isUpdating = true

  try {
    const { tr } = props.editor.state
    const pos = props.getPos()
    if (typeof pos !== 'number') return

    const nodeStart = pos + 1
    const nodeEnd = pos + props.node.nodeSize - 1

    if (newContent) {
      tr.replaceWith(
        nodeStart,
        nodeEnd,
        props.editor.state.schema.text(newContent)
      )
    } else {
      tr.delete(nodeStart, nodeEnd)
    }

    props.editor.view.dispatch(tr)
    rawYaml.value = newContent
  } finally {
    isUpdating = false
  }
}

function toggleCollapse(): void {
  collapsed.value = !collapsed.value
}

function toggleRawEdit(): void {
  if (editingRaw.value) {
    // Switching back to fields view - commit raw changes and re-parse
    commitRawChanges()
    editingRaw.value = false
    parseNodeContent()
  } else {
    // Switching to raw view - serialize current fields
    commitChanges()
    editingRaw.value = true
    nextTick(() => {
      if (rawTextarea.value) {
        rawTextarea.value.focus()
        autoResize(rawTextarea.value)
      }
    })
  }
}

function handleRawInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement
  rawYaml.value = target.value
  autoResize(target)
}

function commitRawChanges(): void {
  updateNodeContent(rawYaml.value)
}

function updateFieldKey(index: number, newKey: string): void {
  if (index >= 0 && index < fields.value.length) {
    fields.value[index] = { key: newKey, value: fields.value[index]?.value ?? '' }
  }
}

function updateFieldValue(index: number, newValue: string): void {
  if (index >= 0 && index < fields.value.length) {
    fields.value[index] = { key: fields.value[index]?.key ?? '', value: newValue }
  }
}

function addField(): void {
  fields.value.push({ key: '', value: '' })
  // Focus the new key input after DOM update
  nextTick(() => {
    const fieldEls = document.querySelectorAll('.frontmatter-field:last-child .frontmatter-key')
    const lastInput = fieldEls[fieldEls.length - 1] as HTMLInputElement | undefined
    lastInput?.focus()
  })
}

function removeField(index: number): void {
  fields.value.splice(index, 1)
  commitChanges()
}

function detectType(value: string): string {
  if (!value || value === 'null' || value === '~') return 'null'
  if (value === 'true' || value === 'false') return 'boolean'
  if (/^-?\d+(\.\d+)?$/.test(value)) return 'number'
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
  if (value.startsWith('[') || value.includes('\n  -')) return 'array'
  return 'string'
}

function autoResize(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto'
  textarea.style.height = textarea.scrollHeight + 'px'
}

// Parse on mount
onMounted(() => {
  parseNodeContent()
})

// Watch for external changes to the node content (undo/redo)
watch(
  () => props.node.textContent,
  () => {
    if (!isUpdating) {
      parseNodeContent()
    }
  }
)
</script>

<style scoped>
.frontmatter-block {
  margin: 0 0 1.5em 0;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  overflow: hidden;
  background: #fafbfc;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  transition: border-color 0.2s;
}

.frontmatter-block:hover {
  border-color: #c8ccd0;
}

/* Header */
.frontmatter-header {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: #f1f3f5;
  border-bottom: 1px solid #e1e4e8;
  cursor: pointer;
  user-select: none;
  gap: 6px;
  min-height: 32px;
}

.frontmatter-chevron {
  font-size: 10px;
  color: #586069;
  width: 14px;
  text-align: center;
  transition: transform 0.15s;
}

.frontmatter-label {
  font-size: 12px;
  font-weight: 600;
  color: #586069;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}

.frontmatter-actions {
  display: flex;
  gap: 4px;
}

.frontmatter-btn {
  background: none;
  border: 1px solid #d1d5da;
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 11px;
  color: #586069;
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  transition: background 0.15s, color 0.15s;
  line-height: 1.6;
}

.frontmatter-btn:hover {
  background: #e1e4e8;
  color: #24292e;
}

.frontmatter-btn-add {
  font-size: 14px;
  font-weight: 600;
  padding: 0 6px;
  line-height: 1.4;
}

/* Collapsed state */
.is-collapsed .frontmatter-header {
  border-bottom: none;
}

/* Body */
.frontmatter-body {
  padding: 0;
}

/* Structured fields view */
.frontmatter-fields {
  padding: 8px 12px;
}

.frontmatter-field {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
  position: relative;
}

.frontmatter-field:hover .frontmatter-field-remove {
  opacity: 1;
}

.frontmatter-key {
  width: 120px;
  min-width: 80px;
  max-width: 200px;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 3px;
  font-size: 13px;
  font-family: "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  font-weight: 600;
  color: #005cc5;
  background: transparent;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}

.frontmatter-key:focus {
  border-color: #4183c4;
  background: #fff;
}

.frontmatter-key:hover:not(:focus) {
  background: rgba(0, 0, 0, 0.03);
}

.frontmatter-separator {
  color: #959da5;
  font-family: "SF Mono", Menlo, monospace;
  font-size: 13px;
  flex-shrink: 0;
}

.frontmatter-value {
  flex: 1;
  min-width: 100px;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 3px;
  font-size: 13px;
  font-family: "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  color: #24292e;
  background: transparent;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}

.frontmatter-value:focus {
  border-color: #4183c4;
  background: #fff;
}

.frontmatter-value:hover:not(:focus) {
  background: rgba(0, 0, 0, 0.03);
}

/* Value type coloring */
.frontmatter-value.type-string {
  color: #032f62;
}

.frontmatter-value.type-number {
  color: #005cc5;
}

.frontmatter-value.type-boolean {
  color: #d73a49;
}

.frontmatter-value.type-date {
  color: #6f42c1;
}

.frontmatter-value.type-array {
  color: #22863a;
}

.frontmatter-value.type-null {
  color: #959da5;
  font-style: italic;
}

.frontmatter-field-remove {
  background: none;
  border: none;
  color: #cb2431;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  opacity: 0;
  transition: opacity 0.15s;
  line-height: 1;
  flex-shrink: 0;
}

.frontmatter-field-remove:hover {
  color: #d73a49;
}

.frontmatter-empty {
  color: #959da5;
  font-size: 13px;
  font-style: italic;
  padding: 8px 0;
}

/* Raw YAML editing view */
.frontmatter-raw {
  padding: 0;
}

.frontmatter-raw textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px 12px;
  border: none;
  outline: none;
  resize: vertical;
  font-family: "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #24292e;
  background: #fafbfc;
  box-sizing: border-box;
  tab-size: 2;
}

.frontmatter-raw textarea::placeholder {
  color: #aaa;
}

.frontmatter-raw textarea:focus {
  background: #fff;
}

/* Dark theme support via CSS variables */
:root[data-theme="dark"] .frontmatter-block,
.dark .frontmatter-block {
  background: #1e1e1e;
  border-color: #333;
}

:root[data-theme="dark"] .frontmatter-header,
.dark .frontmatter-header {
  background: #252526;
  border-bottom-color: #333;
}

:root[data-theme="dark"] .frontmatter-key,
.dark .frontmatter-key {
  color: #79b8ff;
}

:root[data-theme="dark"] .frontmatter-value,
.dark .frontmatter-value {
  color: #e1e4e8;
}

:root[data-theme="dark"] .frontmatter-raw textarea,
.dark .frontmatter-raw textarea {
  background: #1e1e1e;
  color: #e1e4e8;
}
</style>
