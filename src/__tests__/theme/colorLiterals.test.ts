import { describe, it, expect } from 'vitest'

/**
 * Theme guard: chrome colours must come from the CSS custom properties in
 * src/style.css so every theme (light, dark, solarized-light, solarized-dark,
 * github; `auto` resolves to light/dark) can restyle them.
 *
 * Scanned: every `<style>` block in src/**\/*.vue, every src/**\/*.css file,
 * and the CodeMirror theme objects listed in THEME_OBJECT_FILES.
 * Not flagged: `var(--x, #fallback)` fallbacks, comments, custom-property
 * definitions in src/style.css, and pure-black `rgba(0, 0, 0, a)` shadows
 * (box-shadow) and scrims (rules whose selector names an overlay/backdrop),
 * which darken correctly on every theme.
 */

// Vitest blanks `.css` imports (even `?raw`), so read sources from disk. Node's fs is
// reached through process.getBuiltinModule to keep @types/node out of the app program.
interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string
  readdirSync(path: string, options: { recursive: true }): string[]
}
const fs = (
  globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): Fs } }
).process.getBuiltinModule('node:fs')

function readSources(ext: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rel of fs.readdirSync('src', { recursive: true })) {
    if (rel.endsWith(ext) && !rel.startsWith('__tests__')) {
      out[`/src/${rel}`] = fs.readFileSync(`src/${rel}`, 'utf8')
    }
  }
  return out
}

const vueFiles = readSources('.vue')
const cssFiles = readSources('.css')

/** CodeMirror `EditorView.theme({...})` objects, scanned in full (script included). */
const THEME_OBJECT_FILES = [
  '/src/codemirror/frontmatter-highlight.ts',
  '/src/components/source/SourceEditor.vue',
]

interface AllowEntry {
  file: string
  /** Only declarations inside rules whose selector matches; omitted = whole file. */
  selector?: RegExp
  reason: string
}

const ALLOWLIST: AllowEntry[] = [
  {
    file: '/src/components/preferences/AppearancePane.vue',
    selector: /\.preview-/,
    reason:
      'Theme picker swatches deliberately show each theme’s own palette (content, not chrome).',
  },
  {
    file: '/src/components/sidebar/FileTreeNode.vue',
    selector: /\.icon-/,
    reason: 'File-type icon colours (language brand colours), identical on every theme.',
  },
  {
    file: '/src/components/RecentFiles.vue',
    selector: /\.(file|folder)-icon/,
    reason: 'File/folder icon badge tints, identical on every theme.',
  },
  {
    file: '/src/components/ExportDialog.vue',
    selector: /\.install-command|\.copy-hint/,
    reason: 'Install-command snippet is a fixed dark terminal block on every theme.',
  },
  {
    file: '/src/components/Editor.vue',
    selector: /\.mode-indicator-overlay/,
    reason: 'Mode-switch HUD is a fixed dark translucent overlay on every theme.',
  },
  {
    file: '/src/components/preferences/PreferencesWindow.vue',
    selector: /\.prefs-close-btn:hover/,
    reason: 'macOS traffic-light close red (#ff5f57) is platform-fixed.',
  },
  {
    file: '/src/components/MermaidNodeView.vue',
    reason: 'Owned by a parallel change; migrate to the block/syntax tokens in a follow-up.',
  },
  {
    file: '/src/components/HelloWorld.vue',
    reason: 'Unused Vite scaffold component (not imported anywhere).',
  },
  {
    file: '/src/assets/main.css',
    reason: 'Unused Vite scaffold stylesheet (not imported anywhere).',
  },
  // Pending migration — each later commit on this branch removes its files.
  ...[
    '/src/App.vue',
    '/src/components/ExportDialog.vue',
    '/src/components/ExportToast.vue',
    '/src/components/InsertLinkDialog.vue',
    '/src/components/ConflictDialog.vue',
    '/src/components/preferences/PreferencesWindow.vue',
    '/src/components/preferences/AppearancePane.vue',
    '/src/components/StatusBar.vue',
    '/src/components/FindReplace.vue',
    '/src/components/LinkTooltip.vue',
    '/src/components/sidebar/Sidebar.vue',
    '/src/components/sidebar/OutlinePanel.vue',
    '/src/components/RecentFiles.vue',
    '/src/components/SaveNotification.vue',
    '/src/components/source/SourceEditor.vue',
    '/src/codemirror/frontmatter-highlight.ts',
  ].map((file) => ({ file, reason: 'pending migration' })),
]

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(\s*[\d.][^)]*\)|\b(?:white|black)\b/g
const PURE_BLACK = /^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*[\d.]+\s*\)$/
const VAR_FALLBACK = /var\(\s*--[\w-]+\s*,(?:[^()]|\([^()]*\))*\)/g

export interface Finding {
  file: string
  line: number
  text: string
}

/** Blank out comments but keep newlines so line numbers stay correct. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
}

function literalsIn(value: string): string[] {
  return value.replace(VAR_FALLBACK, '').match(COLOR_LITERAL) ?? []
}

/** Scan CSS text (a style block or .css file) declaration by declaration. */
export function scanCss(file: string, css: string, lineOffset = 0): Finding[] {
  const findings: Finding[] = []
  const selectors: string[] = []
  let buf = ''
  let line = 1 + lineOffset
  let declLine = line

  const flush = () => {
    const decl = buf.trim()
    buf = ''
    if (!decl) return
    const colon = decl.indexOf(':')
    const prop = colon === -1 ? '' : decl.slice(0, colon).trim()
    if (file === '/src/style.css' && prop.startsWith('--')) return
    const selector = selectors[selectors.length - 1] ?? ''
    const neutral = prop === 'box-shadow' || /overlay|backdrop/.test(selector)
    const bad = literalsIn(decl.slice(colon + 1)).filter(
      (lit) => !(neutral && PURE_BLACK.test(lit)),
    )
    if (bad.length === 0) return
    const allowed = ALLOWLIST.some(
      (a) => a.file === file && (!a.selector || a.selector.test(selector)),
    )
    if (!allowed) findings.push({ file, line: declLine, text: `${selector} { ${decl} }` })
  }

  for (const ch of stripComments(css)) {
    if (ch === '{') {
      selectors.push(buf.trim())
      buf = ''
    } else if (ch === '}') {
      flush()
      selectors.pop()
    } else if (ch === ';') {
      flush()
    } else {
      if (!buf.trim()) declLine = line
      buf += ch
    }
    if (ch === '\n') line++
  }
  return findings
}

/** Scan JS/TS line by line (CodeMirror theme objects); for .vue, only the <script> block. */
function scanScript(file: string): Finding[] {
  if (ALLOWLIST.some((a) => a.file === file && !a.selector)) return []
  const src = fs.readFileSync(file.slice(1), 'utf8')
  const script = file.endsWith('.vue') ? /<script[^>]*>[\s\S]*?<\/script>/.exec(src) : null
  const first = script ? lineOf(src, script.index) : 1
  const last = script ? lineOf(src, script.index + script[0].length) : lineOf(src, src.length)
  const lines = src.split('\n')
  const findings: Finding[] = []
  for (let i = first - 1; i < last; i++) {
    if (literalsIn(lines[i]!).length > 0)
      findings.push({ file, line: i + 1, text: lines[i]!.trim() })
  }
  return findings
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length
}

export function scanAll(): Finding[] {
  const findings: Finding[] = []
  for (const [file, src] of Object.entries(vueFiles)) {
    for (const m of src.matchAll(/(<style[^>]*>)([\s\S]*?)<\/style>/g)) {
      findings.push(...scanCss(file, m[2]!, lineOf(src, m.index! + m[1]!.length) - 1))
    }
  }
  for (const [file, src] of Object.entries(cssFiles)) findings.push(...scanCss(file, src))
  for (const file of THEME_OBJECT_FILES) findings.push(...scanScript(file))
  return findings
}

/** Map of theme selector -> custom properties it defines, parsed from src/style.css. */
function themeBlocks(): Map<string, Map<string, string>> {
  const css = stripComments(cssFiles['/src/style.css'] ?? '')
  const blocks = new Map<string, Map<string, string>>()
  for (const m of css.matchAll(/(:root|\[data-theme="[\w-]+"\])\s*\{([^}]*)\}/g)) {
    const props = blocks.get(m[1]!) ?? new Map<string, string>()
    for (const d of m[2]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) props.set(d[1]!, d[2]!.trim())
    blocks.set(m[1]!, props)
  }
  return blocks
}

describe('theme colour guard', () => {
  it('finds no hard-coded colour literals outside the allowlist', () => {
    const report = scanAll().map((f) => `${f.file}:${f.line}  ${f.text}`)
    expect(report, 'Use a CSS custom property from src/style.css instead').toEqual([])
  })

  it('every allowlist entry still matches a real file', () => {
    const files = new Set([
      ...Object.keys(vueFiles),
      ...Object.keys(cssFiles),
      ...THEME_OBJECT_FILES,
    ])
    expect(ALLOWLIST.filter((a) => !files.has(a.file)).map((a) => a.file)).toEqual([])
  })

  it('flags literals but ignores fallbacks, comments and black shadows', () => {
    const css = [
      '.a { color: #4183c4; }',
      '.b { color: var(--x, #fff); /* #000 */ }',
      '.c { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }',
      '.d-overlay { background: rgba(0, 0, 0, 0.3); }',
      '.e { background: rgba(var(--ink-rgb), 0.06); border: 1px solid white; }',
    ].join('\n')
    expect(scanCss('/src/x.css', css).map((f) => f.line)).toEqual([1, 5])
  })

  it('every colour token in :root has a value in every theme block', () => {
    const blocks = themeBlocks()
    const root = blocks.get(':root')!
    // Theme-invariant by design: white text on accent fills, and a black drop shadow.
    const invariant = new Set(['--accent-text', '--tab-menu-shadow'])
    const colourTokens = [...root.entries()]
      .filter(
        ([name, value]) =>
          !invariant.has(name) && !value.startsWith('var(') && literalsIn(value).length > 0,
      )
      .map(([name]) => name)
    const themes = ['dark', 'solarized-light', 'solarized-dark', 'github']
    const missing = themes.flatMap((t) => {
      const props = blocks.get(`[data-theme="${t}"]`) ?? new Map<string, string>()
      return colourTokens.filter((n) => !props.has(n)).map((n) => `${t}: ${n}`)
    })
    expect(missing).toEqual([])
  })
})
