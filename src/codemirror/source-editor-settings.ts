import { EditorState, type Extension } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import {
  EditorView,
  highlightActiveLineGutter,
  highlightWhitespace,
  lineNumbers,
} from '@codemirror/view'

export interface SourceEditorSettings {
  showLineNumbers: boolean
  showWhitespace: boolean
  indentSize: number
  softTabs: boolean
  spellCheck: boolean
}

/**
 * Build the settings extension used by the source editor.
 *
 * This stays separate from the document extensions so a live source editor
 * can reconfigure preferences through a Compartment without recreating its
 * EditorView (and losing history or selection).
 */
export function buildSourceEditorSettings(settings: SourceEditorSettings): Extension[] {
  const extensions: Extension[] = [
    EditorState.tabSize.of(settings.indentSize),
    indentUnit.of(settings.softTabs ? ' '.repeat(settings.indentSize) : '\t'),
    EditorView.contentAttributes.of({ spellcheck: String(settings.spellCheck) }),
  ]

  if (settings.showLineNumbers) {
    extensions.push(lineNumbers(), highlightActiveLineGutter())
  }
  if (settings.showWhitespace) {
    extensions.push(highlightWhitespace())
  }

  return extensions
}
