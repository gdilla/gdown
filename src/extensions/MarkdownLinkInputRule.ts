import { InputRule } from "@tiptap/core";
import { MarkType } from "@tiptap/pm/model";

/**
 * Markdown link input rule: [text](url "title")
 * Matches markdown link syntax and converts to a TipTap link mark inline.
 * Typora behavior: as soon as the closing ) is typed, the markdown syntax
 * disappears and the text becomes a clickable link.
 */
export function markdownLinkInputRule(linkType: MarkType): InputRule {
  // Matches: [link text](url) or [link text](url "title")
  const linkRegex = /\[([^\]]+)\]\(([^)"]+)(?:\s+"([^"]*)")?\)$/;

  return new InputRule({
    find: linkRegex,
    handler: ({ state, range, match }) => {
      const [, text, url = "", title] = match;
      const attrs: Record<string, string> = {
        href: url,
        target: "_blank",
      };
      if (title) {
        attrs.title = title;
      }

      const tr = state.tr;
      if (text) {
        const linkMark = linkType.create(attrs);
        // Replace the full markdown syntax with just the link text + mark
        tr.replaceWith(
          range.from,
          range.to,
          state.schema.text(text, [linkMark])
        );
      }
    },
  });
}

/**
 * Markdown auto-link input rule: <url>
 * Converts bare URLs wrapped in angle brackets to links.
 */
export function markdownAutoLinkInputRule(linkType: MarkType): InputRule {
  const autoLinkRegex = /<(https?:\/\/[^\s>]+)>$/;

  return new InputRule({
    find: autoLinkRegex,
    handler: ({ state, range, match }) => {
      const [, url = ""] = match;
      const attrs = {
        href: url,
        target: "_blank",
      };
      const linkMark = linkType.create(attrs);
      const tr = state.tr;
      tr.replaceWith(range.from, range.to, state.schema.text(url, [linkMark]));
    },
  });
}

/**
 * Bare URL auto-detection input rule.
 * Detects URLs typed inline (after a space or at start) and wraps them in a link.
 */
export function bareUrlInputRule(linkType: MarkType): InputRule {
  const bareUrlRegex = /(?:^|\s)(https?:\/\/[^\s]+)\s$/;

  return new InputRule({
    find: bareUrlRegex,
    handler: ({ state, range, match }) => {
      const [fullMatch, url = ""] = match;
      const attrs = {
        href: url,
        target: "_blank",
      };

      const tr = state.tr;
      // Calculate exact positions of the URL in the matched text
      const prefixLength = fullMatch.length - url.length - 1; // -1 for trailing space
      const urlStart = range.from + prefixLength;
      const urlEnd = range.to - 1; // exclude trailing space

      const linkMark = linkType.create(attrs);
      tr.addMark(urlStart, urlEnd, linkMark);
    },
  });
}
