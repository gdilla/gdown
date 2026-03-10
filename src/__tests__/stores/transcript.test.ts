import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useTranscriptStore } from '../../stores/transcript'

const mockedInvoke = vi.mocked(invoke)

// Minimal valid JSONL transcript
const userLine = JSON.stringify({
  type: 'user',
  message: { role: 'user', content: 'Hello' },
  timestamp: '2025-01-15T10:00:00.000Z',
  uuid: 'uuid-1',
})
const assistantLine = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'Hi there!' }],
  },
  timestamp: '2025-01-15T10:00:05.000Z',
  uuid: 'uuid-2',
})
const sampleJsonl = [userLine, assistantLine].join('\n')

describe('useTranscriptStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('starts with null transcript and no loading/error', () => {
    const store = useTranscriptStore()
    expect(store.transcript).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.currentFilePath).toBeNull()
  })

  it('loadTranscript reads file and parses transcript', async () => {
    mockedInvoke.mockResolvedValueOnce(sampleJsonl)
    const store = useTranscriptStore()

    await store.loadTranscript('/path/to/session.jsonl')

    expect(mockedInvoke).toHaveBeenCalledWith('read_file', { path: '/path/to/session.jsonl' })
    expect(store.transcript).not.toBeNull()
    expect(store.transcript!.messages).toHaveLength(2)
    expect(store.currentFilePath).toBe('/path/to/session.jsonl')
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('skips re-fetch if currentFilePath matches', async () => {
    mockedInvoke.mockResolvedValueOnce(sampleJsonl)
    const store = useTranscriptStore()

    await store.loadTranscript('/path/to/session.jsonl')
    await store.loadTranscript('/path/to/session.jsonl')

    expect(mockedInvoke).toHaveBeenCalledTimes(1)
  })

  it('sets error on invoke failure', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('File not found'))
    const store = useTranscriptStore()

    await store.loadTranscript('/bad/path.jsonl')

    expect(store.error).toBe('File not found')
    expect(store.transcript).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('sets error for non-Error rejection', async () => {
    mockedInvoke.mockRejectedValueOnce('string error')
    const store = useTranscriptStore()

    await store.loadTranscript('/bad/path.jsonl')

    expect(store.error).toBe('Failed to load transcript')
  })

  it('clear resets all state', async () => {
    mockedInvoke.mockResolvedValueOnce(sampleJsonl)
    const store = useTranscriptStore()

    await store.loadTranscript('/path/to/session.jsonl')
    store.clear()

    expect(store.transcript).toBeNull()
    expect(store.currentFilePath).toBeNull()
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('loads a different file after clear', async () => {
    mockedInvoke.mockResolvedValueOnce(sampleJsonl)
    const store = useTranscriptStore()

    await store.loadTranscript('/path/a.jsonl')
    store.clear()

    mockedInvoke.mockResolvedValueOnce(sampleJsonl)
    await store.loadTranscript('/path/b.jsonl')

    expect(store.currentFilePath).toBe('/path/b.jsonl')
    expect(mockedInvoke).toHaveBeenCalledTimes(2)
  })
})
