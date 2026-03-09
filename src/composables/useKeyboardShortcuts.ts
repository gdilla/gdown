/**
 * Keyboard shortcuts reference for gdown.
 * Maps Typora-exact keyboard shortcuts to their actions.
 *
 * This module provides a centralized registry of all application-level
 * keyboard shortcuts. The actual handling is in App.vue's handleKeydown()
 * and Tauri menu accelerators in lib.rs.
 */

export interface ShortcutDefinition {
  /** Human-readable label */
  label: string
  /** macOS accelerator string (for display) */
  keys: string
  /** Category for grouping in help/preferences */
  category: 'file' | 'edit' | 'view' | 'paragraph' | 'format' | 'navigation'
}

/**
 * Complete list of application-level keyboard shortcuts.
 * Matches Typora's exact bindings for macOS.
 */
export const KEYBOARD_SHORTCUTS: ShortcutDefinition[] = [
  // File operations
  { label: 'New', keys: '⌘N', category: 'file' },
  { label: 'Open', keys: '⌘O', category: 'file' },
  { label: 'Open Folder', keys: '⌘⇧O', category: 'file' },
  { label: 'Save', keys: '⌘S', category: 'file' },
  { label: 'Save As', keys: '⌘⇧S', category: 'file' },
  { label: 'Export', keys: '⌘⇧E', category: 'file' },
  { label: 'Close Tab', keys: '⌘W', category: 'file' },
  { label: 'Preferences', keys: '⌘,', category: 'file' },

  // Edit operations (handled by TipTap/CodeMirror + system)
  { label: 'Undo', keys: '⌘Z', category: 'edit' },
  { label: 'Redo', keys: '⌘⇧Z', category: 'edit' },
  { label: 'Cut', keys: '⌘X', category: 'edit' },
  { label: 'Copy', keys: '⌘C', category: 'edit' },
  { label: 'Paste', keys: '⌘V', category: 'edit' },
  { label: 'Select All', keys: '⌘A', category: 'edit' },
  { label: 'Find', keys: '⌘F', category: 'edit' },
  { label: 'Find and Replace', keys: '⌘H', category: 'edit' },

  // View
  { label: 'Toggle Source Mode', keys: '⌘/', category: 'view' },
  { label: 'Toggle Sidebar', keys: '⌘\\', category: 'view' },
  { label: 'Toggle Sidebar (Alt)', keys: '⌘⇧L', category: 'view' },
  { label: 'Toggle Outline', keys: '⌘⇧1', category: 'view' },
  { label: 'Focus Mode', keys: 'F8', category: 'view' },
  { label: 'Typewriter Mode', keys: 'F9', category: 'view' },

  // Tab navigation
  { label: 'Next Tab', keys: '⌘⇧]', category: 'navigation' },
  { label: 'Previous Tab', keys: '⌘⇧[', category: 'navigation' },
  { label: 'Next Tab (Alt)', keys: '⌃Tab', category: 'navigation' },
  { label: 'Previous Tab (Alt)', keys: '⌃⇧Tab', category: 'navigation' },

  // Formatting (handled by TipTap extensions in WYSIWYG mode)
  { label: 'Bold', keys: '⌘B', category: 'format' },
  { label: 'Italic', keys: '⌘I', category: 'format' },
  { label: 'Underline', keys: '⌘U', category: 'format' },
  { label: 'Strikethrough', keys: '⌘⇧X', category: 'format' },
  { label: 'Inline Code', keys: '⌘⇧`', category: 'format' },
  { label: 'Hyperlink', keys: '⌘K', category: 'format' },

  // Paragraph (handled by TipTap extensions in WYSIWYG mode)
  { label: 'Heading 1', keys: '⌘1', category: 'paragraph' },
  { label: 'Heading 2', keys: '⌘2', category: 'paragraph' },
  { label: 'Heading 3', keys: '⌘3', category: 'paragraph' },
  { label: 'Heading 4', keys: '⌘4', category: 'paragraph' },
  { label: 'Heading 5', keys: '⌘5', category: 'paragraph' },
  { label: 'Heading 6', keys: '⌘6', category: 'paragraph' },
  { label: 'Paragraph', keys: '⌘0', category: 'paragraph' },
  { label: 'Increase Heading Level', keys: '⌘+', category: 'paragraph' },
  { label: 'Decrease Heading Level', keys: '⌘-', category: 'paragraph' },
]

/**
 * Get shortcuts grouped by category.
 */
export function getShortcutsByCategory(): Record<string, ShortcutDefinition[]> {
  const grouped: Record<string, ShortcutDefinition[]> = {}
  for (const shortcut of KEYBOARD_SHORTCUTS) {
    if (!grouped[shortcut.category]) {
      grouped[shortcut.category] = []
    }
    grouped[shortcut.category]!.push(shortcut)
  }
  return grouped
}
