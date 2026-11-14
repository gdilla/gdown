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
