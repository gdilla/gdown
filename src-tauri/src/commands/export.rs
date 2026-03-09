use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

/// Supported export formats with their Pandoc output format names and typical file extensions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Pdf,
    Html,
    Word,
    Latex,
    Epub,
    Rtf,
}

impl ExportFormat {
    /// Returns the Pandoc `--to` format identifier.
    pub fn pandoc_format(&self) -> &str {
        match self {
            ExportFormat::Pdf => "pdf",
            ExportFormat::Html => "html",
            ExportFormat::Word => "docx",
            ExportFormat::Latex => "latex",
            ExportFormat::Epub => "epub",
            ExportFormat::Rtf => "rtf",
        }
    }

    /// Returns the default file extension (without dot).
    pub fn default_extension(&self) -> &str {
        match self {
            ExportFormat::Pdf => "pdf",
            ExportFormat::Html => "html",
            ExportFormat::Word => "docx",
            ExportFormat::Latex => "tex",
            ExportFormat::Epub => "epub",
            ExportFormat::Rtf => "rtf",
        }
    }

    /// Returns all supported formats.
    #[allow(dead_code)]
    pub fn all() -> Vec<ExportFormat> {
        vec![
            ExportFormat::Pdf,
            ExportFormat::Html,
            ExportFormat::Word,
            ExportFormat::Latex,
            ExportFormat::Epub,
            ExportFormat::Rtf,
        ]
    }
}

/// Per-format export configuration with Pandoc argument templates.
/// Each field corresponds to a Pandoc option. `None` means "use Pandoc default".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportConfig {
    /// The export format this config applies to.
    pub format: ExportFormat,

    /// Pandoc input format string (e.g., "gfm+tex_math_dollars+raw_tex").
    pub from_format: String,

    /// Whether to produce a standalone document (--standalone).
    pub standalone: bool,

    /// PDF engine to use (--pdf-engine). Only relevant for PDF export.
    /// Common values: "xelatex", "pdflatex", "lualatex", "tectonic", "weasyprint".
    pub pdf_engine: Option<String>,

    /// Math rendering method for HTML output.
    /// Options: "mathjax", "katex", "mathml", "webtex", "gladtex".
    pub math_method: Option<String>,

    /// Path to a custom CSS file for HTML/EPUB output (--css).
    pub css_file: Option<String>,

    /// Path to a custom reference document for Word/EPUB/ODT output (--reference-doc).
    pub reference_doc: Option<String>,

    /// Path to a custom LaTeX template (--template).
    pub template: Option<String>,

    /// Custom header content to include (--include-in-header).
    /// For HTML: extra <head> content. For LaTeX/PDF: preamble additions.
    pub header_includes: Option<String>,

    /// Custom content to include before the document body (--include-before-body).
    pub before_body: Option<String>,

    /// Custom content to include after the document body (--include-after-body).
    pub after_body: Option<String>,

    /// Whether to generate a table of contents (--toc).
    pub table_of_contents: bool,

    /// TOC depth (--toc-depth). Default is 3.
    pub toc_depth: Option<u32>,

    /// Whether to number sections (--number-sections).
    pub number_sections: bool,

    /// Highlight style for code blocks (--highlight-style).
    /// Common values: "pygments", "kate", "monochrome", "espresso", "zenburn", "haddock", "tango".
    pub highlight_style: Option<String>,

    /// Document class for LaTeX/PDF (passed as --variable=documentclass:VALUE).
    pub document_class: Option<String>,

    /// Paper size for LaTeX/PDF (--variable=papersize:VALUE).
    pub paper_size: Option<String>,

    /// Geometry/margins for LaTeX/PDF (--variable=geometry:VALUE).
    pub geometry: Option<String>,

    /// Font family for LaTeX/PDF (--variable=mainfont:VALUE, requires xelatex/lualatex).
    pub main_font: Option<String>,

    /// Monospace font for LaTeX/PDF (--variable=monofont:VALUE).
    pub mono_font: Option<String>,

    /// Font size for LaTeX/PDF (--variable=fontsize:VALUE).
    pub font_size: Option<String>,

    /// Line spacing / line stretch for LaTeX/PDF (--variable=linestretch:VALUE).
    pub line_stretch: Option<String>,

    /// Additional raw Pandoc arguments to append (escape hatch for advanced users).
    pub extra_args: Vec<String>,

    /// EPUB metadata: cover image path (--epub-cover-image).
    pub epub_cover_image: Option<String>,

    /// EPUB chapter level (--epub-chapter-level).
    pub epub_chapter_level: Option<u32>,
}

impl ExportConfig {
    /// Returns sensible default configuration for a given export format.
    pub fn default_for(format: &ExportFormat) -> Self {
        match format {
            ExportFormat::Pdf => Self {
                format: ExportFormat::Pdf,
                from_format: "gfm+tex_math_dollars+raw_tex".to_string(),
                standalone: true,
                pdf_engine: Some("xelatex".to_string()),
                math_method: None,
                css_file: None,
                reference_doc: None,
                template: None,
                header_includes: None,
                before_body: None,
                after_body: None,
                table_of_contents: false,
                toc_depth: Some(3),
                number_sections: false,
                highlight_style: Some("tango".to_string()),
                document_class: Some("article".to_string()),
                paper_size: Some("a4".to_string()),
                geometry: Some("margin=1in".to_string()),
                main_font: None,
                mono_font: None,
                font_size: Some("11pt".to_string()),
                line_stretch: Some("1.2".to_string()),
                extra_args: vec![],
                epub_cover_image: None,
                epub_chapter_level: None,
            },
            ExportFormat::Html => Self {
                format: ExportFormat::Html,
                from_format: "gfm+tex_math_dollars+raw_tex".to_string(),
                standalone: true,
                pdf_engine: None,
                math_method: Some("mathjax".to_string()),
                css_file: None,
                reference_doc: None,
                template: None,
                header_includes: None,
                before_body: None,
                after_body: None,
                table_of_contents: false,
                toc_depth: Some(3),
                number_sections: false,
                highlight_style: Some("pygments".to_string()),
                document_class: None,
                paper_size: None,
                geometry: None,
                main_font: None,
                mono_font: None,
                font_size: None,
                line_stretch: None,
                extra_args: vec![],
                epub_cover_image: None,
                epub_chapter_level: None,
            },
            ExportFormat::Word => Self {
                format: ExportFormat::Word,
                from_format: "gfm+tex_math_dollars+raw_tex".to_string(),
                standalone: true,
                pdf_engine: None,
                math_method: None,
                css_file: None,
                reference_doc: None,
                template: None,
                header_includes: None,
                before_body: None,
                after_body: None,
                table_of_contents: false,
                toc_depth: Some(3),
                number_sections: false,
                highlight_style: Some("pygments".to_string()),
                document_class: None,
                paper_size: None,
                geometry: None,
                main_font: None,
                mono_font: None,
                font_size: None,
                line_stretch: None,
                extra_args: vec![],
                epub_cover_image: None,
                epub_chapter_level: None,
            },
            ExportFormat::Latex => Self {
                format: ExportFormat::Latex,
                from_format: "gfm+tex_math_dollars+raw_tex".to_string(),
                standalone: true,
                pdf_engine: None,
                math_method: None,
                css_file: None,
                reference_doc: None,
                template: None,
                header_includes: None,
                before_body: None,
                after_body: None,
                table_of_contents: false,
                toc_depth: Some(3),
                number_sections: false,
                highlight_style: Some("tango".to_string()),
                document_class: Some("article".to_string()),
                paper_size: Some("a4".to_string()),
                geometry: Some("margin=1in".to_string()),
                main_font: None,
                mono_font: None,
                font_size: Some("11pt".to_string()),
                line_stretch: Some("1.2".to_string()),
                extra_args: vec![],
                epub_cover_image: None,
                epub_chapter_level: None,
            },
            ExportFormat::Epub => Self {
                format: ExportFormat::Epub,
                from_format: "gfm+tex_math_dollars+raw_tex".to_string(),
                standalone: true,
                pdf_engine: None,
                math_method: Some("mathml".to_string()),
                css_file: None,
                reference_doc: None,
                template: None,
                header_includes: None,
                before_body: None,
                after_body: None,
                table_of_contents: true,
                toc_depth: Some(2),
                number_sections: false,
                highlight_style: Some("pygments".to_string()),
                document_class: None,
                paper_size: None,
                geometry: None,
                main_font: None,
                mono_font: None,
                font_size: None,
                line_stretch: None,
                extra_args: vec![],
                epub_cover_image: None,
                epub_chapter_level: Some(2),
            },
            ExportFormat::Rtf => Self {
                format: ExportFormat::Rtf,
                from_format: "gfm+tex_math_dollars+raw_tex".to_string(),
                standalone: true,
                pdf_engine: None,
                math_method: None,
                css_file: None,
                reference_doc: None,
                template: None,
                header_includes: None,
                before_body: None,
                after_body: None,
                table_of_contents: false,
                toc_depth: None,
                number_sections: false,
                highlight_style: None,
                document_class: None,
                paper_size: None,
                geometry: None,
                main_font: None,
                mono_font: None,
                font_size: None,
                line_stretch: None,
                extra_args: vec![],
                epub_cover_image: None,
                epub_chapter_level: None,
            },
        }
    }

    /// Build the Pandoc argument list from this configuration.
    /// Does NOT include the pandoc binary path, input source, or output path.
    pub fn build_pandoc_args(&self) -> Vec<String> {
        let mut args = Vec::new();

        // Input format
        args.push(format!("--from={}", self.from_format));

        // Output format / PDF engine
        match self.format {
            ExportFormat::Pdf => {
                // Pandoc infers PDF from output extension
                if let Some(ref engine) = self.pdf_engine {
                    args.push(format!("--pdf-engine={}", engine));
                }
            }
            _ => {
                args.push(format!("--to={}", self.format.pandoc_format()));
            }
        }

        // Standalone
        if self.standalone {
            args.push("--standalone".to_string());
        }

        // Math rendering (HTML, EPUB)
        if let Some(ref method) = self.math_method {
            match method.as_str() {
                "mathjax" => args.push("--mathjax".to_string()),
                "katex" => args.push("--katex".to_string()),
                "mathml" => args.push("--mathml".to_string()),
                "webtex" => args.push("--webtex".to_string()),
                "gladtex" => args.push("--gladtex".to_string()),
                _ => args.push("--mathjax".to_string()), // fallback
            }
        }

        // CSS (HTML/EPUB)
        if let Some(ref css) = self.css_file {
            args.push(format!("--css={}", css));
        }

        // Reference document (Word/EPUB)
        if let Some(ref refdoc) = self.reference_doc {
            args.push(format!("--reference-doc={}", refdoc));
        }

        // Custom template
        if let Some(ref tmpl) = self.template {
            args.push(format!("--template={}", tmpl));
        }

        // Header includes
        if let Some(ref header) = self.header_includes {
            args.push(format!("--include-in-header={}", header));
        }

        // Before body
        if let Some(ref before) = self.before_body {
            args.push(format!("--include-before-body={}", before));
        }

        // After body
        if let Some(ref after) = self.after_body {
            args.push(format!("--include-after-body={}", after));
        }

        // Table of contents
        if self.table_of_contents {
            args.push("--toc".to_string());
        }

        // TOC depth (only when TOC is enabled)
        if let Some(depth) = self.toc_depth {
            if self.table_of_contents {
                args.push(format!("--toc-depth={}", depth));
            }
        }

        // Number sections
        if self.number_sections {
            args.push("--number-sections".to_string());
        }

        // Highlight style
        if let Some(ref style) = self.highlight_style {
            args.push(format!("--highlight-style={}", style));
        }

        // LaTeX/PDF variables
        if let Some(ref dc) = self.document_class {
            args.push(format!("--variable=documentclass:{}", dc));
        }
        if let Some(ref ps) = self.paper_size {
            args.push(format!("--variable=papersize:{}", ps));
        }
        if let Some(ref geo) = self.geometry {
            args.push(format!("--variable=geometry:{}", geo));
        }
        if let Some(ref font) = self.main_font {
            args.push(format!("--variable=mainfont:{}", font));
        }
        if let Some(ref font) = self.mono_font {
            args.push(format!("--variable=monofont:{}", font));
        }
        if let Some(ref size) = self.font_size {
            args.push(format!("--variable=fontsize:{}", size));
        }
        if let Some(ref stretch) = self.line_stretch {
            args.push(format!("--variable=linestretch:{}", stretch));
        }

        // EPUB-specific
        if let Some(ref cover) = self.epub_cover_image {
            args.push(format!("--epub-cover-image={}", cover));
        }
        if let Some(level) = self.epub_chapter_level {
            args.push(format!("--epub-chapter-level={}", level));
        }

        // Extra args (escape hatch)
        for arg in &self.extra_args {
            args.push(arg.clone());
        }

        args
    }
}

/// Result of locating the Pandoc binary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PandocInfo {
    pub path: String,
    pub version: String,
}

/// Result of an export operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
    pub output_path: String,
    pub message: String,
}

/// Common Pandoc search locations on macOS.
const PANDOC_SEARCH_PATHS: &[&str] = &[
    "/usr/local/bin/pandoc",
    "/opt/homebrew/bin/pandoc",
    "/usr/bin/pandoc",
    "/opt/local/bin/pandoc",
];

/// Locate the Pandoc binary on the system.
/// First tries `which pandoc` (respects PATH), then falls back to known macOS locations.
fn find_pandoc_path() -> Option<String> {
    // Try `which pandoc` first (works if pandoc is on PATH)
    if let Ok(output) = Command::new("which").arg("pandoc").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && PathBuf::from(&path).exists() {
                return Some(path);
            }
        }
    }

    // Fall back to well-known macOS locations
    for path in PANDOC_SEARCH_PATHS {
        if PathBuf::from(path).exists() {
            return Some(path.to_string());
        }
    }

    None
}

/// Get the Pandoc version string from the binary at the given path.
fn get_pandoc_version(pandoc_path: &str) -> Option<String> {
    let output = Command::new(pandoc_path).arg("--version").output().ok()?;

    if output.status.success() {
        let version_output = String::from_utf8_lossy(&output.stdout);
        // First line is typically "pandoc X.Y.Z"
        version_output
            .lines()
            .next()
            .map(|line| line.trim().to_string())
    } else {
        None
    }
}

/// Build the extended PATH for macOS GUI apps (which have limited PATH by default).
fn extended_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    format!(
        "{}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/Library/TeX/texbin:/usr/local/texlive/2024/bin/universal-darwin",
        current
    )
}

/// Execute Pandoc with the given config, markdown input, and output path.
/// This is the core export function used by both the Tauri command and tests.
pub fn run_pandoc_export(
    pandoc_path: &str,
    config: &ExportConfig,
    markdown: &str,
    output_path: &str,
    title: Option<&str>,
    resource_path: Option<&str>,
) -> Result<ExportResult, String> {
    let mut cmd = Command::new(pandoc_path);

    // Add all config-derived arguments
    for arg in config.build_pandoc_args() {
        cmd.arg(&arg);
    }

    // Output file
    cmd.arg("-o").arg(output_path);

    // Document title metadata
    if let Some(t) = title {
        cmd.arg(format!("--metadata=title:{}", t));
    }

    // Resource path for resolving relative image paths
    if let Some(rp) = resource_path {
        cmd.arg(format!("--resource-path={}", rp));
    }

    // Pass markdown content via stdin
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Extend PATH for macOS GUI context
    cmd.env("PATH", extended_path());

    // Spawn the process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Pandoc: {}", e))?;

    // Write markdown to stdin
    if let Some(ref mut stdin) = child.stdin {
        use std::io::Write;
        stdin
            .write_all(markdown.as_bytes())
            .map_err(|e| format!("Failed to write to Pandoc stdin: {}", e))?;
    }
    // Drop stdin to signal EOF
    drop(child.stdin.take());

    // Wait for the process to complete
    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for Pandoc: {}", e))?;

    if output.status.success() {
        Ok(ExportResult {
            success: true,
            output_path: output_path.to_string(),
            message: format!("Successfully exported to {}", output_path),
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();

        let error_detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("Pandoc exited with status: {}", output.status)
        };

        Err(format!("Export failed: {}", error_detail))
    }
}

/// Tauri command: Check if Pandoc is installed and return its path and version.
/// Returns an error string if Pandoc is not found.
#[tauri::command]
pub fn check_pandoc() -> Result<PandocInfo, String> {
    let pandoc_path = find_pandoc_path().ok_or_else(|| {
        "Pandoc is not installed. Please install Pandoc from https://pandoc.org/installing.html to enable export functionality.".to_string()
    })?;

    let version = get_pandoc_version(&pandoc_path).unwrap_or_else(|| "unknown".to_string());

    Ok(PandocInfo {
        path: pandoc_path,
        version,
    })
}

/// Tauri command: Get supported export formats with their default file extensions.
#[tauri::command]
pub fn get_export_formats() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({ "id": "pdf", "label": "PDF", "extension": "pdf" }),
        serde_json::json!({ "id": "html", "label": "HTML", "extension": "html" }),
        serde_json::json!({ "id": "word", "label": "Word (.docx)", "extension": "docx" }),
        serde_json::json!({ "id": "latex", "label": "LaTeX", "extension": "tex" }),
        serde_json::json!({ "id": "epub", "label": "EPUB", "extension": "epub" }),
        serde_json::json!({ "id": "rtf", "label": "RTF", "extension": "rtf" }),
    ]
}

/// Tauri command: Get the default export configuration for a given format.
/// Frontend can use this to populate export settings UI.
#[tauri::command]
pub fn get_export_config(format: ExportFormat) -> ExportConfig {
    ExportConfig::default_for(&format)
}

/// Tauri command: Export markdown content to a specified format using Pandoc.
///
/// # Arguments
/// * `markdown` - The markdown content to export (passed via stdin to Pandoc)
/// * `output_path` - The destination file path for the exported document
/// * `format` - The export format (pdf, html, word, latex, epub, rtf)
/// * `title` - Optional document title for metadata
/// * `resource_path` - Optional base directory for resolving relative image/resource paths
/// * `config` - Optional export configuration; if None, uses sensible defaults for the format
#[tauri::command]
pub fn export_document(
    markdown: String,
    output_path: String,
    format: ExportFormat,
    title: Option<String>,
    resource_path: Option<String>,
    config: Option<ExportConfig>,
) -> Result<ExportResult, String> {
    // Locate Pandoc
    let pandoc_path = find_pandoc_path().ok_or_else(|| {
        "Pandoc is not installed. Please install Pandoc from https://pandoc.org/installing.html"
            .to_string()
    })?;

    // Use provided config or default for format
    let export_config = config.unwrap_or_else(|| ExportConfig::default_for(&format));

    run_pandoc_export(
        &pandoc_path,
        &export_config,
        &markdown,
        &output_path,
        title.as_deref(),
        resource_path.as_deref(),
    )
}

/// Tauri command: Open a native "Save As" dialog for export, with format-appropriate extension filter.
#[tauri::command]
pub fn export_save_dialog(
    app: tauri::AppHandle,
    format: ExportFormat,
    default_name: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let ext = format.default_extension();
    let label = match format {
        ExportFormat::Pdf => "PDF",
        ExportFormat::Html => "HTML",
        ExportFormat::Word => "Word Document",
        ExportFormat::Latex => "LaTeX",
        ExportFormat::Epub => "EPUB",
        ExportFormat::Rtf => "RTF",
    };

    let base_name = default_name.unwrap_or_else(|| "Untitled".to_string());
    // Replace .md extension with the target extension
    let file_name = if base_name.ends_with(".md") || base_name.ends_with(".markdown") {
        let stem = base_name
            .rsplit_once('.')
            .map(|(s, _)| s)
            .unwrap_or(&base_name);
        format!("{}.{}", stem, ext)
    } else {
        format!("{}.{}", base_name, ext)
    };

    let file = app
        .dialog()
        .file()
        .set_title(format!("Export as {}", label))
        .set_file_name(&file_name)
        .add_filter(label, &[ext])
        .add_filter("All Files", &["*"])
        .blocking_save_file();

    match file {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

// ─── Unit & Integration Tests ──────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // ─── Unit Tests ────────────────────────────────────────────────────

    #[test]
    fn test_export_format_pandoc_format() {
        assert_eq!(ExportFormat::Pdf.pandoc_format(), "pdf");
        assert_eq!(ExportFormat::Html.pandoc_format(), "html");
        assert_eq!(ExportFormat::Word.pandoc_format(), "docx");
        assert_eq!(ExportFormat::Latex.pandoc_format(), "latex");
        assert_eq!(ExportFormat::Epub.pandoc_format(), "epub");
        assert_eq!(ExportFormat::Rtf.pandoc_format(), "rtf");
    }

    #[test]
    fn test_export_format_default_extension() {
        assert_eq!(ExportFormat::Pdf.default_extension(), "pdf");
        assert_eq!(ExportFormat::Html.default_extension(), "html");
        assert_eq!(ExportFormat::Word.default_extension(), "docx");
        assert_eq!(ExportFormat::Latex.default_extension(), "tex");
        assert_eq!(ExportFormat::Epub.default_extension(), "epub");
        assert_eq!(ExportFormat::Rtf.default_extension(), "rtf");
    }

    #[test]
    fn test_export_format_all() {
        let all = ExportFormat::all();
        assert_eq!(all.len(), 6);
    }

    #[test]
    fn test_find_pandoc_path_returns_some_or_none() {
        let _result = find_pandoc_path();
    }

    #[test]
    fn test_get_export_formats_returns_all_formats() {
        let formats = get_export_formats();
        assert_eq!(formats.len(), 6);

        let ids: Vec<&str> = formats
            .iter()
            .filter_map(|f| f.get("id").and_then(|v| v.as_str()))
            .collect();
        assert!(ids.contains(&"pdf"));
        assert!(ids.contains(&"html"));
        assert!(ids.contains(&"word"));
        assert!(ids.contains(&"latex"));
        assert!(ids.contains(&"epub"));
        assert!(ids.contains(&"rtf"));
    }

    // ─── ExportConfig Unit Tests ───────────────────────────────────────

    #[test]
    fn test_default_config_pdf() {
        let config = ExportConfig::default_for(&ExportFormat::Pdf);
        assert_eq!(config.format, ExportFormat::Pdf);
        assert_eq!(config.pdf_engine, Some("xelatex".to_string()));
        assert!(config.standalone);
        assert_eq!(config.document_class, Some("article".to_string()));
        assert_eq!(config.paper_size, Some("a4".to_string()));
        assert_eq!(config.geometry, Some("margin=1in".to_string()));
        assert_eq!(config.font_size, Some("11pt".to_string()));
        assert_eq!(config.highlight_style, Some("tango".to_string()));
        assert!(config.math_method.is_none());
    }

    #[test]
    fn test_default_config_html() {
        let config = ExportConfig::default_for(&ExportFormat::Html);
        assert_eq!(config.format, ExportFormat::Html);
        assert!(config.standalone);
        assert_eq!(config.math_method, Some("mathjax".to_string()));
        assert_eq!(config.highlight_style, Some("pygments".to_string()));
        assert!(config.pdf_engine.is_none());
        assert!(config.document_class.is_none());
    }

    #[test]
    fn test_default_config_word() {
        let config = ExportConfig::default_for(&ExportFormat::Word);
        assert_eq!(config.format, ExportFormat::Word);
        assert!(config.standalone);
        assert!(config.reference_doc.is_none());
        assert_eq!(config.highlight_style, Some("pygments".to_string()));
    }

    #[test]
    fn test_default_config_latex() {
        let config = ExportConfig::default_for(&ExportFormat::Latex);
        assert_eq!(config.format, ExportFormat::Latex);
        assert!(config.standalone);
        assert_eq!(config.document_class, Some("article".to_string()));
        assert_eq!(config.paper_size, Some("a4".to_string()));
        assert_eq!(config.font_size, Some("11pt".to_string()));
    }

    #[test]
    fn test_default_config_epub() {
        let config = ExportConfig::default_for(&ExportFormat::Epub);
        assert_eq!(config.format, ExportFormat::Epub);
        assert!(config.table_of_contents);
        assert_eq!(config.toc_depth, Some(2));
        assert_eq!(config.math_method, Some("mathml".to_string()));
        assert_eq!(config.epub_chapter_level, Some(2));
    }

    #[test]
    fn test_default_config_rtf() {
        let config = ExportConfig::default_for(&ExportFormat::Rtf);
        assert_eq!(config.format, ExportFormat::Rtf);
        assert!(config.standalone);
        assert!(config.highlight_style.is_none());
        assert!(config.document_class.is_none());
    }

    // ─── build_pandoc_args Unit Tests ──────────────────────────────────

    #[test]
    fn test_build_args_pdf_defaults() {
        let config = ExportConfig::default_for(&ExportFormat::Pdf);
        let args = config.build_pandoc_args();

        assert!(args.contains(&"--from=gfm+tex_math_dollars+raw_tex".to_string()));
        assert!(args.contains(&"--pdf-engine=xelatex".to_string()));
        assert!(args.contains(&"--standalone".to_string()));
        assert!(args.contains(&"--highlight-style=tango".to_string()));
        assert!(args.contains(&"--variable=documentclass:article".to_string()));
        assert!(args.contains(&"--variable=papersize:a4".to_string()));
        assert!(args.contains(&"--variable=geometry:margin=1in".to_string()));
        assert!(args.contains(&"--variable=fontsize:11pt".to_string()));
        assert!(args.contains(&"--variable=linestretch:1.2".to_string()));
        // PDF should NOT have --to=pdf (Pandoc infers from extension)
        assert!(!args.iter().any(|a| a.starts_with("--to=")));
    }

    #[test]
    fn test_build_args_html_defaults() {
        let config = ExportConfig::default_for(&ExportFormat::Html);
        let args = config.build_pandoc_args();

        assert!(args.contains(&"--to=html".to_string()));
        assert!(args.contains(&"--standalone".to_string()));
        assert!(args.contains(&"--mathjax".to_string()));
        assert!(args.contains(&"--highlight-style=pygments".to_string()));
    }

    #[test]
    fn test_build_args_epub_defaults() {
        let config = ExportConfig::default_for(&ExportFormat::Epub);
        let args = config.build_pandoc_args();

        assert!(args.contains(&"--to=epub".to_string()));
        assert!(args.contains(&"--toc".to_string()));
        assert!(args.contains(&"--toc-depth=2".to_string()));
        assert!(args.contains(&"--mathml".to_string()));
        assert!(args.contains(&"--epub-chapter-level=2".to_string()));
    }

    #[test]
    fn test_build_args_with_toc_disabled_no_toc_depth() {
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.table_of_contents = false;
        config.toc_depth = Some(3);
        let args = config.build_pandoc_args();
        assert!(!args.contains(&"--toc".to_string()));
        assert!(!args.iter().any(|a| a.starts_with("--toc-depth=")));
    }

    #[test]
    fn test_build_args_with_custom_css() {
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.css_file = Some("/tmp/custom.css".to_string());
        let args = config.build_pandoc_args();
        assert!(args.contains(&"--css=/tmp/custom.css".to_string()));
    }

    #[test]
    fn test_build_args_with_reference_doc() {
        let mut config = ExportConfig::default_for(&ExportFormat::Word);
        config.reference_doc = Some("/tmp/template.docx".to_string());
        let args = config.build_pandoc_args();
        assert!(args.contains(&"--reference-doc=/tmp/template.docx".to_string()));
    }

    #[test]
    fn test_build_args_with_custom_template() {
        let mut config = ExportConfig::default_for(&ExportFormat::Latex);
        config.template = Some("/tmp/custom.tex".to_string());
        let args = config.build_pandoc_args();
        assert!(args.contains(&"--template=/tmp/custom.tex".to_string()));
    }

    #[test]
    fn test_build_args_with_header_includes() {
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.header_includes = Some("/tmp/header.html".to_string());
        let args = config.build_pandoc_args();
        assert!(args.contains(&"--include-in-header=/tmp/header.html".to_string()));
    }

    #[test]
    fn test_build_args_with_extra_args() {
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.extra_args = vec!["--wrap=none".to_string(), "--columns=80".to_string()];
        let args = config.build_pandoc_args();
        assert!(args.contains(&"--wrap=none".to_string()));
        assert!(args.contains(&"--columns=80".to_string()));
    }

    #[test]
    fn test_build_args_with_number_sections() {
        let mut config = ExportConfig::default_for(&ExportFormat::Pdf);
        config.number_sections = true;
        let args = config.build_pandoc_args();
        assert!(args.contains(&"--number-sections".to_string()));
    }

    #[test]
    fn test_build_args_katex_math_method() {
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.math_method = Some("katex".to_string());
        let args = config.build_pandoc_args();
        assert!(args.contains(&"--katex".to_string()));
        assert!(!args.contains(&"--mathjax".to_string()));
    }

    #[test]
    fn test_build_args_custom_fonts() {
        let mut config = ExportConfig::default_for(&ExportFormat::Pdf);
        config.main_font = Some("Helvetica".to_string());
        config.mono_font = Some("Menlo".to_string());
        let args = config.build_pandoc_args();
        assert!(args.contains(&"--variable=mainfont:Helvetica".to_string()));
        assert!(args.contains(&"--variable=monofont:Menlo".to_string()));
    }

    #[test]
    fn test_build_args_not_standalone() {
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.standalone = false;
        let args = config.build_pandoc_args();
        assert!(!args.contains(&"--standalone".to_string()));
    }

    #[test]
    fn test_config_serialization_roundtrip() {
        let config = ExportConfig::default_for(&ExportFormat::Pdf);
        let json = serde_json::to_string(&config).expect("serialize");
        let deserialized: ExportConfig = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.format, ExportFormat::Pdf);
        assert_eq!(deserialized.pdf_engine, Some("xelatex".to_string()));
        assert_eq!(deserialized.paper_size, Some("a4".to_string()));
    }

    #[test]
    fn test_config_from_json_with_overrides() {
        let json = r#"{
            "format": "html",
            "from_format": "gfm",
            "standalone": true,
            "pdf_engine": null,
            "math_method": "katex",
            "css_file": "/tmp/style.css",
            "reference_doc": null,
            "template": null,
            "header_includes": null,
            "before_body": null,
            "after_body": null,
            "table_of_contents": true,
            "toc_depth": 2,
            "number_sections": true,
            "highlight_style": "zenburn",
            "document_class": null,
            "paper_size": null,
            "geometry": null,
            "main_font": null,
            "mono_font": null,
            "font_size": null,
            "line_stretch": null,
            "extra_args": ["--wrap=none"],
            "epub_cover_image": null,
            "epub_chapter_level": null
        }"#;
        let config: ExportConfig = serde_json::from_str(json).expect("parse");
        assert_eq!(config.format, ExportFormat::Html);
        assert_eq!(config.math_method, Some("katex".to_string()));
        assert_eq!(config.css_file, Some("/tmp/style.css".to_string()));
        assert!(config.table_of_contents);
        assert!(config.number_sections);
        assert_eq!(config.highlight_style, Some("zenburn".to_string()));

        let args = config.build_pandoc_args();
        assert!(args.contains(&"--katex".to_string()));
        assert!(args.contains(&"--css=/tmp/style.css".to_string()));
        assert!(args.contains(&"--toc".to_string()));
        assert!(args.contains(&"--toc-depth=2".to_string()));
        assert!(args.contains(&"--number-sections".to_string()));
        assert!(args.contains(&"--wrap=none".to_string()));
    }

    // ─── Integration Tests (require Pandoc installed) ──────────────────

    /// Helper: return pandoc path or skip test gracefully.
    fn pandoc_or_skip() -> Option<String> {
        find_pandoc_path()
    }

    /// Sample markdown with various elements for testing exports.
    fn sample_markdown() -> &'static str {
        r#"---
title: Test Document
author: gdown
---

# Heading 1

This is a **bold** and *italic* paragraph with `inline code`.

## Heading 2

- Item one
- Item two
- Item three

### Code Block

```rust
fn main() {
    println!("Hello, world!");
}
```

### Math

Inline math: $E = mc^2$

Display math:

$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$

### Table

| Column A | Column B | Column C |
|----------|----------|----------|
| 1        | 2        | 3        |
| 4        | 5        | 6        |

### Blockquote

> This is a blockquote with **emphasis**.

### Links

[Example Link](https://example.com)

That's the end of the test document.
"#
    }

    #[test]
    fn test_integration_export_html() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output.html");
        let config = ExportConfig::default_for(&ExportFormat::Html);

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            sample_markdown(),
            output.to_str().unwrap(),
            Some("Test Document"),
            None,
        );

        assert!(result.is_ok(), "HTML export failed: {:?}", result.err());
        let result = result.unwrap();
        assert!(result.success);
        assert!(output.exists(), "HTML output file not created");

        let content = fs::read_to_string(&output).expect("read html");
        assert!(content.contains("<html"), "Missing <html tag");
        assert!(content.contains("Heading 1"), "Missing heading content");
        assert!(
            content.contains("<strong>bold</strong>"),
            "Missing bold formatting"
        );
        assert!(content.contains("<code"), "Missing code element");
        // MathJax is included as a script reference in standalone HTML
        assert!(
            content.to_lowercase().contains("mathjax") || content.contains("math"),
            "Missing MathJax reference"
        );
    }

    #[test]
    fn test_integration_export_html_with_katex() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_katex.html");
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.math_method = Some("katex".to_string());

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            sample_markdown(),
            output.to_str().unwrap(),
            Some("KaTeX Test"),
            None,
        );

        assert!(
            result.is_ok(),
            "HTML+KaTeX export failed: {:?}",
            result.err()
        );
        assert!(output.exists());
        let content = fs::read_to_string(&output).expect("read html");
        assert!(
            content.to_lowercase().contains("katex"),
            "Missing KaTeX references"
        );
    }

    #[test]
    fn test_integration_export_html_with_toc() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_toc.html");
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.table_of_contents = true;
        config.toc_depth = Some(2);

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            sample_markdown(),
            output.to_str().unwrap(),
            Some("TOC Test"),
            None,
        );

        assert!(result.is_ok(), "HTML+TOC export failed: {:?}", result.err());
        assert!(output.exists());
        let content = fs::read_to_string(&output).expect("read html");
        assert!(
            content.contains("TOC")
                || content.to_lowercase().contains("toc")
                || content.contains("table-of-contents"),
            "Missing table of contents"
        );
    }

    #[test]
    fn test_integration_export_html_with_custom_css() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_css.html");
        let css_path = dir.path().join("custom.css");
        fs::write(&css_path, "body { font-family: sans-serif; color: #333; }").expect("write css");

        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.css_file = Some(css_path.to_str().unwrap().to_string());

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            sample_markdown(),
            output.to_str().unwrap(),
            None,
            None,
        );

        assert!(result.is_ok(), "HTML+CSS export failed: {:?}", result.err());
        assert!(output.exists());
        let content = fs::read_to_string(&output).expect("read html");
        assert!(
            content.contains("font-family: sans-serif") || content.contains("custom.css"),
            "Custom CSS not included in output"
        );
    }

    #[test]
    fn test_integration_export_html_not_standalone() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_fragment.html");
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.standalone = false;

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            "# Hello\n\nWorld",
            output.to_str().unwrap(),
            None,
            None,
        );

        assert!(
            result.is_ok(),
            "HTML fragment export failed: {:?}",
            result.err()
        );
        assert!(output.exists());
        let content = fs::read_to_string(&output).expect("read html");
        assert!(
            !content.contains("<!DOCTYPE"),
            "Fragment should not have DOCTYPE"
        );
    }

    #[test]
    fn test_integration_export_latex() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output.tex");
        let config = ExportConfig::default_for(&ExportFormat::Latex);

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            sample_markdown(),
            output.to_str().unwrap(),
            Some("LaTeX Test"),
            None,
        );

        assert!(result.is_ok(), "LaTeX export failed: {:?}", result.err());
        assert!(output.exists(), "LaTeX output file not created");

        let content = fs::read_to_string(&output).expect("read tex");
        assert!(
            content.contains("\\documentclass"),
            "Missing \\documentclass"
        );
        assert!(
            content.contains("article"),
            "Missing article document class"
        );
        assert!(
            content.contains(r"\begin{document}"),
            "Missing begin document"
        );
        assert!(content.contains("Heading 1"), "Missing heading content");
    }

    #[test]
    fn test_integration_export_latex_with_custom_class() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_report.tex");
        let mut config = ExportConfig::default_for(&ExportFormat::Latex);
        config.document_class = Some("report".to_string());
        config.number_sections = true;

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            sample_markdown(),
            output.to_str().unwrap(),
            Some("Report Test"),
            None,
        );

        assert!(
            result.is_ok(),
            "LaTeX report export failed: {:?}",
            result.err()
        );
        let content = fs::read_to_string(&output).expect("read tex");
        assert!(content.contains("report"), "Missing report document class");
    }

    #[test]
    fn test_integration_export_word() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output.docx");
        let config = ExportConfig::default_for(&ExportFormat::Word);

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            sample_markdown(),
            output.to_str().unwrap(),
            Some("Word Test"),
            None,
        );

        assert!(result.is_ok(), "Word export failed: {:?}", result.err());
        assert!(output.exists(), "Word output file not created");
        // DOCX is a zip file; verify it starts with PK signature
        let bytes = fs::read(&output).expect("read docx bytes");
        assert!(bytes.len() > 100, "DOCX file too small");
        assert_eq!(&bytes[0..2], b"PK", "DOCX should be a ZIP (PK signature)");
    }

    #[test]
    fn test_integration_export_epub() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output.epub");
        let config = ExportConfig::default_for(&ExportFormat::Epub);

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            sample_markdown(),
            output.to_str().unwrap(),
            Some("EPUB Test"),
            None,
        );

        assert!(result.is_ok(), "EPUB export failed: {:?}", result.err());
        assert!(output.exists(), "EPUB output file not created");
        let bytes = fs::read(&output).expect("read epub bytes");
        assert!(bytes.len() > 100, "EPUB file too small");
        assert_eq!(&bytes[0..2], b"PK", "EPUB should be a ZIP (PK signature)");
    }

    #[test]
    fn test_integration_export_rtf() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output.rtf");
        let config = ExportConfig::default_for(&ExportFormat::Rtf);

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            sample_markdown(),
            output.to_str().unwrap(),
            Some("RTF Test"),
            None,
        );

        assert!(result.is_ok(), "RTF export failed: {:?}", result.err());
        assert!(output.exists(), "RTF output file not created");
        let content = fs::read_to_string(&output).expect("read rtf");
        assert!(
            content.starts_with("{\\rtf"),
            "RTF file should start with {{\\rtf"
        );
    }

    #[test]
    fn test_integration_export_html_with_header_includes() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_header.html");

        let header_path = dir.path().join("header.html");
        fs::write(
            &header_path,
            "<meta name=\"generator\" content=\"gdown\">\n<style>h1 { color: blue; }</style>",
        )
        .expect("write header");

        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.header_includes = Some(header_path.to_str().unwrap().to_string());

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            "# Hello\n\nWorld",
            output.to_str().unwrap(),
            None,
            None,
        );

        assert!(
            result.is_ok(),
            "HTML+header export failed: {:?}",
            result.err()
        );
        let content = fs::read_to_string(&output).expect("read html");
        assert!(content.contains("gdown"), "Header include content missing");
        assert!(content.contains("color: blue"), "Header style missing");
    }

    #[test]
    fn test_integration_export_html_with_before_after_body() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_before_after.html");

        let before_path = dir.path().join("before.html");
        fs::write(&before_path, "<div class=\"banner\">Welcome to gdown</div>")
            .expect("write before");

        let after_path = dir.path().join("after.html");
        fs::write(&after_path, "<footer>Generated by gdown</footer>").expect("write after");

        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.before_body = Some(before_path.to_str().unwrap().to_string());
        config.after_body = Some(after_path.to_str().unwrap().to_string());

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            "# Content\n\nBody text here.",
            output.to_str().unwrap(),
            None,
            None,
        );

        assert!(
            result.is_ok(),
            "HTML+before/after export failed: {:?}",
            result.err()
        );
        let content = fs::read_to_string(&output).expect("read html");
        assert!(
            content.contains("Welcome to gdown"),
            "Before-body content missing"
        );
        assert!(
            content.contains("Generated by gdown"),
            "After-body content missing"
        );
    }

    #[test]
    fn test_integration_export_latex_with_geometry() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_geo.tex");
        let mut config = ExportConfig::default_for(&ExportFormat::Latex);
        config.geometry = Some("margin=2cm".to_string());
        config.paper_size = Some("letter".to_string());
        config.font_size = Some("12pt".to_string());

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            "# Test\n\nParagraph.",
            output.to_str().unwrap(),
            None,
            None,
        );

        assert!(
            result.is_ok(),
            "LaTeX+geometry export failed: {:?}",
            result.err()
        );
        let content = fs::read_to_string(&output).expect("read tex");
        assert!(content.contains("12pt"), "Font size not applied");
        assert!(
            content.contains("letter") || content.contains("geometry"),
            "Paper/geometry not applied"
        );
    }

    #[test]
    fn test_integration_export_with_extra_args() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_extra.html");
        let mut config = ExportConfig::default_for(&ExportFormat::Html);
        config.extra_args = vec!["--wrap=none".to_string()];

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            "# Test\n\nA short paragraph.",
            output.to_str().unwrap(),
            None,
            None,
        );

        assert!(
            result.is_ok(),
            "HTML+extra_args export failed: {:?}",
            result.err()
        );
        assert!(output.exists());
    }

    #[test]
    fn test_integration_export_with_resource_path() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("output_res.html");
        let config = ExportConfig::default_for(&ExportFormat::Html);

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            "# Test\n\n![Alt text](nonexistent.png)",
            output.to_str().unwrap(),
            None,
            Some(dir.path().to_str().unwrap()),
        );

        assert!(
            result.is_ok(),
            "HTML+resource_path export failed: {:?}",
            result.err()
        );
        assert!(output.exists());
    }

    #[test]
    fn test_integration_all_formats_default_config() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");

        // Test each format with its default config (skip PDF as it requires LaTeX)
        let formats_to_test = vec![
            (ExportFormat::Html, "test.html"),
            (ExportFormat::Latex, "test.tex"),
            (ExportFormat::Word, "test.docx"),
            (ExportFormat::Epub, "test.epub"),
            (ExportFormat::Rtf, "test.rtf"),
        ];

        for (format, filename) in formats_to_test {
            let output = dir.path().join(filename);
            let config = ExportConfig::default_for(&format);

            let result = run_pandoc_export(
                &pandoc_path,
                &config,
                sample_markdown(),
                output.to_str().unwrap(),
                Some("Multi-format Test"),
                None,
            );

            assert!(
                result.is_ok(),
                "{:?} export with default config failed: {:?}",
                format,
                result.err()
            );
            assert!(
                output.exists(),
                "{} not created for {:?} format",
                filename,
                format
            );
            let metadata = fs::metadata(&output).expect("file metadata");
            assert!(
                metadata.len() > 0,
                "{} is empty for {:?} format",
                filename,
                format
            );
        }
    }

    #[test]
    fn test_integration_empty_markdown() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("empty.html");
        let config = ExportConfig::default_for(&ExportFormat::Html);

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            "",
            output.to_str().unwrap(),
            None,
            None,
        );

        assert!(
            result.is_ok(),
            "Empty markdown export failed: {:?}",
            result.err()
        );
        assert!(output.exists());
    }

    #[test]
    fn test_integration_unicode_content() {
        let pandoc_path = match pandoc_or_skip() {
            Some(p) => p,
            None => {
                eprintln!("SKIP: pandoc not found");
                return;
            }
        };
        let dir = tempfile::tempdir().expect("create temp dir");
        let output = dir.path().join("unicode.html");
        let config = ExportConfig::default_for(&ExportFormat::Html);

        let unicode_md = "# \u{3053}\u{3093}\u{306b}\u{3061}\u{306f}\u{4e16}\u{754c}\n\nEmoji: \u{1f389}\u{1f680}\n\nChinese: \u{4e2d}\u{6587}\u{6d4b}\u{8bd5}\n\nArabic: \u{645}\u{631}\u{62d}\u{628}\u{627}";

        let result = run_pandoc_export(
            &pandoc_path,
            &config,
            unicode_md,
            output.to_str().unwrap(),
            Some("Unicode Test"),
            None,
        );

        assert!(result.is_ok(), "Unicode export failed: {:?}", result.err());
        let content = fs::read_to_string(&output).expect("read html");
        assert!(
            content.contains("\u{3053}\u{3093}\u{306b}\u{3061}\u{306f}\u{4e16}\u{754c}"),
            "Japanese text missing"
        );
        assert!(content.contains("\u{1f389}"), "Emoji missing");
        assert!(
            content.contains("\u{4e2d}\u{6587}\u{6d4b}\u{8bd5}"),
            "Chinese text missing"
        );
    }
}
