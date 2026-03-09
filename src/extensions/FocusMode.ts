import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * FocusMode TipTap Extension
 *
 * When enabled, dims all top-level blocks except the one containing the cursor.
 * Mimics Typora's "Focus Mode" (View > Focus Mode).
 *
 * Uses ProseMirror plugin state with a meta-based toggle so reactivity works
 * properly when the user toggles focus mode on/off.
 *
 * CSS classes applied:
 *   - 'focus-active' on the block containing the selection
 *   - 'focus-dimmed' on all other blocks
 *
 * The parent editor wrapper should also get a 'focus-mode' class (via Vue binding)
 * to enable smooth CSS transitions.
 */

export const focusModePluginKey = new PluginKey('focusMode')

/** Meta key used to toggle focus mode via transactions */
export const FOCUS_MODE_META = 'focusModeEnabled'

export interface FocusModeOptions {
  enabled: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    focusMode: {
      /**
       * Toggle focus mode on or off
       */
      setFocusMode: (enabled: boolean) => ReturnType
    }
  }
}

function buildDecorations(
  doc: any,
  selection: any,
  enabled: boolean
): DecorationSet {
  if (!enabled) {
    return DecorationSet.empty
  }

  const decorations: Decoration[] = []
  const $anchor = selection.$anchor

  // Find the top-level (depth=1) block containing the cursor
  let activeBlockPos = -1

  if ($anchor.depth >= 1) {
    activeBlockPos = $anchor.before(1)
  }

  // Decorate all top-level nodes
  doc.forEach((node: any, offset: number) => {
    const nodeEnd = offset + node.nodeSize
    const isActive = offset === activeBlockPos

    decorations.push(
      Decoration.node(offset, nodeEnd, {
        class: isActive ? 'focus-active' : 'focus-dimmed',
      })
    )
  })

  return DecorationSet.create(doc, decorations)
}

export const FocusMode = Extension.create<FocusModeOptions>({
  name: 'focusMode',

  addOptions() {
    return {
      enabled: false,
    }
  },

  addCommands() {
    return {
      setFocusMode:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(FOCUS_MODE_META, enabled)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const initialEnabled = this.options.enabled

    return [
      new Plugin({
        key: focusModePluginKey,

        state: {
          init(_, state) {
            return {
              enabled: initialEnabled,
              decorations: buildDecorations(
                state.doc,
                state.selection,
                initialEnabled
              ),
            }
          },

          apply(tr, prev, _oldState, newState) {
            // Check if focus mode was toggled via meta
            const metaEnabled = tr.getMeta(FOCUS_MODE_META)
            const enabled =
              metaEnabled !== undefined ? metaEnabled : prev.enabled

            // Rebuild decorations whenever enabled state changes, doc changes,
            // or selection moves (cursor might have moved to a different block)
            if (
              enabled !== prev.enabled ||
              metaEnabled !== undefined ||
              tr.docChanged ||
              tr.selectionSet
            ) {
              return {
                enabled,
                decorations: buildDecorations(
                  newState.doc,
                  newState.selection,
                  enabled
                ),
              }
            }

            return prev
          },
        },

        props: {
          decorations(state) {
            const pluginState = focusModePluginKey.getState(state)
            return pluginState?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
