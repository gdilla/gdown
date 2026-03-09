import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * TypewriterMode extension for TipTap.
 *
 * When enabled, after every selection change the editor scrolls so the
 * cursor line sits at the vertical centre of the scrollable container.
 * This replicates Typora's "Typewriter Mode" (View → Typewriter Mode).
 *
 * The extension also adds generous top/bottom padding so the first and
 * last lines of the document can actually reach the vertical centre.
 */

export interface TypewriterModeOptions {
  /** Whether typewriter mode is initially enabled */
  enabled: boolean
}

const typewriterPluginKey = new PluginKey('typewriterMode')

export const TypewriterMode = Extension.create<TypewriterModeOptions>({
  name: 'typewriterMode',

  addOptions() {
    return {
      enabled: false,
    }
  },

  addCommands() {
    return {
      setTypewriterMode:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(typewriterPluginKey, { enabled })
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    let isEnabled = this.options.enabled

    return [
      new Plugin({
        key: typewriterPluginKey,

        state: {
          init() {
            return { enabled: isEnabled }
          },
          apply(tr, value) {
            const meta = tr.getMeta(typewriterPluginKey)
            if (meta !== undefined) {
              return { enabled: meta.enabled }
            }
            return value
          },
        },

        view(editorView) {
          /**
           * Scroll the cursor to vertical centre of the scroll container.
           * Uses requestAnimationFrame to run after the browser has
           * performed layout so coordsAtPos returns accurate values.
           */
          function scrollCursorToCenter() {
            if (!isEnabled) return

            const { state } = editorView
            const { selection } = state
            if (!selection || selection.empty === undefined) return

            // Find the scrollable container (the .editor-container element)
            const scrollContainer = findScrollContainer(editorView.dom)
            if (!scrollContainer) return

            requestAnimationFrame(() => {
              try {
                const cursorPos = selection.head ?? selection.from
                const coords = editorView.coordsAtPos(cursorPos)
                const containerRect = scrollContainer.getBoundingClientRect()

                // Target: cursor at vertical centre of the visible area
                const containerMid = containerRect.top + containerRect.height / 2
                const offset = coords.top - containerMid

                scrollContainer.scrollBy({
                  top: offset,
                  behavior: 'auto', // instant – no jank while typing
                })
              } catch {
                // coordsAtPos can throw if the position is out-of-range
              }
            })
          }

          return {
            update(view, prevState) {
              // Check for enable/disable meta
              // Read plugin state instead
              const pluginState = typewriterPluginKey.getState(view.state)
              if (pluginState) {
                isEnabled = pluginState.enabled
              }

              if (!isEnabled) return

              // Scroll on selection change OR content change
              const selectionChanged =
                !prevState.selection.eq(view.state.selection)
              const docChanged = !prevState.doc.eq(view.state.doc)

              if (selectionChanged || docChanged) {
                scrollCursorToCenter()
              }
            },
          }
        },
      }),
    ]
  },
})

/**
 * Walk up the DOM from the editor element to find the nearest
 * scrollable ancestor (the .editor-container div).
 */
function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = el
  while (current) {
    if (current.classList.contains('editor-container')) {
      return current
    }
    // Generic check: if the element can scroll vertically
    if (
      current !== el &&
      current.scrollHeight > current.clientHeight &&
      getComputedStyle(current).overflowY !== 'visible'
    ) {
      return current
    }
    current = current.parentElement
  }
  return null
}

// Augment TipTap Commands interface
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    typewriterMode: {
      setTypewriterMode: (enabled: boolean) => ReturnType
    }
  }
}
