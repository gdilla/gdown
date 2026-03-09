import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'mermaid': ['mermaid'],
          'mathjax': ['mathjax-full'],
          'codemirror-langs': ['@codemirror/language-data'],
          'katex': ['katex'],
        },
      },
    },
  },
})
