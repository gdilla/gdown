/**
 * Mermaid's 'strict' security level DOMPurifies HTML labels with DOMPurify's
 * default allow-list, which keeps form controls and image maps. A diagram never
 * needs them, and a form submit or <area> click would navigate the app webview,
 * so drop them.
 */
export function stripInteractiveElements(svg: string): string {
  const template = document.createElement('template')
  template.innerHTML = svg
  template.content
    .querySelectorAll('form, input, button, select, textarea, map, area')
    .forEach((el) => el.remove())
  return template.innerHTML
}
