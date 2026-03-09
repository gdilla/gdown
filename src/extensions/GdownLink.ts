import Link, { type LinkOptions } from "@tiptap/extension-link";
import {
  markdownLinkInputRule,
  markdownAutoLinkInputRule,
  bareUrlInputRule,
} from "./MarkdownLinkInputRule";

/**
 * GdownLink: Custom TipTap Link extension with Typora-like behavior.
 *
 * Features:
 * - Markdown input rule: [text](url) converts inline
 * - Auto-link: <url> converts inline
 * - Bare URL detection: URLs followed by space auto-link
 * - Cmd+click to open links (macOS native feel)
 * - Link tooltip on hover showing URL
 * - Editable links (click to place cursor, Cmd+click to open)
 */
export const GdownLink = Link.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      openOnClick: false,
      linkOnPaste: true,
      autolink: true,
      HTMLAttributes: {
        class: "gdown-link",
        rel: "noopener noreferrer nofollow",
      },
    } as LinkOptions;
  },

  addInputRules() {
    const linkType = this.type;
    return [
      markdownLinkInputRule(linkType),
      markdownAutoLinkInputRule(linkType),
      bareUrlInputRule(linkType),
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        // Typora shortcut: Cmd+K to insert/edit link
        const { from, to, empty } = this.editor.state.selection;
        if (empty) {
          // No selection: toggle link off if active, otherwise prompt
          if (this.editor.isActive("link")) {
            return this.editor.chain().focus().unsetLink().run();
          }
          // Dispatch a custom event so the UI can show a link dialog
          window.dispatchEvent(
            new CustomEvent("gdown:insert-link", {
              detail: { from, to },
            })
          );
          return true;
        }
        // Has selection: wrap in link
        if (this.editor.isActive("link")) {
          return this.editor.chain().focus().unsetLink().run();
        }
        window.dispatchEvent(
          new CustomEvent("gdown:insert-link", {
            detail: { from, to, text: this.editor.state.doc.textBetween(from, to) },
          })
        );
        return true;
      },
    };
  },
});
