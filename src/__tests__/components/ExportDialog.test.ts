import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ExportDialog from '../../components/ExportDialog.vue'
import { useExportStore } from '../../stores/export'

function dialog(): HTMLElement | null {
  return document.body.querySelector('.export-dialog')
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  ;(document.activeElement ?? document.body).dispatchEvent(event)
  return event
}

describe('ExportDialog focus handling', () => {
  let wrapper: VueWrapper
  let trigger: HTMLButtonElement

  beforeEach(async () => {
    setActivePinia(createPinia())
    trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    wrapper = mount(ExportDialog)
    useExportStore().dialogVisible = true
    await nextTick()
    await nextTick()
  })

  afterEach(() => {
    wrapper.unmount()
    trigger.remove()
  })

  it('moves focus into the dialog when it opens', () => {
    expect(dialog()?.contains(document.activeElement)).toBe(true)
  })

  it('closes on Escape without a click first and returns focus to the trigger', async () => {
    press('Escape')
    await nextTick()

    expect(useExportStore().dialogVisible).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('wraps Tab and Shift+Tab inside the dialog', () => {
    const focusables = Array.from(
      dialog()!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
    )
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    last.focus()
    expect(press('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    expect(press('Tab', { shiftKey: true }).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })
})

describe('ExportDialog PDF without a LaTeX engine', () => {
  let wrapper: VueWrapper

  async function open(pdfEngine: string | null, format = 'pdf') {
    setActivePinia(createPinia())
    wrapper = mount(ExportDialog)
    const store = useExportStore()
    store.pandocInfo = { path: '/usr/bin/pandoc', version: '3.7', pdf_engine: pdfEngine }
    store.selectedFormatId = format
    store.dialogVisible = true
    await nextTick()
    await nextTick()
    return store
  }

  const button = (text: string) =>
    Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)

  afterEach(() => {
    wrapper.unmount()
  })

  it('says the export is a print and turns off the options a print ignores', async () => {
    await open(null)

    expect(dialog()!.textContent).toContain('No LaTeX engine (xelatex) was found')
    expect(button('Print…')).toBeDefined()
    expect(button('Export')).toBeUndefined()
    expect(button('Browse...')!.disabled).toBe(true)
    expect(dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true)
    // The flags stay editable: naming an engine there sends the export through Pandoc.
    expect(dialog()!.querySelector<HTMLInputElement>('#export-extra-flags')!.disabled).toBe(false)
  })

  it('is an ordinary export again once an engine is named in the flags', async () => {
    const store = await open(null)
    store.extraFlags = '--pdf-engine=weasyprint'
    await nextTick()

    expect(dialog()!.textContent).not.toContain('No LaTeX engine')
    expect(button('Export')).toBeDefined()
    expect(button('Browse...')!.disabled).toBe(false)
  })

  it.each([
    ['xelatex', 'pdf'],
    [null, 'html'],
  ])('is an ordinary export with engine %s and format %s', async (engine, format) => {
    await open(engine, format)

    expect(dialog()!.textContent).not.toContain('No LaTeX engine')
    expect(button('Export')).toBeDefined()
  })
})
