/**
 * SearchHighlight — TipTap extension for Find/Replace in the WYSIWYG editor.
 *
 * Uses ProseMirror Plugin + Decorations to:
 *   - Highlight ALL matches in the document
 *   - Distinguish the "current" match with a different decoration class
 *   - Support case-sensitive and regex search modes
 *   - Navigate between matches (next/previous)
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState } from '@tiptap/pm/state'

// Augment TipTap Commands interface with our search commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchTerm: (searchTerm: string, caseSensitive: boolean, useRegex: boolean) => ReturnType
      setSearchIndex: (index: number) => ReturnType
      clearSearch: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
    }
  }
}

export interface SearchResult {
  from: number
  to: number
}

export interface SearchHighlightOptions {
  searchTerm: string
  caseSensitive: boolean
  useRegex: boolean
  currentIndex: number // index of the "active" match (-1 = none)
  results: SearchResult[]
}

export const searchHighlightPluginKey = new PluginKey('searchHighlight')

/**
 * Extract text content from a ProseMirror document, mapping each character
 * back to its document position. This handles node boundaries correctly.
 */
function getDocumentText(state: EditorState): { text: string; posMap: number[] } {
  const text: string[] = []
  const posMap: number[] = []

  state.doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        text.push(node.text!.charAt(i))
        posMap.push(pos + i)
      }
    } else if (node.isBlock && text.length > 0) {
      // Insert a newline between blocks so searches don't span across them
      text.push('\n')
      posMap.push(-1) // -1 means not a real position
    }
    return true // descend into children
  })

  return { text: text.join(''), posMap }
}

/**
 * Find all matches in the document for the given search parameters.
 */
function findMatches(
  state: EditorState,
  searchTerm: string,
  caseSensitive: boolean,
  useRegex: boolean
): SearchResult[] {
  if (!searchTerm) return []

  const { text, posMap } = getDocumentText(state)

  if (!text) return []

  const results: SearchResult[] = []

  try {
    let regex: RegExp

    if (useRegex) {
      const flags = caseSensitive ? 'g' : 'gi'
      regex = new RegExp(searchTerm, flags)
    } else {
      // Escape special regex characters for literal search
      const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const flags = caseSensitive ? 'g' : 'gi'
      regex = new RegExp(escaped, flags)
    }

    let match: RegExpExecArray | null
    // Safety: prevent infinite loops on zero-length matches
    let lastIndex = -1

    while ((match = regex.exec(text)) !== null) {
      if (match.index === lastIndex) {
        // Zero-length match — advance to avoid infinite loop
        regex.lastIndex = match.index + 1
        continue
      }
      lastIndex = match.index

      const matchStart = match.index
      const matchEnd = match.index + match[0].length

      // Map text positions back to document positions
      if (matchStart >= posMap.length || matchEnd - 1 >= posMap.length) break

      const from = posMap[matchStart]
      const toBase = posMap[matchEnd - 1]
      if (from === undefined || toBase === undefined) continue
      const to = toBase + 1

      // Skip matches that span block boundaries (position = -1)
      let spansBlock = false
      for (let i = matchStart; i < matchEnd; i++) {
        if (posMap[i] === -1) {
          spansBlock = true
          break
        }
      }

      if (!spansBlock && from >= 0 && to >= 0) {
        results.push({ from, to })
      }
    }
  } catch {
    // Invalid regex — return no results
    return []
  }

  return results
}

/**
 * Build ProseMirror decorations from search results.
 */
function buildDecorations(
  state: EditorState,
  results: SearchResult[],
  currentIndex: number
): DecorationSet {
  if (results.length === 0) return DecorationSet.empty

  const decorations: Decoration[] = []

  results.forEach((result, index) => {
    const className =
      index === currentIndex
        ? 'search-highlight search-highlight-current'
        : 'search-highlight'

    decorations.push(
      Decoration.inline(result.from, result.to, {
        class: className,
      })
    )
  })

  return DecorationSet.create(state.doc, decorations)
}

export const SearchHighlight = Extension.create<SearchHighlightOptions>({
  name: 'searchHighlight',

  addOptions() {
    return {
      searchTerm: '',
      caseSensitive: false,
      useRegex: false,
      currentIndex: -1,
      results: [],
    }
  },

  addCommands() {
    return {
      /**
       * Set search parameters and recompute highlights.
       */
      setSearchTerm:
        (searchTerm: string, caseSensitive: boolean, useRegex: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchHighlightPluginKey, {
              type: 'setSearch',
              searchTerm,
              caseSensitive,
              useRegex,
            })
            dispatch(tr)
          }
          return true
        },

      /**
       * Set the current match index (for next/previous navigation).
       */
      setSearchIndex:
        (index: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchHighlightPluginKey, {
              type: 'setIndex',
              index,
            })
            dispatch(tr)
          }
          return true
        },

      /**
       * Clear all search highlights.
       */
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchHighlightPluginKey, {
              type: 'clear',
            })
            dispatch(tr)
          }
          return true
        },

      /**
       * Replace the current match with the given replacement text.
       * Preserves surrounding formatting (marks) by using replaceWith
       * on the exact match range while keeping marks from the original text.
       * After replacing, advances to the next match.
       */
      replaceCurrent:
        (replacement: string) =>
        ({ state, dispatch, tr }) => {
          const pluginState = searchHighlightPluginKey.getState(state)
          if (!pluginState || pluginState.results.length === 0 || pluginState.currentIndex < 0) {
            return false
          }

          const { results, currentIndex } = pluginState
          const match = results[currentIndex]
          if (!match) return false

          if (dispatch) {
            // Collect marks at the match start position to preserve formatting
            const $from = state.doc.resolve(match.from)
            const marksAtPos = $from.marks()

            // Create a text node with the replacement, preserving marks
            const replaceNode = replacement
              ? state.schema.text(replacement, marksAtPos)
              : null

            // Replace the matched range
            if (replaceNode) {
              tr.replaceWith(match.from, match.to, replaceNode)
            } else {
              // Empty replacement = delete
              tr.delete(match.from, match.to)
            }

            // Signal the plugin to recompute after the doc change
            tr.setMeta(searchHighlightPluginKey, {
              type: 'afterReplace',
              replacedIndex: currentIndex,
            })

            dispatch(tr)
          }
          return true
        },

      /**
       * Replace all matches with the given replacement text.
       * Processes matches in reverse order (from end to start) to avoid
       * position shifts invalidating earlier match positions.
       * Preserves marks/formatting at each match location.
       */
      replaceAll:
        (replacement: string) =>
        ({ state, dispatch, tr }) => {
          const pluginState = searchHighlightPluginKey.getState(state)
          if (!pluginState || pluginState.results.length === 0) {
            return false
          }

          const { results } = pluginState

          if (dispatch) {
            // Process matches in reverse document order so position shifts
            // from earlier replacements don't affect later ones.
            const sortedResults = [...results].sort((a, b) => b.from - a.from)

            for (const match of sortedResults) {
              // Map positions through any prior steps in this transaction
              const mappedFrom = tr.mapping.map(match.from)
              const mappedTo = tr.mapping.map(match.to)

              // Collect marks at the mapped match start to preserve formatting
              const $from = tr.doc.resolve(mappedFrom)
              const marksAtPos = $from.marks()

              if (replacement) {
                const replaceNode = state.schema.text(replacement, marksAtPos)
                tr.replaceWith(mappedFrom, mappedTo, replaceNode)
              } else {
                tr.delete(mappedFrom, mappedTo)
              }
            }

            // Signal the plugin to recompute
            tr.setMeta(searchHighlightPluginKey, {
              type: 'afterReplaceAll',
            })

            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightPluginKey,

        state: {
          init(): {
            searchTerm: string
            caseSensitive: boolean
            useRegex: boolean
            currentIndex: number
            results: SearchResult[]
            decorations: DecorationSet
          } {
            return {
              searchTerm: '',
              caseSensitive: false,
              useRegex: false,
              currentIndex: -1,
              results: [],
              decorations: DecorationSet.empty,
            }
          },

          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(searchHighlightPluginKey)

            if (meta) {
              if (meta.type === 'clear') {
                return {
                  searchTerm: '',
                  caseSensitive: false,
                  useRegex: false,
                  currentIndex: -1,
                  results: [],
                  decorations: DecorationSet.empty,
                }
              }

              if (meta.type === 'setSearch') {
                const results = findMatches(
                  newState,
                  meta.searchTerm,
                  meta.caseSensitive,
                  meta.useRegex
                )
                const currentIndex = results.length > 0 ? 0 : -1
                const decorations = buildDecorations(newState, results, currentIndex)

                return {
                  searchTerm: meta.searchTerm,
                  caseSensitive: meta.caseSensitive,
                  useRegex: meta.useRegex,
                  currentIndex,
                  results,
                  decorations,
                }
              }

              if (meta.type === 'setIndex') {
                const newIndex = meta.index
                const decorations = buildDecorations(newState, value.results, newIndex)

                return {
                  ...value,
                  currentIndex: newIndex,
                  decorations,
                }
              }

              if (meta.type === 'afterReplace') {
                // After a single replacement, re-run search on the new doc
                const results = findMatches(
                  newState,
                  value.searchTerm,
                  value.caseSensitive,
                  value.useRegex
                )
                // Keep the same index (which now points to the "next" match
                // since the replaced match is gone), clamped to valid range
                let newIndex = meta.replacedIndex
                if (newIndex >= results.length) {
                  newIndex = results.length > 0 ? 0 : -1
                }
                const decorations = buildDecorations(newState, results, newIndex)

                return {
                  ...value,
                  results,
                  currentIndex: newIndex,
                  decorations,
                }
              }

              if (meta.type === 'afterReplaceAll') {
                // After replacing all, re-run search — should find 0 matches
                const results = findMatches(
                  newState,
                  value.searchTerm,
                  value.caseSensitive,
                  value.useRegex
                )
                const newIndex = results.length > 0 ? 0 : -1
                const decorations = buildDecorations(newState, results, newIndex)

                return {
                  ...value,
                  results,
                  currentIndex: newIndex,
                  decorations,
                }
              }
            }

            // If the document changed, re-run search on the new content
            if (tr.docChanged && value.searchTerm) {
              const results = findMatches(
                newState,
                value.searchTerm,
                value.caseSensitive,
                value.useRegex
              )
              // Try to preserve current index; clamp to valid range
              let currentIndex = value.currentIndex
              if (currentIndex >= results.length) {
                currentIndex = results.length > 0 ? results.length - 1 : -1
              }
              const decorations = buildDecorations(newState, results, currentIndex)

              return {
                ...value,
                results,
                currentIndex,
                decorations,
              }
            }

            // If decorations exist but doc hasn't changed, map them through the transaction
            if (value.decorations !== DecorationSet.empty) {
              return {
                ...value,
                decorations: value.decorations.map(tr.mapping, tr.doc),
              }
            }

            return value
          },
        },

        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})

/**
 * Helper to read search results from the editor state (for external consumers).
 */
export function getSearchState(state: EditorState) {
  return searchHighlightPluginKey.getState(state) as {
    searchTerm: string
    caseSensitive: boolean
    useRegex: boolean
    currentIndex: number
    results: SearchResult[]
    decorations: DecorationSet
  } | undefined
}
