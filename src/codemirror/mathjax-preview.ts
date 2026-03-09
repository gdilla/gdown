/**
 * MathJax rendering utilities for source mode preview.
 * Uses MathJax v3 (mathjax-full) to render LaTeX math expressions to SVG.
 *
 * MathJax is loaded lazily on the first render call so it does not block
 * the initial app bundle parse/execute.
 */

/* ------------------------------------------------------------------ */
/*  Lazy singleton                                                     */
/* ------------------------------------------------------------------ */

interface MathJaxPreviewState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adaptor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mathjaxDocument: any;
}

let _state: MathJaxPreviewState | null = null;
let _statePromise: Promise<MathJaxPreviewState> | null = null;

async function getState(): Promise<MathJaxPreviewState> {
  if (_state) return _state;
  if (_statePromise) return _statePromise;

  _statePromise = (async () => {
    const [
      { mathjax },
      { TeX },
      { SVG },
      { liteAdaptor },
      { RegisterHTMLHandler },
      { AllPackages },
    ] = await Promise.all([
      import('mathjax-full/js/mathjax'),
      import('mathjax-full/js/input/tex'),
      import('mathjax-full/js/output/svg'),
      import('mathjax-full/js/adaptors/liteAdaptor'),
      import('mathjax-full/js/handlers/html'),
      import('mathjax-full/js/input/tex/AllPackages'),
    ]);

    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);

    const tex = new TeX({
      packages: AllPackages,
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']],
    });

    const svg = new SVG({ fontCache: 'local' });

    const mathjaxDocument = mathjax.document('', {
      InputJax: tex,
      OutputJax: svg,
    });

    _state = { adaptor, mathjaxDocument };
    return _state;
  })();

  return _statePromise;
}

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

const renderCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Render a LaTeX math expression to an SVG string.
 * @param expression - The LaTeX expression (without delimiters)
 * @param isBlock - Whether to render as display math
 * @returns Promise resolving to an SVG HTML string
 */
export async function renderMathToSvg(expression: string, isBlock: boolean): Promise<string> {
  const cacheKey = `${isBlock ? 'D' : 'I'}:${expression}`;

  if (renderCache.has(cacheKey)) {
    return renderCache.get(cacheKey)!;
  }

  try {
    const { adaptor, mathjaxDocument } = await getState();
    const node = mathjaxDocument.convert(expression, { display: isBlock });
    const svgHtml = adaptor.outerHTML(node);

    // Manage cache size (LRU-lite: evict oldest entry)
    if (renderCache.size >= MAX_CACHE_SIZE) {
      const firstKey = renderCache.keys().next().value;
      if (firstKey !== undefined) {
        renderCache.delete(firstKey);
      }
    }
    renderCache.set(cacheKey, svgHtml);
    return svgHtml;
  } catch (err) {
    console.warn('MathJax render error:', err);
    return `<span class="math-error" title="Math rendering error">${escapeHtml(expression)}</span>`;
  }
}

/**
 * Render a LaTeX math expression and return an HTML string with proper wrapping.
 */
export async function renderMathHtml(expression: string, isBlock: boolean): Promise<string> {
  const svgHtml = await renderMathToSvg(expression, isBlock);
  const wrapperClass = isBlock ? 'math-rendered math-display' : 'math-rendered math-inline';
  return `<span class="${wrapperClass}">${svgHtml}</span>`;
}

/**
 * Clear the render cache (useful when changing settings).
 */
export function clearMathCache(): void {
  renderCache.clear();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
