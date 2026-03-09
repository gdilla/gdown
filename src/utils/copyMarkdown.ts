/**
 * Reassemble a full markdown document from separate body and front-matter parts.
 * Leaf stores these separately in tab state — this reconstructs the original file format.
 */
export function assembleFullMarkdown(body: string, frontmatter: string | null): string {
  if (!frontmatter) return body
  return `---\n${frontmatter}\n---\n\n${body}`
}
