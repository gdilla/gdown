import { describe, it, expect } from 'vitest'
import { isTranscriptFile, parseTranscript } from '../../utils/transcriptParser'

// ─── Fixtures ──────────────────────────────────────────────────────────

const userLine = JSON.stringify({
  type: 'user',
  message: { role: 'user', content: 'Hello, Claude!' },
  timestamp: '2025-01-15T10:00:00.000Z',
  uuid: 'uuid-1',
})

const assistantTextLine = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'Hi there! How can I help?' }],
  },
  timestamp: '2025-01-15T10:00:05.000Z',
  uuid: 'uuid-2',
})

const assistantWithThinkingLine = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'Let me think about this...' },
      { type: 'text', text: 'Here is my answer.' },
    ],
  },
  timestamp: '2025-01-15T10:00:10.000Z',
  uuid: 'uuid-3',
})

const assistantWithToolUseLine = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me read that file.' },
      {
        type: 'tool_use',
        id: 'toolu_abc123',
        name: 'Read',
        input: { file_path: '/src/main.ts' },
      },
    ],
  },
  timestamp: '2025-01-15T10:00:15.000Z',
  uuid: 'uuid-4',
})

const toolResultLine = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_abc123',
        content: 'console.log("hello")',
      },
    ],
  },
  timestamp: '2025-01-15T10:00:16.000Z',
})

const toolResultErrorLine = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_abc123',
        content: 'Error: file not found',
        is_error: true,
      },
    ],
  },
  timestamp: '2025-01-15T10:00:16.000Z',
})

const queueOperationLine = JSON.stringify({
  type: 'queue-operation',
  operation: 'enqueue',
})

const lastPromptLine = JSON.stringify({
  type: 'last-prompt',
  message: { role: 'user', content: 'last' },
})

const systemLine = JSON.stringify({
  type: 'system',
  message: { role: 'system', content: 'System init' },
})

const editToolUseLine = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_edit1',
        name: 'Edit',
        input: { file_path: '/src/utils/helper.ts', old_string: 'a', new_string: 'b' },
      },
    ],
  },
  timestamp: '2025-01-15T10:00:20.000Z',
  uuid: 'uuid-5',
})

const writeToolUseLine = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_write1',
        name: 'Write',
        input: { file_path: '/src/new-file.ts', content: 'export {}' },
      },
    ],
  },
  timestamp: '2025-01-15T10:00:25.000Z',
  uuid: 'uuid-6',
})

const toolResultForEdit = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_edit1', content: 'OK' }],
  },
  timestamp: '2025-01-15T10:00:21.000Z',
})

const toolResultForWrite = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_write1', content: 'OK' }],
  },
  timestamp: '2025-01-15T10:00:26.000Z',
})

// Content as array blocks (multi-part user message)
const userArrayContentLine = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'text', text: 'Here is my question about the code.' }],
  },
  timestamp: '2025-01-15T10:01:00.000Z',
  uuid: 'uuid-7',
})

// ─── isTranscriptFile ──────────────────────────────────────────────────

describe('isTranscriptFile', () => {
  it('returns true for valid transcript with type + uuid', () => {
    expect(isTranscriptFile(userLine)).toBe(true)
  })

  it('returns true for valid transcript with type + timestamp', () => {
    const line = JSON.stringify({ type: 'user', timestamp: '2025-01-01T00:00:00Z' })
    expect(isTranscriptFile(line)).toBe(true)
  })

  it('returns true for valid transcript with type + sessionId', () => {
    const line = JSON.stringify({ type: 'system', sessionId: 'sess-123' })
    expect(isTranscriptFile(line)).toBe(true)
  })

  it('returns false for plain markdown', () => {
    expect(isTranscriptFile('# Hello World\n\nSome markdown content')).toBe(false)
  })

  it('returns false for JSON without type field', () => {
    const line = JSON.stringify({ role: 'user', content: 'hi' })
    expect(isTranscriptFile(line)).toBe(false)
  })

  it('returns false for JSON with type but no uuid/timestamp/sessionId', () => {
    const line = JSON.stringify({ type: 'user' })
    expect(isTranscriptFile(line)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isTranscriptFile('')).toBe(false)
  })

  it('skips leading blank lines', () => {
    expect(isTranscriptFile('\n\n' + userLine)).toBe(true)
  })

  it('returns false for malformed JSON', () => {
    expect(isTranscriptFile('{not valid json')).toBe(false)
  })
})

// ─── parseTranscript ───────────────────────────────────────────────────

describe('parseTranscript', () => {
  it('parses a simple user+assistant exchange', () => {
    const input = [userLine, assistantTextLine].join('\n')
    const result = parseTranscript(input)

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0]!.role).toBe('human')
    expect(result.messages[0]!.textContent).toBe('Hello, Claude!')
    expect(result.messages[1]!.role).toBe('assistant')
    expect(result.messages[1]!.textContent).toBe('Hi there! How can I help?')
  })

  it('skips thinking blocks', () => {
    const input = [userLine, assistantWithThinkingLine].join('\n')
    const result = parseTranscript(input)

    expect(result.messages[1]!.textContent).toBe('Here is my answer.')
    expect(result.messages[1]!.textContent).not.toContain('think')
  })

  it('pairs tool_use with tool_result', () => {
    const input = [userLine, assistantWithToolUseLine, toolResultLine].join('\n')
    const result = parseTranscript(input)

    // User turn with only tool results should not create a human message
    expect(result.messages).toHaveLength(2) // human + assistant
    const assistantMsg = result.messages[1]!
    expect(assistantMsg.toolCalls).toHaveLength(1)
    expect(assistantMsg.toolCalls[0]!.name).toBe('Read')
    expect(assistantMsg.toolCalls[0]!.result).toBe('console.log("hello")')
    expect(assistantMsg.toolCalls[0]!.isError).toBe(false)
  })

  it('marks tool results with errors', () => {
    const input = [userLine, assistantWithToolUseLine, toolResultErrorLine].join('\n')
    const result = parseTranscript(input)

    const assistantMsg = result.messages[1]!
    expect(assistantMsg.toolCalls[0]!.isError).toBe(true)
    expect(assistantMsg.toolCalls[0]!.result).toBe('Error: file not found')
  })

  it('skips infrastructure lines (queue-operation, last-prompt, system)', () => {
    const input = [
      queueOperationLine,
      userLine,
      systemLine,
      assistantTextLine,
      lastPromptLine,
    ].join('\n')
    const result = parseTranscript(input)

    expect(result.messages).toHaveLength(2) // only user + assistant
  })

  it('handles string content for user messages', () => {
    const input = userLine
    const result = parseTranscript(input)

    expect(result.messages[0]!.textContent).toBe('Hello, Claude!')
  })

  it('handles array content for user messages with text blocks', () => {
    const input = userArrayContentLine
    const result = parseTranscript(input)

    expect(result.messages[0]!.textContent).toBe('Here is my question about the code.')
  })

  it('does not create human messages from tool-result-only user turns', () => {
    const input = [userLine, assistantWithToolUseLine, toolResultLine, assistantTextLine].join('\n')
    const result = parseTranscript(input)

    expect(result.messages).toHaveLength(3) // human, assistant (with tool), assistant (text)
    expect(result.messages[0]!.role).toBe('human')
    expect(result.messages[1]!.role).toBe('assistant')
    expect(result.messages[2]!.role).toBe('assistant')
  })

  it('computes summary with correct message and tool call counts', () => {
    const input = [userLine, assistantWithToolUseLine, toolResultLine, assistantTextLine].join('\n')
    const result = parseTranscript(input)

    expect(result.summary.messageCount).toBe(3)
    expect(result.summary.toolCallCount).toBe(1)
  })

  it('extracts files referenced from Read/Edit/Write tool inputs', () => {
    const input = [
      userLine,
      assistantWithToolUseLine,
      toolResultLine,
      editToolUseLine,
      toolResultForEdit,
      writeToolUseLine,
      toolResultForWrite,
    ].join('\n')
    const result = parseTranscript(input)

    expect(result.summary.filesReferenced).toContain('/src/main.ts')
    expect(result.summary.filesReferenced).toContain('/src/utils/helper.ts')
    expect(result.summary.filesReferenced).toContain('/src/new-file.ts')
    // No duplicates
    expect(result.summary.filesReferenced.length).toBe(3)
  })

  it('computes duration from first to last timestamp', () => {
    const input = [userLine, assistantTextLine].join('\n')
    const result = parseTranscript(input)

    // 10:00:00 to 10:00:05 = 5s
    expect(result.summary.duration).toBe('5s')
  })

  it('computes duration in minutes when >= 60s', () => {
    const line1 = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: 'hi' },
      timestamp: '2025-01-15T10:00:00.000Z',
      uuid: 'u1',
    })
    const line2 = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'bye' }] },
      timestamp: '2025-01-15T10:05:30.000Z',
      uuid: 'u2',
    })
    const result = parseTranscript([line1, line2].join('\n'))
    expect(result.summary.duration).toBe('5m 30s')
  })

  it('handles empty input', () => {
    const result = parseTranscript('')

    expect(result.messages).toHaveLength(0)
    expect(result.summary.messageCount).toBe(0)
    expect(result.summary.toolCallCount).toBe(0)
    expect(result.summary.filesReferenced).toEqual([])
    expect(result.summary.duration).toBeNull()
  })

  it('skips malformed JSON lines without throwing', () => {
    const input = [userLine, '{broken json here', assistantTextLine].join('\n')

    expect(() => parseTranscript(input)).not.toThrow()
    const result = parseTranscript(input)
    expect(result.messages).toHaveLength(2)
  })

  it('handles tool_result with array content', () => {
    const toolResultArrayContent = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_abc123',
            content: [{ type: 'text', text: 'file contents here' }],
          },
        ],
      },
      timestamp: '2025-01-15T10:00:16.000Z',
    })
    const input = [userLine, assistantWithToolUseLine, toolResultArrayContent].join('\n')
    const result = parseTranscript(input)

    expect(result.messages[1]!.toolCalls[0]!.result).toBe('file contents here')
  })

  it('sets timestamp on messages when available', () => {
    const input = userLine
    const result = parseTranscript(input)

    expect(result.messages[0]!.timestamp).toBeInstanceOf(Date)
    expect(result.messages[0]!.timestamp!.toISOString()).toBe('2025-01-15T10:00:00.000Z')
  })

  it('deduplicates files in filesReferenced', () => {
    const read1 = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_r1', name: 'Read', input: { file_path: '/src/main.ts' } },
        ],
      },
      timestamp: '2025-01-15T10:00:15.000Z',
      uuid: 'uuid-r1',
    })
    const result1 = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_r1', content: 'ok' }],
      },
      timestamp: '2025-01-15T10:00:16.000Z',
    })
    const read2 = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_r2', name: 'Read', input: { file_path: '/src/main.ts' } },
        ],
      },
      timestamp: '2025-01-15T10:00:17.000Z',
      uuid: 'uuid-r2',
    })
    const result2 = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_r2', content: 'ok' }],
      },
      timestamp: '2025-01-15T10:00:18.000Z',
    })

    const input = [userLine, read1, result1, read2, result2].join('\n')
    const result = parseTranscript(input)

    expect(result.summary.filesReferenced).toEqual(['/src/main.ts'])
  })
})
