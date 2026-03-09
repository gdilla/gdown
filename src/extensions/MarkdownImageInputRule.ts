import { InputRule } from "@tiptap/core";
import { NodeType } from "@tiptap/pm/model";

/**
 * Markdown image input rule: ![alt](src "title")
 * Matches markdown image syntax and converts to an inline image node.
 * Typora behavior: as soon as the closing ) is typed, the markdown syntax
 * disappears and the image renders inline with a preview.
 */
export function markdownImageInputRule(imageType: NodeType): InputRule {
  // Matches: ![alt text](url) or ![alt text](url "title")
  const imageRegex = /!\[([^\]]*)\]\(([^)"]+)(?:\s+"([^"]*)")?\)$/;

  return new InputRule({
    find: imageRegex,
    handler: ({ state, range, match }) => {
      const [, alt, src, title] = match;
      const attrs: Record<string, string | null> = {
        src: src ?? null,
        alt: alt ?? null,
        title: title ?? null,
      };

      const tr = state.tr;
      const node = imageType.create(attrs);
      tr.replaceWith(range.from, range.to, node);
    },
  });
}
