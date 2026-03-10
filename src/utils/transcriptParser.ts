/**
 * Parser for Claude Code session transcript files (.jsonl).
 *
 * Converts JSONL transcript data into structured conversation messages
 * with tool call pairing, file extraction, and summary statistics.
 */

// ─── Public types ──────────────────────────────────────────────────────

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  result: string | null
  isError: boolean
}

export interface ConversationMessage {
  id: string
  role: 'human' | 'assistant'
  textContent: string
  toolCalls: ToolCall[]
  timestamp: Date | null
}

export interface TranscriptSummary {
  messageCount: number
  toolCallCount: number
  filesReferenced: string[]
  sessionId: string | null
  duration: string | null
}

export interface ParsedTranscript {
  messages: ConversationMessage[]
  summary: TranscriptSummary
}

// ─── Internal types for raw JSON ───────────────────────────────────────

interface RawContentBlockText {
  type: 'text'
  text: string
}

interface RawContentBlockThinking {
  type: 'thinking'
  thinking: string
}

interface RawContentBlockToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface RawContentBlockToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string | RawContentBlockText[]
  is_error?: boolean
}

type RawContentBlock =
  | RawContentBlockText
  | RawContentBlockThinking
  | RawContentBlockToolUse
  | RawContentBlockToolResult

interface RawLine {
  type: string
  message?: {
    role: string
    content: string | RawContentBlock[]
  }
  timestamp?: string
  uuid?: string
  sessionId?: string
}

// Types to skip entirely
const SKIP_TYPES = new Set(['queue-operation', 'last-prompt', 'system', 'debug'])

// Tool names that reference files
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'Glob', 'Grep'])

// ─── Type guards ───────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRawLine(value: unknown): value is RawLine {
  return isRecord(value) && typeof value.type === 'string'
}

function isContentBlockArray(content: unknown): content is RawContentBlock[] {
  return Array.isArray(content)
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Check whether raw file content looks like a Claude Code transcript.
 * Examines the first non-empty line for JSON with a `type` field
 * plus one of `uuid`, `timestamp`, or `sessionId`.
 */
export function isTranscriptFile(rawContent: string): boolean {
  const firstLine = rawContent.split('\n').find((l) => l.trim().length > 0)
  if (!firstLine) return false

  try {
    const parsed: unknown = JSON.parse(firstLine.trim())
    if (!isRawLine(parsed)) return false
    return (
      typeof parsed.uuid === 'string' ||
      typeof parsed.timestamp === 'string' ||
      typeof parsed.sessionId === 'string'
    )
  } catch {
    return false
  }
}

/**
 * Parse a JSONL transcript into structured messages with tool call pairing.
 */
export function parseTranscript(jsonlContent: string): ParsedTranscript {
  if (!jsonlContent.trim()) {
    return emptyTranscript()
  }

  const lines = jsonlContent.split('\n')
  const parsedLines: RawLine[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const obj: unknown = JSON.parse(trimmed)
      if (isRawLine(obj)) {
        parsedLines.push(obj)
      }
    } catch {
      // Skip malformed lines
    }
  }

  // First pass: build messages and collect tool uses
  const messages: ConversationMessage[] = []
  const toolCallMap = new Map<string, ToolCall>()
  const filesSet = new Set<string>()
  const timestamps: Date[] = []
  let sessionId: string | null = null
  let messageCounter = 0

  for (const raw of parsedLines) {
    // Capture sessionId if present
    if (raw.sessionId && !sessionId) {
      sessionId = raw.sessionId
    }

    // Skip infrastructure lines
    if (SKIP_TYPES.has(raw.type)) continue

    // Collect timestamp
    if (raw.timestamp) {
      const ts = new Date(raw.timestamp)
      if (!isNaN(ts.getTime())) {
        timestamps.push(ts)
      }
    }

    if (!raw.message) continue
    const content = raw.message.content

    if (raw.type === 'assistant') {
      const msg = createAssistantMessage(String(++messageCounter), content, raw.timestamp)
      // Register tool calls in the map for later pairing
      for (const tc of msg.toolCalls) {
        toolCallMap.set(tc.id, tc)
        extractFileFromToolCall(tc, filesSet)
      }
      messages.push(msg)
    } else if (raw.type === 'user') {
      // Check if this is a tool-result-only turn
      if (isContentBlockArray(content)) {
        const hasToolResults = content.some((b) => isRecord(b) && b.type === 'tool_result')
        const hasTextContent = content.some(
          (b) =>
            isRecord(b) &&
            b.type === 'text' &&
            typeof b.text === 'string' &&
            (b.text as string).trim().length > 0,
        )

        if (hasToolResults) {
          // Pair tool results with their tool_use
          for (const block of content) {
            if (isRecord(block) && block.type === 'tool_result') {
              const toolUseId = block.tool_use_id as string
              const tc = toolCallMap.get(toolUseId)
              if (tc) {
                tc.result = extractToolResultContent(
                  block.content as string | RawContentBlockText[],
                )
                tc.isError = block.is_error === true
              }
            }
          }

          // If the turn ONLY has tool results (no text), skip creating a human message
          if (!hasTextContent) continue
        }
      }

      // Create a human message
      const textContent = extractTextFromContent(content)
      if (textContent !== null) {
        messages.push({
          id: String(++messageCounter),
          role: 'human',
          textContent,
          toolCalls: [],
          timestamp: raw.timestamp ? parseTimestamp(raw.timestamp) : null,
        })
      }
    }
  }

  // Compute summary
  let toolCallCount = 0
  for (const msg of messages) {
    toolCallCount += msg.toolCalls.length
  }

  const duration = computeDuration(timestamps)

  return {
    messages,
    summary: {
      messageCount: messages.length,
      toolCallCount,
      filesReferenced: Array.from(filesSet),
      sessionId,
      duration,
    },
  }
}

// ─── Internal helpers ──────────────────────────────────────────────────

function emptyTranscript(): ParsedTranscript {
  return {
    messages: [],
    summary: {
      messageCount: 0,
      toolCallCount: 0,
      filesReferenced: [],
      sessionId: null,
      duration: null,
    },
  }
}

function createAssistantMessage(
  id: string,
  content: string | RawContentBlock[],
  timestamp?: string,
): ConversationMessage {
  const toolCalls: ToolCall[] = []
  const textParts: string[] = []

  if (isContentBlockArray(content)) {
    for (const block of content) {
      if (!isRecord(block)) continue
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text as string)
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id as string,
          name: block.name as string,
          input: (block.input as Record<string, unknown>) ?? {},
          result: null,
          isError: false,
        })
      }
      // Skip 'thinking' blocks
    }
  } else if (typeof content === 'string') {
    textParts.push(content)
  }

  return {
    id,
    role: 'assistant',
    textContent: textParts.join('\n'),
    toolCalls,
    timestamp: timestamp ? parseTimestamp(timestamp) : null,
  }
}

function extractTextFromContent(content: string | RawContentBlock[]): string | null {
  if (typeof content === 'string') return content

  if (isContentBlockArray(content)) {
    const textParts: string[] = []
    for (const block of content) {
      if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text as string)
      }
    }
    return textParts.length > 0 ? textParts.join('\n') : null
  }

  return null
}

function extractToolResultContent(content: string | RawContentBlockText[]): string {
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    return content
      .filter((b) => isRecord(b) && b.type === 'text' && typeof b.text === 'string')
      .map((b) => (b as RawContentBlockText).text)
      .join('\n')
  }

  return String(content)
}

function extractFileFromToolCall(tc: ToolCall, filesSet: Set<string>): void {
  if (!FILE_TOOLS.has(tc.name)) return
  const filePath = (tc.input.file_path ?? tc.input.path) as string | undefined
  if (typeof filePath === 'string' && filePath.length > 0) {
    filesSet.add(filePath)
  }
}

function parseTimestamp(ts: string): Date | null {
  const d = new Date(ts)
  return isNaN(d.getTime()) ? null : d
}

function computeDuration(timestamps: Date[]): string | null {
  if (timestamps.length < 2) return null
  const sorted = timestamps.sort((a, b) => a.getTime() - b.getTime())
  const diffMs = sorted[sorted.length - 1]!.getTime() - sorted[0]!.getTime()
  const totalSeconds = Math.floor(diffMs / 1000)

  if (totalSeconds < 60) return `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (seconds === 0) return `${minutes}m`
  return `${minutes}m ${seconds}s`
}
