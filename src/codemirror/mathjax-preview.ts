/**
 * MathJax rendering utilities for source mode preview.
 * Uses MathJax v3 (mathjax-full) to render LaTeX math expressions to SVG.
 */
import { mathjax } from 'mathjax-full/js/mathjax'
import { TeX } from 'mathjax-full/js/input/tex'
import { SVG } from 'mathjax-full/js/output/svg'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages'

// Initialize MathJax once
const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

const tex = new TeX({
  packages: AllPackages,
  inlineMath: [['$', '$'], ['\\(', '\\)']],
  displayMath: [['$$', '$$'], ['\\[', '\\]']],
})

const svg = new SVG({
  fontCache: 'local',
})

const mathjaxDocument = mathjax.document('', {
  InputJax: tex,
  OutputJax: svg,
})

// Cache rendered expressions for performance
const renderCache = new Map<string, string>()
const MAX_CACHE_SIZE = 500

/**
 * Render a LaTeX math expression to an SVG string.
 * @param expression - The LaTeX expression (without delimiters)
 * @param isBlock - Whether to render as display math
 * @returns SVG HTML string
 */
export function renderMathToSvg(expression: string, isBlock: boolean): string {
  const cacheKey = `${isBlock ? 'D' : 'I'}:${expression}`

  if (renderCache.has(cacheKey)) {
    return renderCache.get(cacheKey)!
  }

  try {
    const node = mathjaxDocument.convert(expression, {
      display: isBlock,
    })
    const svgHtml = adaptor.outerHTML(node)

    // Manage cache size
    if (renderCache.size >= MAX_CACHE_SIZE) {
      const firstKey = renderCache.keys().next().value
      if (firstKey !== undefined) {
        renderCache.delete(firstKey)
      }
    }
    renderCache.set(cacheKey, svgHtml)
    return svgHtml
  } catch (err) {
    console.warn('MathJax render error:', err)
    return `<span class="math-error" title="Math rendering error">${escapeHtml(expression)}</span>`
  }
}

/**
 * Render a LaTeX math expression and return an HTML string with proper wrapping.
 */
export function renderMathHtml(expression: string, isBlock: boolean): string {
  const svg = renderMathToSvg(expression, isBlock)
  const wrapperClass = isBlock ? 'math-rendered math-display' : 'math-rendered math-inline'
  return `<span class="${wrapperClass}">${svg}</span>`
}

/**
 * Clear the render cache (useful when changing settings).
 */
export function clearMathCache(): void {
  renderCache.clear()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
