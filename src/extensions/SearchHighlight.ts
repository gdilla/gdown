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
  /** The regex match in the search index text (used to expand `$1`-style replacements). */
  match: RegExpExecArray
}

export interface SearchHighlightOptions {
  searchTerm: string
  caseSensitive: boolean
  useRegex: boolean
  currentIndex: number // index of the "active" match (-1 = none)
  results: SearchResult[]
}

export interface SearchPluginState {
  searchTerm: string
  caseSensitive: boolean
  useRegex: boolean
  currentIndex: number
  results: SearchResult[]
  decorations: DecorationSet
}

type SearchMeta =
  | { type: 'clear' }
  | { type: 'setSearch'; searchTerm: string; caseSensitive: boolean; useRegex: boolean }
  | { type: 'setIndex'; index: number }
  | { type: 'afterReplace' }
  | { type: 'afterReplaceAll' }

export const searchHighlightPluginKey = new PluginKey<SearchPluginState>('searchHighlight')

const EMPTY_STATE: SearchPluginState = {
  searchTerm: '',
  caseSensitive: false,
  useRegex: false,
  currentIndex: -1,
  results: [],
  decorations: DecorationSet.empty,
}

/** Text that is contiguous in the document, and where it starts. */
interface TextRun {
  text: string
  pos: number // document position of the first character
}

/**
 * Group the document's text nodes into runs of document-contiguous text. Any
 * gap — a block boundary or a non-text inline node such as inline math, an
 * image or a hard break — starts a new run. Searching run by run means a match
 * can never span a gap, and no valid match next to one is lost.
 */
function getTextRuns(state: EditorState): TextRun[] {
  const runs: TextRun[] = []
  let docEnd = -1

  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true
    const last = runs[runs.length - 1]
    if (last && pos === docEnd) last.text += node.text
    else runs.push({ text: node.text, pos })
    docEnd = pos + node.nodeSize
    return true
  })

  return runs
}

/**
 * Build the search regex, or null when the user's pattern is invalid.
 * Multiline: `^` and `$` match at every line — the edges of each text run
 * (paragraph edges, either side of an inline node) and code-block lines.
 */
function buildSearchRegex(
  searchTerm: string,
  caseSensitive: boolean,
  useRegex: boolean,
): RegExp | null {
  const source = useRegex ? searchTerm : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    return new RegExp(source, caseSensitive ? 'gm' : 'gim')
  } catch {
    return null
  }
}

/**
 * Find all matches in the document for the given search parameters.
 */
function findMatches(
  state: EditorState,
  searchTerm: string,
  caseSensitive: boolean,
  useRegex: boolean,
): SearchResult[] {
  if (!searchTerm) return []
  const regex = buildSearchRegex(searchTerm, caseSensitive, useRegex)
  if (!regex) return []

  const results: SearchResult[] = []
  for (const run of getTextRuns(state)) {
    // matchAll advances past empty matches itself, so patterns like `x*` or `^` terminate.
    for (const match of run.text.matchAll(regex)) {
      if (!match[0]) continue // an empty match has nothing to highlight or replace
      const from = run.pos + match.index
      results.push({ from, to: from + match[0].length, match })
    }
  }
  return results
}

// `$$`, `$&`, `$n`/`$nn` and `$<name>`, as in String.prototype.replace. `` $` `` and
// `$'` stay literal (as in the source editor's CodeMirror replace): expanding them
// would copy surrounding document text into every replacement.
const SUBSTITUTION = /\$(?:([$&])|(\d\d?)|<([^>]*)>)/g

/**
 * Expand a regex replacement template for one match, following the
 * GetSubstitution rules of String.prototype.replace for the tokens above.
 * Work is proportional to the template, not the document.
 */
function expandReplacement(template: string, m: RegExpExecArray): string {
  const groupCount = m.length - 1
  return template.replace(
    SUBSTITUTION,
    (token: string, sym?: string, digits?: string, name?: string) => {
      if (sym === '$') return '$'
      if (sym === '&') return m[0]
      if (name !== undefined) return m.groups ? (m.groups[name] ?? '') : token
      // `$nn` names a two-digit group if it exists, else `$n` followed by a literal digit.
      let n = Number(digits)
      let rest = ''
      if (digits!.length === 2 && (n < 1 || n > groupCount)) {
        n = Number(digits![0])
        rest = digits![1]!
      }
      return n >= 1 && n <= groupCount ? (m[n] ?? '') + rest : token
    },
  )
}

/** The text that replaces `result`: literal in plain mode, expanded in regex mode. */
function replacementFor(
  value: SearchPluginState,
  result: SearchResult,
  replacement: string,
): string {
  return value.useRegex ? expandReplacement(replacement, result.match) : replacement
}

/**
 * Build ProseMirror decorations from search results.
 */
function buildDecorations(
  state: EditorState,
  results: SearchResult[],
  currentIndex: number,
): DecorationSet {
  if (results.length === 0) return DecorationSet.empty

  const decorations: Decoration[] = []

  results.forEach((result, index) => {
    const className =
      index === currentIndex ? 'search-highlight search-highlight-current' : 'search-highlight'

    decorations.push(
      Decoration.inline(result.from, result.to, {
        class: className,
      }),
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
            const text = replacementFor(pluginState, match, replacement)
            const replaceNode = text ? state.schema.text(text, marksAtPos) : null

            // Replace the matched range
            if (replaceNode) {
              tr.replaceWith(match.from, match.to, replaceNode)
            } else {
              // Empty replacement = delete
              tr.delete(match.from, match.to)
            }

            // Signal the plugin to recompute after the doc change
            tr.setMeta(searchHighlightPluginKey, { type: 'afterReplace' } satisfies SearchMeta)

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

              const text = replacementFor(pluginState, match, replacement)
              if (text) {
                const replaceNode = state.schema.text(text, marksAtPos)
                tr.replaceWith(mappedFrom, mappedTo, replaceNode)
              } else {
                tr.delete(mappedFrom, mappedTo)
              }
            }

            // Signal the plugin to recompute
            tr.setMeta(searchHighlightPluginKey, { type: 'afterReplaceAll' } satisfies SearchMeta)

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
          init: (): SearchPluginState => EMPTY_STATE,

          apply(tr, value, _oldState, newState): SearchPluginState {
            const meta = tr.getMeta(searchHighlightPluginKey) as SearchMeta | undefined

            if (meta?.type === 'clear') return EMPTY_STATE

            if (meta?.type === 'setSearch') {
              const results = findMatches(
                newState,
                meta.searchTerm,
                meta.caseSensitive,
                meta.useRegex,
              )
              const currentIndex = results.length > 0 ? 0 : -1
              return {
                searchTerm: meta.searchTerm,
                caseSensitive: meta.caseSensitive,
                useRegex: meta.useRegex,
                currentIndex,
                results,
                decorations: buildDecorations(newState, results, currentIndex),
              }
            }

            if (meta?.type === 'setIndex') {
              return {
                ...value,
                currentIndex: meta.index,
                decorations: buildDecorations(newState, value.results, meta.index),
              }
            }

            // The document changed (typing, tab switch, Replace, Replace All):
            // re-run the search and keep the current match where the user is.
            if (tr.docChanged && value.searchTerm) {
              const results = findMatches(
                newState,
                value.searchTerm,
                value.caseSensitive,
                value.useRegex,
              )
              let currentIndex = -1
              if (results.length > 0) {
                const current =
                  meta?.type === 'afterReplaceAll' ? undefined : value.results[value.currentIndex]
                // After Replace continue past the inserted text (so a replacement
                // containing the term is not matched again); otherwise stay on
                // the same match as it moves with the edit.
                const anchor = current
                  ? tr.mapping.map(meta?.type === 'afterReplace' ? current.to : current.from)
                  : 0
                currentIndex = Math.max(
                  0,
                  results.findIndex((r) => r.from >= anchor),
                )
              }
              return {
                ...value,
                results,
                currentIndex,
                decorations: buildDecorations(newState, results, currentIndex),
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
export function getSearchState(state: EditorState): SearchPluginState | undefined {
  return searchHighlightPluginKey.getState(state)
}
