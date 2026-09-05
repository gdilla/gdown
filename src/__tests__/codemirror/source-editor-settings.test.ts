import { afterEach, describe, expect, it } from 'vitest'
import { Compartment, EditorState } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { buildSourceEditorSettings } from '../../codemirror/source-editor-settings'

describe('source editor settings', () => {
  let view: EditorView | null = null

  afterEach(() => {
    view?.destroy()
    view = null
  })

  it('configures live CodeMirror behavior and reconfigures without replacing the document', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const settingsCompartment = new Compartment()

    view = new EditorView({
      state: EditorState.create({
        doc: '  text\t',
        extensions: [
          settingsCompartment.of(
            buildSourceEditorSettings({
              showLineNumbers: true,
              showWhitespace: true,
              indentSize: 2,
              softTabs: true,
              spellCheck: true,
            }),
          ),
          history(),
        ],
      }),
      parent,
    })

    const originalState = view.state
    expect(view.state.facet(EditorState.tabSize)).toBe(2)
    expect(view.state.facet(indentUnit)).toBe('  ')
    expect(view.contentDOM.getAttribute('spellcheck')).toBe('true')
    expect(view.dom.querySelector('.cm-gutters')).not.toBeNull()
    expect(view.dom.querySelector('.cm-highlightSpace')).not.toBeNull()
    expect(view.dom.querySelector('.cm-highlightTab')).not.toBeNull()

    view.dispatch({ changes: { from: 0, insert: 'X' } })
    expect(view.state.doc.toString()).toBe('X  text\t')

    view.dispatch({
      effects: settingsCompartment.reconfigure(
        buildSourceEditorSettings({
          showLineNumbers: false,
          showWhitespace: false,
          indentSize: 8,
          softTabs: false,
          spellCheck: false,
        }),
      ),
    })

    expect(view.state).not.toBe(originalState)
    expect(view.state.doc.toString()).toBe('X  text\t')
    expect(view.state.facet(EditorState.tabSize)).toBe(8)
    expect(view.state.facet(indentUnit)).toBe('\t')
    expect(view.contentDOM.getAttribute('spellcheck')).toBe('false')
    expect(view.dom.querySelector('.cm-gutters')).toBeNull()
    expect(view.dom.querySelector('.cm-highlightSpace')).toBeNull()
    expect(view.dom.querySelector('.cm-highlightTab')).toBeNull()

    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('  text\t')

    parent.remove()
  })
})
