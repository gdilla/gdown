import { describe, expect, it } from 'vitest'
import { renderMathToSvg } from '../../codemirror/mathjax-preview'

// The source-mode math preview inserts this output with v-html, so any link it
// contains is a live anchor in the app webview.
async function render(tex: string): Promise<HTMLElement> {
  const host = document.createElement('div')
  host.innerHTML = await renderMathToSvg(tex, false)
  return host
}

/** href/xlink:href values that leave the document (glyph `<use href="#…">` refs are fine). */
function externalLinks(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('*')).flatMap((el) =>
    Array.from(el.attributes)
      .filter((a) => a.localName === 'href' && !a.value.startsWith('#'))
      .map((a) => a.value),
  )
}

describe('renderMathToSvg (source-mode math preview)', () => {
  it('still renders ordinary math', async () => {
    const host = await render('x^2 + y^2')
    expect(host.querySelector('svg')).not.toBeNull()
  })

  it('drops javascript: links from \\href', async () => {
    const host = await render('\\href{javascript:window.__leafPwned=1}{click}')
    expect(host.querySelector('svg')).not.toBeNull()
    expect(externalLinks(host)).toEqual([])
  })

  it('drops http(s) links too, so a click cannot navigate the app webview', async () => {
    const host = await render('\\href{https://attacker.example/x}{click}')
    expect(host.querySelector('svg')).not.toBeNull()
    expect(externalLinks(host)).toEqual([])
  })

  it('drops \\style url() so the preview cannot fetch remote resources', async () => {
    const host = await render('\\style{background-image:url(https://attacker.example/t)}{x}')
    expect(host.innerHTML).not.toContain('attacker.example')
  })

  // SafeHandler's defaults also clamp sizes (fontSize to [0.707, 1.44]em); the
  // preview should only filter injection, so TeX size commands keep their scale.
  function scales(host: HTMLElement): number[] {
    return Array.from(host.innerHTML.matchAll(/scale\(([\d.]+)\)/g), (m) => Number(m[1]))
  }

  it('keeps \\Huge and \\tiny at their real size', async () => {
    expect(Math.max(...scales(await render('\\Huge x')))).toBeGreaterThan(2)
    expect(Math.min(...scales(await render('\\tiny x')))).toBeLessThan(0.6)
  })
})
