/**
 * InlineFormatting.ts
 *
 * Custom TipTap extensions for inline formatting marks (bold, italic,
 * strikethrough, inline code) that replicate Typora's WYSIWYG behavior:
 *
 * - Markdown syntax characters disappear immediately and formatting renders inline
 * - Input rules: **bold**, __bold__, *italic*, _italic_, ~~strikethrough~~, `code`
 * - Keyboard shortcuts match Typora exactly:
 *   - Cmd+B: Bold
 *   - Cmd+I: Italic
 *   - Cmd+Shift+5: Strikethrough (Typora-specific)
 *   - Cmd+Shift+`: Inline code (Typora-specific)
 *   - Cmd+U: Underline
 */
import { markInputRule, markPasteRule } from '@tiptap/core'
import Bold from '@tiptap/extension-bold' // from StarterKit
import Italic from '@tiptap/extension-italic' // from StarterKit
import Strike from '@tiptap/extension-strike' // from StarterKit
import Code from '@tiptap/extension-code' // from StarterKit
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'

/**
 * Enhanced Bold mark with additional markdown input rules.
 * StarterKit's Bold already handles **text** and __text__,
 * but we extend to ensure proper Typora-like shortcuts.
 */
export const GdownBold = Bold.extend({
  addKeyboardShortcuts() {
    return {
      'Mod-b': () => this.editor.commands.toggleBold(),
      'Mod-B': () => this.editor.commands.toggleBold(),
    }
  },
})

/**
 * Enhanced Italic mark with Typora shortcuts.
 * StarterKit's Italic already handles *text* and _text_.
 */
export const GdownItalic = Italic.extend({
  addKeyboardShortcuts() {
    return {
      'Mod-i': () => this.editor.commands.toggleItalic(),
      'Mod-I': () => this.editor.commands.toggleItalic(),
    }
  },
})

/**
 * Enhanced Strikethrough with Typora's exact shortcut (Cmd+Shift+5)
 * and markdown input rule (~~text~~).
 */
export const GdownStrike = Strike.extend({
  addKeyboardShortcuts() {
    return {
      // Typora uses Cmd+Shift+5 for strikethrough (not Cmd+D like some editors)
      'Mod-Shift-5': () => this.editor.commands.toggleStrike(),
      // Also support the more common Alt+Shift+5
      'Alt-Shift-5': () => this.editor.commands.toggleStrike(),
    }
  },
})

/**
 * Enhanced inline Code mark with Typora's exact shortcut (Cmd+Shift+`)
 * and markdown input rule (`text`).
 */
export const GdownCode = Code.extend({
  addKeyboardShortcuts() {
    return {
      // Typora uses Cmd+Shift+` for inline code
      'Mod-Shift-`': () => this.editor.commands.toggleCode(),
      // Fallback: also support Mod+e (common in other editors)
      'Mod-e': () => this.editor.commands.toggleCode(),
    }
  },
})

/**
 * Underline with Typora shortcut (Cmd+U).
 */
export const GdownUnderline = Underline.extend({
  addKeyboardShortcuts() {
    return {
      'Mod-u': () => this.editor.commands.toggleUnderline(),
      'Mod-U': () => this.editor.commands.toggleUnderline(),
    }
  },
})

/**
 * Highlight/mark with Typora shortcut (Cmd+Shift+H).
 * Markdown: ==highlighted text==
 */
export const GdownHighlight = Highlight.extend({
  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|[^=])(==([^=]+)==)$/,
        type: this.type,
      }),
    ]
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: /(?:^|[^=])(==([^=]+)==)/g,
        type: this.type,
      }),
    ]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-h': () => this.editor.commands.toggleHighlight(),
      'Mod-Shift-H': () => this.editor.commands.toggleHighlight(),
    }
  },
})

/**
 * Bundle all inline formatting extensions for easy import.
 *
 * Usage in editor setup:
 *   import { inlineFormattingExtensions } from './extensions/InlineFormatting'
 *   // then spread into extensions array:
 *   extensions: [...inlineFormattingExtensions, ...]
 */
export const inlineFormattingExtensions = [
  GdownBold,
  GdownItalic,
  GdownStrike,
  GdownCode,
  GdownUnderline,
  GdownHighlight.configure({
    multicolor: false,
  }),
  Subscript,
  Superscript,
]
