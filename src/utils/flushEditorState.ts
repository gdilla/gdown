/** Ask the mounted editor to synchronously publish its current rich snapshot. */
export function flushLiveEditorState(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('gdown:capture-state'))
  }
}
