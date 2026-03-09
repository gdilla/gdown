<template>
  <div
    v-if="visible"
    class="link-tooltip"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
  >
    <a
      :href="href"
      class="link-tooltip-url"
      @click.prevent="openLink"
      :title="href"
    >
      {{ displayUrl }}
    </a>
    <button class="link-tooltip-edit" @click="editLink" title="Edit link">
      ✏️
    </button>
    <button class="link-tooltip-remove" @click="removeLink" title="Remove link">
      ✕
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { Editor } from "@tiptap/core";

const props = defineProps<{
  editor: Editor;
}>();

const visible = ref(false);
const href = ref("");
const position = ref({ x: 0, y: 0 });
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

const displayUrl = computed(() => {
  const url = href.value;
  if (url.length > 50) {
    return url.substring(0, 47) + "...";
  }
  return url;
});

function openLink() {
  if (href.value) {
    window.open(href.value, "_blank");
  }
}

function editLink() {
  const url = prompt("Edit link URL:", href.value);
  if (url !== null) {
    props.editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }
  visible.value = false;
}

function removeLink() {
  props.editor.chain().focus().extendMarkRange("link").unsetLink().run();
  visible.value = false;
}

function handleSelectionUpdate() {
  if (hideTimeout) clearTimeout(hideTimeout);

  const { from, to } = props.editor.state.selection;
  const linkMarkType = props.editor.schema.marks.link;
  if (!linkMarkType) return;
  const linkMark = props.editor.state.doc.rangeHasMark(
    from,
    Math.max(from + 1, to),
    linkMarkType
  );

  if (linkMark && props.editor.isActive("link")) {
    const attrs = props.editor.getAttributes("link");
    href.value = attrs.href || "";
    
    // Position tooltip below the link
    const view = props.editor.view;
    const coords = view.coordsAtPos(from);
    const editorRect = view.dom.getBoundingClientRect();
    position.value = {
      x: coords.left - editorRect.left,
      y: coords.bottom - editorRect.top + 4,
    };
    visible.value = true;
  } else {
    hideTimeout = setTimeout(() => {
      visible.value = false;
    }, 200);
  }
}

onMounted(() => {
  props.editor.on("selectionUpdate", handleSelectionUpdate);
  props.editor.on("blur", () => {
    hideTimeout = setTimeout(() => {
      visible.value = false;
    }, 300);
  });
});

onUnmounted(() => {
  props.editor.off("selectionUpdate", handleSelectionUpdate);
  if (hideTimeout) clearTimeout(hideTimeout);
});
</script>

<style scoped>
.link-tooltip {
  position: absolute;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f8f8f8;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 4px 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  font-size: 12px;
  max-width: 400px;
}

.link-tooltip-url {
  color: #4183c4;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
  cursor: pointer;
}

.link-tooltip-url:hover {
  text-decoration: underline;
}

.link-tooltip-edit,
.link-tooltip-remove {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 12px;
  line-height: 1;
}

.link-tooltip-edit:hover,
.link-tooltip-remove:hover {
  background: #e8e8e8;
}
</style>
