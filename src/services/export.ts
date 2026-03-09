/**
 * Export service — wraps Tauri commands for Pandoc-based document export.
 * Provides format configuration, Pandoc detection, and export execution.
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  ExportConfig,
  ExportFormat,
  ExportFormatInfo,
  ExportResult,
  PandocInfo,
} from '../types/export'

/**
 * Check if Pandoc is installed and return its path and version.
 * Throws if Pandoc is not found.
 */
export async function checkPandoc(): Promise<PandocInfo> {
  return invoke<PandocInfo>('check_pandoc')
}

/**
 * Get all supported export formats with labels and file extensions.
 */
export async function getExportFormats(): Promise<ExportFormatInfo[]> {
  return invoke<ExportFormatInfo[]>('get_export_formats')
}

/**
 * Get the default export configuration for a specific format.
 * Returns sensible defaults (LaTeX engine, math method, highlight style, etc.).
 */
export async function getExportConfig(format: ExportFormat): Promise<ExportConfig> {
  return invoke<ExportConfig>('get_export_config', { format })
}

/**
 * Open a native "Save As" dialog for export with format-appropriate filters.
 * Returns the selected file path, or null if the user cancels.
 */
export async function exportSaveDialog(
  format: ExportFormat,
  defaultName?: string,
): Promise<string | null> {
  return invoke<string | null>('export_save_dialog', {
    format,
    defaultName: defaultName ?? null,
  })
}

/**
 * Export markdown content to a file using Pandoc.
 *
 * @param markdown - Raw markdown content to export
 * @param outputPath - Destination file path
 * @param format - Target export format
 * @param title - Optional document title for metadata
 * @param resourcePath - Optional base directory for resolving relative image paths
 * @param config - Optional export configuration; uses format defaults if omitted
 */
export async function exportDocument(
  markdown: string,
  outputPath: string,
  format: ExportFormat,
  title?: string,
  resourcePath?: string,
  config?: ExportConfig,
): Promise<ExportResult> {
  return invoke<ExportResult>('export_document', {
    markdown,
    outputPath,
    format,
    title: title ?? null,
    resourcePath: resourcePath ?? null,
    config: config ?? null,
  })
}
