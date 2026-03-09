<template>
  <node-view-wrapper
    as="pre"
    :class="['gdown-code-block', { 'has-language': language }]"
    :data-language="language || undefined"
  >
    <div class="code-block-header" contenteditable="false">
      <select
        class="language-select"
        :value="language || ''"
        @change="onLanguageChange"
        @mousedown.stop
        @click.stop
      >
        <option value="">Plain Text</option>
        <option
          v-for="lang in languages"
          :key="lang"
          :value="lang"
        >
          {{ languageDisplayName(lang) }}
        </option>
      </select>
      <button
        class="copy-button"
        title="Copy code"
        @click.stop="copyCode"
        @mousedown.stop
      >
        {{ copyLabel }}
      </button>
    </div>
    <node-view-content as="code" />
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { NodeViewWrapper, NodeViewContent, nodeViewProps } from "@tiptap/vue-3";
import { getSupportedLanguages } from "../extensions/GdownCodeBlock";

const props = defineProps(nodeViewProps);

const languages = computed(() => getSupportedLanguages().sort());
const copyLabel = ref("Copy");

const language = computed(() => props.node.attrs.language || "");

function onLanguageChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const lang = target.value || null;
  props.updateAttributes({ language: lang });
}

function copyCode() {
  const text = props.node.textContent;
  navigator.clipboard.writeText(text).then(() => {
    copyLabel.value = "Copied!";
    setTimeout(() => {
      copyLabel.value = "Copy";
    }, 2000);
  });
}

/** Map language identifiers to display-friendly names */
function languageDisplayName(lang: string): string {
  const names: Record<string, string> = {
    arduino: "Arduino",
    bash: "Bash",
    c: "C",
    cpp: "C++",
    csharp: "C#",
    css: "CSS",
    diff: "Diff",
    go: "Go",
    graphql: "GraphQL",
    ini: "INI",
    java: "Java",
    javascript: "JavaScript",
    json: "JSON",
    kotlin: "Kotlin",
    less: "Less",
    lua: "Lua",
    makefile: "Makefile",
    markdown: "Markdown",
    objectivec: "Objective-C",
    perl: "Perl",
    php: "PHP",
    "php-template": "PHP Template",
    plaintext: "Plain Text",
    python: "Python",
    "python-repl": "Python REPL",
    r: "R",
    ruby: "Ruby",
    rust: "Rust",
    scss: "SCSS",
    shell: "Shell",
    sql: "SQL",
    swift: "Swift",
    typescript: "TypeScript",
    vbnet: "VB.NET",
    wasm: "WebAssembly",
    xml: "XML/HTML",
    yaml: "YAML",
  };
  return names[lang] || lang.charAt(0).toUpperCase() + lang.slice(1);
}
</script>

<style scoped>
.gdown-code-block {
  position: relative;
  background: #f6f8fa;
  border-radius: 6px;
  padding: 16px;
  padding-top: 36px;
  overflow-x: auto;
  margin: 1em 0;
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas,
    "Liberation Mono", monospace;
  font-size: 13.6px;
  line-height: 1.55;
  tab-size: 2;
}

.code-block-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  pointer-events: all;
  user-select: none;
}

.language-select {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 20px 2px 6px;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
    sans-serif;
  color: #8b949e;
  cursor: pointer;
  outline: none;
  /* Custom dropdown arrow */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%238b949e' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
  background-size: 8px 5px;
  max-width: 160px;
  text-overflow: ellipsis;
}

.language-select:hover {
  border-color: #d0d7de;
  background-color: rgba(0, 0, 0, 0.04);
}

.language-select:focus {
  border-color: #4a9eff;
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
}

.copy-button {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
    sans-serif;
  color: #8b949e;
  cursor: pointer;
  outline: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.gdown-code-block:hover .copy-button {
  opacity: 1;
}

.copy-button:hover {
  border-color: #d0d7de;
  background-color: rgba(0, 0, 0, 0.04);
  color: #57606a;
}

/* Code content inside NodeView */
:deep(code) {
  background: none !important;
  padding: 0 !important;
  color: inherit !important;
  border-radius: 0 !important;
  font-size: inherit !important;
  font-family: inherit !important;
  display: block;
}
</style>
