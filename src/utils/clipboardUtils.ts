/**
 * Clipboard utilities for copying content as rich text (HTML) or plain text.
 * Rich text copy writes both text/html and text/plain MIME types so that
 * paste targets (Google Docs, Slack, etc.) can pick the best format.
 */

export async function copyAsRichText(html: string, plainText: string): Promise<void> {
  const htmlBlob = new Blob([html], { type: 'text/html' })
  const textBlob = new Blob([plainText], { type: 'text/plain' })
  await navigator.clipboard.write([
    new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
  ])
}

export async function copyAsPlainText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
