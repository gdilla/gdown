import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import {
  extractMathExpressions,
  findMathRanges,
  mathHighlightPlugin,
} from '../../codemirror/math-language'
import { frontmatterHighlightPlugin } from '../../codemirror/frontmatter-highlight'

describe('math language scanning', () => {
  it('finds each supported math delimiter once', () => {
    const text = 'inline $x + 1$ and \\(y\\) then $$z^2$$ and \\[w\\]'
    const expressions = extractMathExpressions(text)

    expect(expressions.map(({ expression, isBlock }) => ({ expression, isBlock }))).toEqual([
      { expression: 'x + 1', isBlock: false },
      { expression: 'y', isBlock: false },
      { expression: 'z^2', isBlock: true },
      { expression: 'w', isBlock: true },
    ])
  })

  it('handles large and dense math input', () => {
    const largeExpression = '$$' + 'x'.repeat(100_000) + '$$'
    const denseExpressions = Array.from({ length: 1_000 }, (_, index) => `$x${index}$`).join(' ')

    expect(findMathRanges(largeExpression)).toHaveLength(1)
    expect(findMathRanges(denseExpressions)).toHaveLength(1_000)
  })

  it('does not rebuild decorations for viewport-only updates', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state: EditorState.create({
        doc: 'A formula $x + 1$',
        extensions: [mathHighlightPlugin],
      }),
      parent,
    })
    const plugin = view.plugin(mathHighlightPlugin)
    expect(plugin).not.toBeNull()
    if (!plugin) throw new Error('math highlight plugin was not installed')
    const decorations = plugin.decorations

    plugin.update({ docChanged: false, viewportChanged: true, view } as ViewUpdate)

    expect(plugin.decorations).toBe(decorations)
    view.destroy()
    parent.remove()
  })

  it('does not rebuild front-matter decorations for viewport-only updates', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state: EditorState.create({
        doc: '---\ntitle: Test\n---\nBody',
        extensions: [frontmatterHighlightPlugin],
      }),
      parent,
    })
    const plugin = view.plugin(frontmatterHighlightPlugin)
    expect(plugin).not.toBeNull()
    if (!plugin) throw new Error('front-matter highlight plugin was not installed')
    const decorations = plugin.decorations

    plugin.update({ docChanged: false, viewportChanged: true, view } as ViewUpdate)

    expect(plugin.decorations).toBe(decorations)
    view.destroy()
    parent.remove()
  })
})
