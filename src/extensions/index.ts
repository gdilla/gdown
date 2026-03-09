// Inline formatting marks (bold, italic, strikethrough, code, underline, highlight)
export {
  GdownBold,
  GdownItalic,
  GdownStrike,
  GdownCode,
  GdownUnderline,
  GdownHighlight,
  inlineFormattingExtensions,
} from "./InlineFormatting";

// Inline-level extensions
export { GdownLink } from "./GdownLink";
export { GdownImage } from "./GdownImage";
export {
  markdownLinkInputRule,
  markdownAutoLinkInputRule,
  bareUrlInputRule,
} from "./MarkdownLinkInputRule";
export { markdownImageInputRule } from "./MarkdownImageInputRule";

// Block-level extensions
export { GdownHeading } from "./GdownHeading";
export { GdownBlockquote } from "./GdownBlockquote";
export { GdownHorizontalRule } from "./GdownHorizontalRule";
export { GdownCodeBlock, getSupportedLanguages } from "./GdownCodeBlock";

// Diagram extensions
export { MermaidBlock } from "./MermaidBlock";

// List extensions
export { GdownBulletList, GdownListItem } from "./GdownBulletList";
export { GdownOrderedList } from "./GdownOrderedList";
export { GdownTaskList, GdownTaskItem } from "./GdownTaskList";

// Math extensions
export { MathInline } from "./MathInline";
export { MathBlock } from "./MathBlock";

// Front-matter (YAML metadata block)
export { FrontMatter } from "./FrontMatter";

// Focus mode
export { FocusMode, focusModePluginKey, FOCUS_MODE_META } from "./FocusMode";

// Typewriter mode
export { TypewriterMode } from "./TypewriterMode";

// Search & Replace
export { SearchHighlight, searchHighlightPluginKey, getSearchState } from "./SearchHighlight";
export type { SearchResult, SearchHighlightOptions } from "./SearchHighlight";
