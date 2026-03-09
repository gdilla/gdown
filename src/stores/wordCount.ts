import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useTabsStore } from './tabs'

export interface WordCountStats {
  /** Total word count */
  words: number
  /** Total character count (including spaces) */
  characters: number
  /** Total character count (excluding spaces) */
  charactersNoSpaces: number
  /** Total line count */
  lines: number
  /** Total paragraph count (non-empty blocks of text) */
  paragraphs: number
}

/**
 * Count words in a text string.
 * Handles CJK characters (each counts as a word), mixed scripts,
 * and strips markdown syntax for more accurate counts.
 */
function countWords(text: string): number {
  if (!text || !text.trim()) return 0

  // Strip common markdown syntax for more accurate word counting
  let cleaned = text
    // Remove code blocks (fenced)
    .replace(/```[\s\S]*?```/g, (match) => {
      // Count words inside code blocks
      const inner = match.replace(/```\w*\n?/g, '').replace(/```/g, '')
      return inner
    })
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove links [text](url)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Remove heading markers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove emphasis markers
    .replace(/(\*{1,3}|_{1,3})/g, '')
    // Remove strikethrough
    .replace(/~~(.*?)~~/g, '$1')
    // Remove blockquote markers
    .replace(/^>\s*/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove math delimiters
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$([^$]+)\$/g, '$1')
    // Remove YAML front matter
    .replace(/^---[\s\S]*?---\n?/m, '')

  // CJK character regex range
  const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g

  // Count CJK characters (each is a word)
  const cjkMatches = cleaned.match(cjkRegex)
  const cjkCount = cjkMatches ? cjkMatches.length : 0

  // Remove CJK characters and count remaining words
  const withoutCjk = cleaned.replace(cjkRegex, ' ')
  const wordMatches = withoutCjk.match(/[^\s]+/g)
  const latinCount = wordMatches ? wordMatches.length : 0

  return cjkCount + latinCount
}

function countParagraphs(text: string): number {
  if (!text || !text.trim()) return 0

  // A paragraph is a non-empty block of text separated by blank lines
  const blocks = text.split(/\n\s*\n/)
  return blocks.filter(block => block.trim().length > 0).length
}

export const useWordCountStore = defineStore('wordCount', () => {
  const tabsStore = useTabsStore()

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // Reactive stats
  const stats = ref<WordCountStats>({
    words: 0,
    characters: 0,
    charactersNoSpaces: 0,
    lines: 0,
    paragraphs: 0,
  })

  /** Whether to show the expanded word count panel */
  const showDetails = ref(false)

  /** Formatted display string for the status bar */
  const displayText = computed(() => {
    const w = stats.value.words
    return `${w} ${w === 1 ? 'Word' : 'Words'}`
  })

  /** Formatted detail lines */
  const detailLines = computed(() => [
    { label: 'Words', value: stats.value.words.toLocaleString() },
    { label: 'Characters', value: stats.value.characters.toLocaleString() },
    { label: 'Characters (no spaces)', value: stats.value.charactersNoSpaces.toLocaleString() },
    { label: 'Lines', value: stats.value.lines.toLocaleString() },
    { label: 'Paragraphs', value: stats.value.paragraphs.toLocaleString() },
  ])

  function updateStats() {
    const tab = tabsStore.activeTab
    if (!tab) {
      stats.value = { words: 0, characters: 0, charactersNoSpaces: 0, lines: 0, paragraphs: 0 }
      return
    }

    const text = tab.editorState.markdown || ''

    stats.value = {
      words: countWords(text),
      characters: text.length,
      charactersNoSpaces: text.replace(/\s/g, '').length,
      lines: text ? text.split('\n').length : 0,
      paragraphs: countParagraphs(text),
    }
  }

  /** Debounced update — called on every content change */
  function scheduleUpdate() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      updateStats()
      debounceTimer = null
    }, 300)
  }

  function toggleDetails() {
    showDetails.value = !showDetails.value
  }

  // Watch active tab changes — update immediately
  watch(() => tabsStore.activeTabId, () => {
    updateStats()
  }, { immediate: true })

  // Watch markdown content changes — debounced
  watch(() => tabsStore.activeTab?.editorState.markdown, () => {
    scheduleUpdate()
  })

  return {
    stats,
    showDetails,
    displayText,
    detailLines,
    updateStats,
    scheduleUpdate,
    toggleDetails,
  }
})
