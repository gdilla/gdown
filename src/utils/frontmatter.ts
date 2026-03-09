/**
 * YAML Front-Matter Parsing and Serialization
 *
 * Detects, parses, and reconstructs YAML front-matter delimited by `---`
 * markers at the very start of Markdown files.
 *
 * Front-matter format:
 * ```
 * ---
 * title: My Document
 * date: 2024-01-01
 * tags: [a, b, c]
 * ---
 *
 * Body content here...
 * ```
 *
 * This module does NOT depend on a YAML library — it preserves raw YAML
 * as a string to avoid lossy round-trips. Structured access is provided
 * via a lightweight key-value parser for simple scalar fields.
 */

export interface FrontMatterResult {
  /** Raw YAML string between the --- delimiters (without delimiters) */
  rawYaml: string
  /** Parsed key-value pairs (simple scalars only; nested structures are raw strings) */
  attributes: Record<string, string>
  /** The markdown body content after the closing --- delimiter */
  body: string
  /** Whether front-matter was detected */
  hasFrontMatter: boolean
}

/**
 * Regex to detect YAML front-matter at the start of a string.
 *
 * - Must start at the very beginning of the string (^)
 * - Opening delimiter: `---` followed by optional whitespace and newline
 * - Content: captured non-greedily (can be empty)
 * - Closing delimiter: `---` followed by optional whitespace and newline (or EOF)
 *
 * Uses the `s` (dotAll) flag so `.` matches newlines inside the lazy capture.
 */
const FRONT_MATTER_REGEX = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Parse YAML front-matter from a raw file content string.
 *
 * If the content does not start with `---`, returns the entire
 * content as `body` with `hasFrontMatter: false`.
 *
 * @param content - The full file content (including front-matter if present)
 * @returns Parsed front-matter result with raw YAML, attributes, and body
 */
export function parseFrontMatter(content: string): FrontMatterResult {
  if (!content || !content.startsWith('---')) {
    return {
      rawYaml: '',
      attributes: {},
      body: content || '',
      hasFrontMatter: false,
    }
  }

  const match = FRONT_MATTER_REGEX.exec(content)

  if (!match) {
    // Starts with --- but no valid closing delimiter found
    return {
      rawYaml: '',
      attributes: {},
      body: content,
      hasFrontMatter: false,
    }
  }

  const rawYaml = match[1] ?? ''
  const body = content.slice(match[0].length)
  const attributes = parseSimpleYaml(rawYaml)

  return {
    rawYaml,
    attributes,
    body,
    hasFrontMatter: true,
  }
}

/**
 * Reassemble full file content from front-matter and body.
 *
 * If `rawYaml` is empty or null, returns just the body (no front-matter block).
 * Ensures consistent formatting: `---\n<yaml>\n---\n<body>`.
 *
 * @param rawYaml - The raw YAML content (without delimiters), or empty/null
 * @param body - The markdown body content
 * @returns The complete file content string
 */
export function assembleFrontMatter(rawYaml: string | null | undefined, body: string): string {
  if (!rawYaml || rawYaml.trim() === '') {
    return body
  }

  // Ensure the YAML doesn't have trailing newline before we add delimiter
  const trimmedYaml = rawYaml.replace(/\n+$/, '')

  // Ensure body starts without leading newline (we add exactly one)
  const trimmedBody = body.replace(/^\n/, '')

  return `---\n${trimmedYaml}\n---\n${trimmedBody}`
}

/**
 * Check if a string contains YAML front-matter.
 *
 * A quick check without full parsing — useful for UI indicators.
 *
 * @param content - The file content to check
 * @returns true if front-matter delimiters are detected
 */
export function hasFrontMatter(content: string): boolean {
  if (!content || !content.startsWith('---')) return false
  return FRONT_MATTER_REGEX.test(content)
}

/**
 * Lightweight YAML key-value parser for simple scalar fields.
 *
 * Handles:
 * - `key: value` (string scalars)
 * - `key: "quoted value"` and `key: 'quoted value'`
 * - `key: 123` (numbers as strings)
 * - `key: true/false` (booleans as strings)
 * - `key:` (empty value → empty string)
 *
 * Does NOT handle:
 * - Nested objects (multi-line)
 * - Block scalars (| or >)
 * - Anchors/aliases
 * - Flow sequences/mappings inline (stored as raw string)
 *
 * For complex YAML, consumers should use the `rawYaml` field directly.
 *
 * @param yaml - Raw YAML content (without delimiters)
 * @returns Key-value map of simple scalar fields
 */
function parseSimpleYaml(yaml: string): Record<string, string> {
  const result: Record<string, string> = {}

  if (!yaml) return result

  const lines = yaml.split('\n')

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Skip lines that start with whitespace (continuation/nested)
    if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) continue

    // Match key: value pattern
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex <= 0) continue

    const key = trimmed.slice(0, colonIndex).trim()
    let value = trimmed.slice(colonIndex + 1).trim()

    // Remove surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

/**
 * Extract the document title from front-matter attributes.
 *
 * Checks common title fields: `title`, `Title`, `TITLE`.
 *
 * @param attributes - Parsed front-matter attributes
 * @returns The title string, or null if not found
 */
export function extractTitle(attributes: Record<string, string>): string | null {
  return attributes['title'] || attributes['Title'] || attributes['TITLE'] || null
}
