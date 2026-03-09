import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type EditorMode = 'wysiwyg' | 'source'

export const useEditorModeStore = defineStore('editorMode', () => {
  const mode = ref<EditorMode>('wysiwyg')

  const isWysiwyg = computed(() => mode.value === 'wysiwyg')
  const isSource = computed(() => mode.value === 'source')

  function toggleMode() {
    mode.value = mode.value === 'wysiwyg' ? 'source' : 'wysiwyg'
  }

  function setMode(newMode: EditorMode) {
    mode.value = newMode
  }

  return {
    mode,
    isWysiwyg,
    isSource,
    toggleMode,
    setMode,
  }
})
