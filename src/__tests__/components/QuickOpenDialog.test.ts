import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import QuickOpenDialog from '../../components/QuickOpenDialog.vue'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

/**
 * QuickOpenDialog uses <Teleport to="body">, so teleported DOM lives in
 * document.body. We query document.body for teleported content.
 */
function findOverlay(): HTMLElement | null {
  return document.body.querySelector('.quick-open-overlay')
}

function findInput(): HTMLInputElement | null {
  return document.body.querySelector<HTMLInputElement>('.quick-open-box input')
}

function findError(): HTMLElement | null {
  return document.body.querySelector('.quick-open-error')
}

async function openDialog(wrapper: VueWrapper): Promise<void> {
  window.dispatchEvent(new CustomEvent('gdown:quick-open'))
  await wrapper.vm.$nextTick()
}

async function setInputAndSubmit(wrapper: VueWrapper, value: string): Promise<void> {
  const input = findInput()!
  // Use native setter to trigger Vue's v-model via input event
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await wrapper.vm.$nextTick()

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await vi.dynamicImportSettled()
  await wrapper.vm.$nextTick()
  // Extra tick for any follow-up reactivity
  await nextTick()
}

describe('QuickOpenDialog', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    setActivePinia(createPinia())
    mockInvoke.mockReset()
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('is hidden by default', () => {
    wrapper = mount(QuickOpenDialog)
    expect(findOverlay()).toBeNull()
  })

  it('opens when gdown:quick-open event dispatched', async () => {
    wrapper = mount(QuickOpenDialog)

    await openDialog(wrapper)

    expect(findOverlay()).not.toBeNull()
    expect(findInput()).not.toBeNull()
  })

  it('closes when Escape is pressed', async () => {
    wrapper = mount(QuickOpenDialog)

    await openDialog(wrapper)
    expect(findOverlay()).not.toBeNull()

    const input = findInput()!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(findOverlay()).toBeNull()
  })

  it('closes when clicking overlay backdrop', async () => {
    wrapper = mount(QuickOpenDialog)

    await openDialog(wrapper)
    expect(findOverlay()).not.toBeNull()

    // Click the overlay itself (not children) — matches @click.self
    findOverlay()!.click()
    await wrapper.vm.$nextTick()

    expect(findOverlay()).toBeNull()
  })

  it('shows error when file does not exist', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'resolve_file_path') {
        return Promise.resolve({
          canonical_path: '/no/such/file.md',
          exists: false,
          is_file: false,
        })
      }
      return Promise.resolve(null)
    })

    wrapper = mount(QuickOpenDialog)
    await openDialog(wrapper)
    await setInputAndSubmit(wrapper, '/no/such/file.md')

    const errorEl = findError()
    expect(errorEl).not.toBeNull()
    expect(errorEl!.textContent).toBe('File does not exist')
  })

  it('shows error when path is a directory', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'resolve_file_path') {
        return Promise.resolve({
          canonical_path: '/some/dir',
          exists: true,
          is_file: false,
        })
      }
      return Promise.resolve(null)
    })

    wrapper = mount(QuickOpenDialog)
    await openDialog(wrapper)
    await setInputAndSubmit(wrapper, '/some/dir')

    const errorEl = findError()
    expect(errorEl).not.toBeNull()
    expect(errorEl!.textContent).toBe('Path is a directory, not a file')
  })

  it('calls openFile and closes on valid path', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'resolve_file_path') {
        return Promise.resolve({
          canonical_path: '/home/user/doc.md',
          exists: true,
          is_file: true,
        })
      }
      if (cmd === 'read_file') {
        return Promise.resolve('# Hello')
      }
      return Promise.resolve(null)
    })

    wrapper = mount(QuickOpenDialog)
    await openDialog(wrapper)
    await setInputAndSubmit(wrapper, '~/doc.md')

    expect(mockInvoke).toHaveBeenCalledWith('resolve_file_path', {
      path: '~/doc.md',
      baseDir: undefined,
    })

    // Dialog should close after successful open
    expect(findOverlay()).toBeNull()
  })

  it('does not submit when input is empty', async () => {
    wrapper = mount(QuickOpenDialog)
    await openDialog(wrapper)

    const input = findInput()!
    // Input is empty by default
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.dynamicImportSettled()
    await wrapper.vm.$nextTick()

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(findOverlay()).not.toBeNull()
  })

  it('clears error when typing', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'resolve_file_path') {
        return Promise.resolve({
          canonical_path: '/bad',
          exists: false,
          is_file: false,
        })
      }
      return Promise.resolve(null)
    })

    wrapper = mount(QuickOpenDialog)
    await openDialog(wrapper)
    await setInputAndSubmit(wrapper, '/bad')
    expect(findError()).not.toBeNull()

    // Type something new — the @input handler should clear the error
    const input = findInput()!
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(findError()).toBeNull()
  })

  it('toggles off when event dispatched while open', async () => {
    wrapper = mount(QuickOpenDialog)

    await openDialog(wrapper)
    expect(findOverlay()).not.toBeNull()

    // Dispatch again — should close (toggle behavior)
    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()

    expect(findOverlay()).toBeNull()
  })

  it('cleans up event listener on unmount', () => {
    wrapper = mount(QuickOpenDialog)
    wrapper.unmount()

    // Dispatching after unmount should not throw
    expect(() => {
      window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    }).not.toThrow()
  })
})
