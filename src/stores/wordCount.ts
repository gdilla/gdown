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
  const cleaned = text
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
  const cjkRegex =
    /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g

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
  return blocks.filter((block) => block.trim().length > 0).length
}

/** Whether a UTF-16 code unit is whitespace, as `\s` defines it. */
function isSpace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  )
}

/** Whether a code unit is a CJK character, which counts as a word on its own. */
function isCjk(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af)
  )
}

/**
 * Statistics for text counted as written, with no markdown handling: one pass,
 * no allocation, so the cost is the same for every shape of file.
 */
function plainStats(text: string): WordCountStats {
  let words = 0
  let charactersNoSpaces = 0
  let lines = text ? 1 : 0
  let paragraphs = 0
  let inWord = false
  let lineHasText = false
  let inParagraph = false

  for (let i = 0; i <= text.length; i++) {
    // One step past the end closes the last line.
    const code = i < text.length ? text.charCodeAt(i) : 10
    if (code === 10) {
      if (i < text.length) lines += 1
      if (lineHasText && !inParagraph) paragraphs += 1
      inParagraph = lineHasText
      lineHasText = false
      inWord = false
      continue
    }
    if (isSpace(code)) {
      inWord = false
      continue
    }
    charactersNoSpaces += 1
    lineHasText = true
    if (isCjk(code)) {
      words += 1
      inWord = false
    } else if (!inWord) {
      words += 1
      inWord = true
    }
  }

  return { words, characters: text.length, charactersNoSpaces, lines, paragraphs }
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

    // A source-only tab may be megabytes of text that is not markdown: the
    // markdown-stripping patterns in countWords are quadratic on some of it
    // (33 s for a 440 KB CSV of `<LOD` values).
    if (tab.sourceOnly) {
      stats.value = plainStats(text)
      return
    }

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
  watch(
    () => tabsStore.activeTabId,
    () => {
      updateStats()
    },
    { immediate: true },
  )

  // Watch markdown content changes — debounced
  watch(
    () => tabsStore.activeTab?.editorState.markdown,
    () => {
      scheduleUpdate()
    },
  )

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
