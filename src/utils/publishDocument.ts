/**
 * Document Publishing Pipeline
 *
 * Utilities for exporting the current document as standalone HTML,
 * copying rich text to the clipboard, and triggering print/PDF export.
 */

import { invoke } from '@tauri-apps/api/core'
import katex from 'katex'

/** Escape a string for safe embedding in HTML attribute/content contexts. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Pre-render math (KaTeX) and mermaid (lazy) in a detached DOM, return clean HTML.
 *
 * Finds `[data-type="math-inline"]` and `[data-type="math-block"]` nodes and
 * renders them with KaTeX. Finds mermaid code blocks and renders with a lazy
 * `import('mermaid')`.
 */
export async function buildRenderedBody(rawHtml: string): Promise<string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml, 'text/html')

  // Render math-inline nodes
  const mathInlines = doc.querySelectorAll('[data-type="math-inline"]')
  for (const el of mathInlines) {
    const latex = el.getAttribute('data-latex') || el.textContent || ''
    if (latex.trim()) {
      try {
        const rendered = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: false,
          output: 'html',
        })
        el.innerHTML = rendered
        el.classList.add('katex-rendered')
      } catch {
        // Leave original content on error
      }
    }
  }

  // Render math-block nodes
  const mathBlocks = doc.querySelectorAll('[data-type="math-block"]')
  for (const el of mathBlocks) {
    const latex = el.getAttribute('data-latex') || el.textContent || ''
    if (latex.trim()) {
      try {
        const rendered = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
        })
        el.innerHTML = rendered
        el.classList.add('katex-rendered')
      } catch {
        // Leave original content on error
      }
    }
  }

  // Render mermaid diagrams (lazy-loaded)
  const mermaidBlocks = doc.querySelectorAll('pre.mermaid, [data-type="mermaid"]')
  if (mermaidBlocks.length > 0) {
    try {
      const { default: mermaid } = await import('mermaid')
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      })

      let counter = 0
      for (const el of mermaidBlocks) {
        const code = el.textContent || ''
        if (code.trim()) {
          try {
            counter++
            const id = `publish-mermaid-${Date.now()}-${counter}`
            const { svg } = await mermaid.render(id, code.trim())
            el.innerHTML = svg
            el.classList.add('mermaid-rendered')
          } catch {
            // Leave original code on error
          }
        }
      }
    } catch {
      // Mermaid not available — leave code blocks as-is
    }
  }

  return doc.body.innerHTML
}

/**
 * Collect current theme CSS vars + editor rules from live stylesheets.
 *
 * Reads computed CSS custom property values from `document.documentElement`
 * and extracts `.gdown-editor` rules from active stylesheets.
 */
export function collectThemeCss(): string {
  const computed = getComputedStyle(document.documentElement)

  // Collect CSS custom properties from the root element
  const cssVars: string[] = []
  const varNames = [
    '--bg-primary',
    '--text-primary',
    '--tab-bar-bg',
    '--tab-bar-border',
    '--sidebar-bg',
    '--sidebar-border',
  ]
  for (const name of varNames) {
    const value = computed.getPropertyValue(name).trim()
    if (value) {
      cssVars.push(`  ${name}: ${value};`)
    }
  }

  // Extract .gdown-editor rules from stylesheets
  const editorRules: string[] = []
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const ruleText = rule.cssText
          if (
            ruleText.includes('.gdown-editor') ||
            ruleText.includes('.content') ||
            ruleText.includes('.math-') ||
            ruleText.includes('.katex') ||
            ruleText.includes('.mermaid')
          ) {
            editorRules.push(ruleText)
          }
        }
      } catch {
        // Cross-origin stylesheets throw SecurityError — skip
      }
    }
  } catch {
    // Stylesheet access may fail in some environments
  }

  const rootVarsBlock = cssVars.length > 0 ? `:root {\n${cssVars.join('\n')}\n}` : ''

  const parts = [rootVarsBlock, ...editorRules].filter(Boolean)

  // Always include base editor styles as fallback
  const baseStyles = `
.gdown-editor.content {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-primary, #333);
  background-color: var(--bg-primary, #fff);
}
.gdown-editor.content h1 { font-size: 2em; margin: 0.67em 0; }
.gdown-editor.content h2 { font-size: 1.5em; margin: 0.75em 0; }
.gdown-editor.content h3 { font-size: 1.17em; margin: 0.83em 0; }
.gdown-editor.content p { margin: 1em 0; }
.gdown-editor.content pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
.gdown-editor.content code { font-family: 'SF Mono', Menlo, monospace; font-size: 0.9em; }
.gdown-editor.content blockquote { border-left: 4px solid #dfe2e5; padding-left: 16px; color: #6a737d; margin: 1em 0; }
.gdown-editor.content img { max-width: 100%; }
.gdown-editor.content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
.gdown-editor.content th, .gdown-editor.content td { border: 1px solid #dfe2e5; padding: 8px 12px; }
.gdown-editor.content th { background: #f6f8fa; font-weight: 600; }
.math-inline { display: inline-block; vertical-align: middle; }
.math-block { display: block; text-align: center; margin: 1em 0; overflow-x: auto; }
`

  return parts.join('\n') + '\n' + baseStyles
}

/**
 * Assemble a complete standalone HTML document.
 *
 * Templates a full `<!DOCTYPE html>` with embedded CSS, title, and body
 * wrapped in a `.gdown-editor.content` div.
 */
export function buildStandaloneHtml(bodyHtml: string, css: string, title: string): string {
  const safeTitle = escapeHtml(title)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
${css}
  </style>
</head>
<body>
  <div class="gdown-editor content">
${bodyHtml}
  </div>
</body>
</html>`
}

/**
 * Full HTML export: build rendered body, collect CSS, save dialog, write file.
 */
export async function exportToHtml(
  rawHtml: string,
  title: string,
  defaultFileName: string,
): Promise<string> {
  const renderedBody = await buildRenderedBody(rawHtml)
  const css = collectThemeCss()
  const html = buildStandaloneHtml(renderedBody, css, title)

  // Show save dialog with HTML filter
  const path = await invoke<string | null>('save_file_dialog', {
    defaultName: defaultFileName,
    format: 'html',
  })

  if (!path) {
    throw new Error('Export cancelled by user')
  }

  // Write the file
  await invoke('write_file', { path, content: html })

  return path
}

/**
 * Put text/html on clipboard for rich paste into Slack/Notion/Docs.
 */
export async function copyAsRichText(rawHtml: string, title: string): Promise<void> {
  const renderedBody = await buildRenderedBody(rawHtml)
  const css = collectThemeCss()
  const html = buildStandaloneHtml(renderedBody, css, title)

  const blob = new Blob([html], { type: 'text/html' })
  const item = new ClipboardItem({ 'text/html': blob })
  await navigator.clipboard.write([item])
}

/**
 * Trigger native macOS print sheet (user picks Save as PDF).
 * Tauri 2 on macOS maps window.print() to the native print dialog.
 */
export function triggerPrint(): void {
  window.print()
}
