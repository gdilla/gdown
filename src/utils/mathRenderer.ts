/**
 * MathJax 3 rendering utility for gdown.
 *
 * Provides functions to convert LaTeX math strings into HTML that can be
 * embedded in the WYSIWYG editor or preview pane.  Uses MathJax's
 * server-side (non-DOM) rendering pipeline so it works synchronously
 * and without injecting anything into the page until we explicitly
 * insert the resulting HTML.
 *
 * MathJax is loaded lazily on the first render call to avoid bloating
 * the initial bundle. KaTeX (small, ~300 KB) may be loaded eagerly
 * elsewhere — only MathJax is deferred here.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MathOutputFormat = 'svg' | 'chtml'

export interface MathRenderOptions {
  /** Whether the expression is display-mode (block) or inline */
  display?: boolean
  /** Output format – defaults to 'svg' */
  format?: MathOutputFormat
  /** Extra CSS class(es) to add to the wrapper element */
  className?: string
}

/* ------------------------------------------------------------------ */
/*  Lazy singleton                                                     */
/* ------------------------------------------------------------------ */

interface MathJaxState {
  adaptor: any
  svgDocument: any
  chtmlDocument: any
  chtml: any
}

let _state: MathJaxState | null = null
let _statePromise: Promise<MathJaxState> | null = null

async function getState(): Promise<MathJaxState> {
  if (_state) return _state
  if (_statePromise) return _statePromise

  _statePromise = (async () => {
    const [
      { mathjax },
      { TeX },
      { SVG },
      { CHTML },
      { liteAdaptor },
      { RegisterHTMLHandler },
      { AllPackages },
    ] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/output/chtml.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
    ])

    const adaptor = liteAdaptor()
    RegisterHTMLHandler(adaptor)

    const tex = new TeX({ packages: AllPackages })
    const svg = new SVG({ fontCache: 'local' })
    const chtml = new CHTML({ fontURL: '' })

    const svgDocument = mathjax.document('', { InputJax: tex, OutputJax: svg })
    const chtmlDocument = mathjax.document('', { InputJax: tex, OutputJax: chtml })

    _state = { adaptor, svgDocument, chtmlDocument, chtml }
    return _state
  })()

  return _statePromise
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Render a LaTeX math string to an HTML string.
 *
 * @param latex  – The LaTeX source, e.g. `"E = mc^2"`
 * @param opts   – Rendering options
 * @returns A Promise resolving to an HTML string containing the rendered math
 *
 * @example
 * ```ts
 * import { renderMath } from '@/utils/mathRenderer';
 *
 * // Inline math
 * const html = await renderMath('E = mc^2');
 *
 * // Display-mode (block) math
 * const block = await renderMath('\\int_0^\\infty e^{-x} dx = 1', { display: true });
 * ```
 */
export async function renderMath(latex: string, opts: MathRenderOptions = {}): Promise<string> {
  const { display = false, format = 'svg', className } = opts

  try {
    const { adaptor, svgDocument, chtmlDocument } = await getState()
    const doc = format === 'svg' ? svgDocument : chtmlDocument
    const node = doc.convert(latex, { display })
    let html = adaptor.outerHTML(node)

    if (className) {
      html = `<span class="${className}">${html}</span>`
    }

    return html
  } catch (err) {
    console.error('[mathRenderer] Failed to render LaTeX:', latex, err)
    const escaped = latex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const mode = display ? 'math-error-block' : 'math-error-inline'
    return `<span class="math-render-error ${mode}" title="Math render error">${escaped}</span>`
  }
}

/**
 * Render inline math (`$...$`).
 * Convenience wrapper around {@link renderMath}.
 */
export function renderInlineMath(latex: string): Promise<string> {
  return renderMath(latex, { display: false, className: 'math-inline' })
}

/**
 * Render display/block math (`$$...$$`).
 * Convenience wrapper around {@link renderMath}.
 */
export function renderBlockMath(latex: string): Promise<string> {
  return renderMath(latex, { display: true, className: 'math-block' })
}

/**
 * Get the CSS stylesheet string required by the CHTML output.
 * Only needed if using `format: 'chtml'`. For SVG output this returns ''.
 */
export async function getMathStylesheet(format: MathOutputFormat = 'svg'): Promise<string> {
  if (format === 'chtml') {
    const { adaptor, chtml, chtmlDocument } = await getState()
    return adaptor.textContent(chtml.styleSheet(chtmlDocument) as any)
  }
  return ''
}

/**
 * Check whether MathJax is properly initialised.
 * Useful for a health-check at app startup.
 */
export async function isMathJaxReady(): Promise<boolean> {
  try {
    const result = await renderMath('x', { display: false, format: 'svg' })
    return result.includes('<svg') || result.includes('<mjx-container')
  } catch {
    return false
  }
}
