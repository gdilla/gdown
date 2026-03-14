import { InputRule } from '@tiptap/core'
import { NodeType } from '@tiptap/pm/model'
import { getDocumentDir, resolveRelativeSrc } from '../utils/imagePathResolver'
import type { useTabsStore as UseTabsStore } from '../stores/tabs'

/**
 * Cached reference to the tabs store, initialized on first use.
 * Avoids circular dependency issues with dynamic import.
 */
let tabsStoreRef: ReturnType<typeof UseTabsStore> | null = null

async function ensureTabsStore(): Promise<void> {
  if (tabsStoreRef) return
  try {
    const { useTabsStore } = await import('../stores/tabs')
    tabsStoreRef = useTabsStore()
  } catch {
    // Store not available yet
  }
}

/**
 * Get the active document's directory synchronously from the cached tabs store.
 */
function getActiveDocDir(): string | null {
  if (!tabsStoreRef) return null
  return getDocumentDir(tabsStoreRef.activeTab?.filePath ?? null)
}

/**
 * Markdown image input rule: ![alt](src "title")
 * Matches markdown image syntax and converts to an inline image node.
 * Typora behavior: as soon as the closing ) is typed, the markdown syntax
 * disappears and the image renders inline with a preview.
 *
 * Relative image paths are resolved to Tauri asset protocol URLs so the
 * webview can display them.
 */
export function markdownImageInputRule(imageType: NodeType): InputRule {
  // Eagerly initialize the store reference
  ensureTabsStore()

  // Matches: ![alt text](url) or ![alt text](url "title")
  const imageRegex = /!\[([^\]]*)\]\(([^)"]+)(?:\s+"([^"]*)")?\)$/

  return new InputRule({
    find: imageRegex,
    handler: ({ state, range, match }) => {
      const [, alt, src, title] = match
      if (!src) return

      // Resolve relative paths to asset URLs for webview display
      const docDir = getActiveDocDir()
      const resolvedSrc = docDir ? resolveRelativeSrc(src, docDir) : src

      const attrs: Record<string, string | null> = {
        src: resolvedSrc,
        alt: alt ?? null,
        title: title ?? null,
      }

      const tr = state.tr
      const node = imageType.create(attrs)
      tr.replaceWith(range.from, range.to, node)
    },
  })
}
