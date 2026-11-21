import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTabsStore } from './tabs'
import { useAutoSaveStore } from './autoSave'
import { sourceOnlyNotice, tabSourceOnlyReason } from '../utils/documentLimits'

export type EditorMode = 'wysiwyg' | 'source'

export const useEditorModeStore = defineStore('editorMode', () => {
  /** The mode the user asked for; it applies to every tab that allows it. */
  const preferredMode = ref<EditorMode>('wysiwyg')

  /**
   * The mode in effect for the active tab. A source-only tab (plain text, or too
   * large for the rich editor) is in source mode whatever the preference, so
   * everything that reads the mode treats it as a source-mode document.
   */
  const mode = computed<EditorMode>({
    get: () => (useTabsStore().activeTab?.sourceOnly ? 'source' : preferredMode.value),
    set: setMode,
  })

  const isWysiwyg = computed(() => mode.value === 'wysiwyg')
  const isSource = computed(() => mode.value === 'source')

  function toggleMode() {
    setMode(mode.value === 'wysiwyg' ? 'source' : 'wysiwyg')
  }

  /** Set the preferred mode. Rich mode is refused, with a notice, on a source-only tab. */
  function setMode(newMode: EditorMode) {
    const tab = useTabsStore().activeTab
    // Re-decide on request: the document may have been trimmed under the limit,
    // or have grown past it in the source editor, since the tab was created.
    if (newMode === 'wysiwyg' && tab && !tab.isImage) {
      tab.sourceOnly = tabSourceOnlyReason(tab)
    }
    if (newMode === 'wysiwyg' && tab?.sourceOnly) {
      useAutoSaveStore().showNotification(sourceOnlyNotice(tab.title, tab.sourceOnly), 'warning')
      return
    }
    preferredMode.value = newMode
  }

  return {
    mode,
    isWysiwyg,
    isSource,
    toggleMode,
    setMode,
  }
})
