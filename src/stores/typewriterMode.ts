import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTypewriterModeStore = defineStore('typewriterMode', () => {
  const enabled = ref(false)

  function toggle() {
    enabled.value = !enabled.value
  }

  function setEnabled(value: boolean) {
    enabled.value = value
  }

  return {
    enabled,
    toggle,
    setEnabled,
  }
})
