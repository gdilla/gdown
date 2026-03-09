import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useFindReplaceStore = defineStore('findReplace', () => {
  // Panel visibility
  const visible = ref(false)
  const showReplace = ref(false)

  // Search state
  const searchQuery = ref('')
  const replaceQuery = ref('')
  const caseSensitive = ref(false)
  const useRegex = ref(false)

  // Match tracking
  const matchCount = ref(0)
  const currentMatchIndex = ref(-1)

  // Computed display for match indicator (e.g. "2 of 5")
  const matchDisplay = computed(() => {
    if (!searchQuery.value || matchCount.value === 0) {
      return searchQuery.value ? 'No results' : ''
    }
    return `${currentMatchIndex.value + 1} of ${matchCount.value}`
  })

  function open(withReplace = false) {
    visible.value = true
    showReplace.value = withReplace
  }

  function close() {
    visible.value = false
    showReplace.value = false
    searchQuery.value = ''
    replaceQuery.value = ''
    matchCount.value = 0
    currentMatchIndex.value = -1
  }

  function toggleReplace() {
    showReplace.value = !showReplace.value
  }

  function toggleCaseSensitive() {
    caseSensitive.value = !caseSensitive.value
  }

  function toggleRegex() {
    useRegex.value = !useRegex.value
  }

  function setMatchInfo(count: number, index: number) {
    matchCount.value = count
    currentMatchIndex.value = index
  }

  return {
    visible,
    showReplace,
    searchQuery,
    replaceQuery,
    caseSensitive,
    useRegex,
    matchCount,
    currentMatchIndex,
    matchDisplay,
    open,
    close,
    toggleReplace,
    toggleCaseSensitive,
    toggleRegex,
    setMatchInfo,
  }
})
