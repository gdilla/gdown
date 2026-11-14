/**
 * Export service — wraps Tauri commands for Pandoc-based document export.
 */

import { invoke } from '@tauri-apps/api/core'
import type { ExportConfig, ExportFormat } from '../types/export'

/**
 * Get the default export configuration for a specific format.
 * Returns sensible defaults (LaTeX engine, math method, highlight style, etc.).
 */
export async function getExportConfig(format: ExportFormat): Promise<ExportConfig> {
  return invoke<ExportConfig>('get_export_config', { format })
}
