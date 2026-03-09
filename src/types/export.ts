/**
 * Export format and configuration types matching the Rust backend.
 * Used for Pandoc-based document export with per-format argument templates.
 */

/** Supported export formats (matches Rust ExportFormat enum). */
export type ExportFormat = 'pdf' | 'html' | 'word' | 'latex' | 'epub' | 'rtf'

/** Export format metadata returned by get_export_formats. */
export interface ExportFormatInfo {
  id: ExportFormat
  label: string
  extension: string
}

/** Pandoc installation info returned by check_pandoc. */
export interface PandocInfo {
  path: string
  version: string
}

/** Export operation result returned by export_document. */
export interface ExportResult {
  success: boolean
  output_path: string
  message: string
}

/**
 * Per-format export configuration with Pandoc argument templates.
 * Matches the Rust ExportConfig struct.
 * All optional fields default to null (use Pandoc defaults).
 */
export interface ExportConfig {
  /** The export format this config applies to. */
  format: ExportFormat

  /** Pandoc input format string (e.g., "gfm+tex_math_dollars+raw_tex"). */
  from_format: string

  /** Whether to produce a standalone document (--standalone). */
  standalone: boolean

  /** PDF engine (--pdf-engine). Values: "xelatex", "pdflatex", "lualatex", "tectonic", "weasyprint". */
  pdf_engine: string | null

  /** Math rendering method. Values: "mathjax", "katex", "mathml", "webtex", "gladtex". */
  math_method: string | null

  /** Path to a custom CSS file for HTML/EPUB output (--css). */
  css_file: string | null

  /** Path to a custom reference document for Word/EPUB output (--reference-doc). */
  reference_doc: string | null

  /** Path to a custom template (--template). */
  template: string | null

  /** Path to header include file (--include-in-header). */
  header_includes: string | null

  /** Path to before-body include file (--include-before-body). */
  before_body: string | null

  /** Path to after-body include file (--include-after-body). */
  after_body: string | null

  /** Whether to generate a table of contents (--toc). */
  table_of_contents: boolean

  /** TOC depth (--toc-depth). */
  toc_depth: number | null

  /** Whether to number sections (--number-sections). */
  number_sections: boolean

  /** Highlight style for code blocks (--highlight-style). */
  highlight_style: string | null

  /** Document class for LaTeX/PDF (--variable=documentclass:VALUE). */
  document_class: string | null

  /** Paper size for LaTeX/PDF (--variable=papersize:VALUE). */
  paper_size: string | null

  /** Geometry/margins for LaTeX/PDF (--variable=geometry:VALUE). */
  geometry: string | null

  /** Main font for LaTeX/PDF (--variable=mainfont:VALUE). */
  main_font: string | null

  /** Mono font for LaTeX/PDF (--variable=monofont:VALUE). */
  mono_font: string | null

  /** Font size for LaTeX/PDF (--variable=fontsize:VALUE). */
  font_size: string | null

  /** Line stretch for LaTeX/PDF (--variable=linestretch:VALUE). */
  line_stretch: string | null

  /** Additional raw Pandoc arguments. */
  extra_args: string[]

  /** EPUB cover image path (--epub-cover-image). */
  epub_cover_image: string | null

  /** EPUB chapter level (--epub-chapter-level). */
  epub_chapter_level: number | null
}
