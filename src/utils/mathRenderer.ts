/**
 * MathJax 3 rendering utility for gdown.
 *
 * Provides functions to convert LaTeX math strings into HTML that can be
 * embedded in the WYSIWYG editor or preview pane.  Uses MathJax's
 * server-side (non-DOM) rendering pipeline so it works synchronously
 * and without injecting anything into the page until we explicitly
 * insert the resulting HTML.
 */

import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { CHTML } from 'mathjax-full/js/output/chtml.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

/* ------------------------------------------------------------------ */
/*  Singleton adaptor & document                                      */
/* ------------------------------------------------------------------ */

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

/** TeX input processor – supports AMSmath, color, etc. */
const tex = new TeX({ packages: AllPackages });

/** SVG output – lightweight, no font CSS needed */
const svg = new SVG({ fontCache: 'local' });

/** CHTML output – alternative if DOM rendering preferred */
const chtml = new CHTML({ fontURL: '' });

const svgDocument = mathjax.document('', { InputJax: tex, OutputJax: svg });
const chtmlDocument = mathjax.document('', { InputJax: tex, OutputJax: chtml });

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export type MathOutputFormat = 'svg' | 'chtml';

export interface MathRenderOptions {
  /** Whether the expression is display-mode (block) or inline */
  display?: boolean;
  /** Output format – defaults to 'svg' */
  format?: MathOutputFormat;
  /** Extra CSS class(es) to add to the wrapper element */
  className?: string;
}

/**
 * Render a LaTeX math string to an HTML string.
 *
 * @param latex  – The LaTeX source, e.g. `"E = mc^2"`
 * @param opts   – Rendering options
 * @returns An HTML string containing the rendered math (SVG or CHTML)
 *
 * @example
 * ```ts
 * import { renderMath } from '@/utils/mathRenderer';
 *
 * // Inline math
 * const html = renderMath('E = mc^2');
 *
 * // Display-mode (block) math
 * const block = renderMath('\\int_0^\\infty e^{-x} dx = 1', { display: true });
 * ```
 */
export function renderMath(latex: string, opts: MathRenderOptions = {}): string {
  const { display = false, format = 'svg', className } = opts;

  try {
    const doc = format === 'svg' ? svgDocument : chtmlDocument;
    const node = doc.convert(latex, { display });
    let html = adaptor.outerHTML(node);

    // Optionally wrap with a class for styling hooks
    if (className) {
      html = `<span class="${className}">${html}</span>`;
    }

    return html;
  } catch (err) {
    console.error('[gdown:mathRenderer] Failed to render LaTeX:', latex, err);
    // Return a fallback that shows the raw LaTeX so the user can fix it
    const escaped = latex
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const mode = display ? 'math-error-block' : 'math-error-inline';
    return `<span class="math-render-error ${mode}" title="Math render error">${escaped}</span>`;
  }
}

/**
 * Render inline math (`$...$`).
 * Convenience wrapper around {@link renderMath}.
 */
export function renderInlineMath(latex: string): string {
  return renderMath(latex, { display: false, className: 'math-inline' });
}

/**
 * Render display/block math (`$$...$$`).
 * Convenience wrapper around {@link renderMath}.
 */
export function renderBlockMath(latex: string): string {
  return renderMath(latex, { display: true, className: 'math-block' });
}

/**
 * Get the CSS stylesheet string required by the CHTML output.
 * Only needed if using `format: 'chtml'`.  For SVG output this
 * returns an empty string.
 */
export function getMathStylesheet(format: MathOutputFormat = 'svg'): string {
  if (format === 'chtml') {
    return adaptor.textContent(chtml.styleSheet(chtmlDocument) as any);
  }
  return '';
}

/**
 * Check whether MathJax is properly initialised.
 * Useful for a health-check at app startup.
 */
export function isMathJaxReady(): boolean {
  try {
    const result = renderMath('x', { display: false, format: 'svg' });
    return result.includes('<svg') || result.includes('<mjx-container');
  } catch {
    return false;
  }
}
