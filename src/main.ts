import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import './styles/inline-formatting.css'
import 'katex/dist/katex.min.css'
import './styles/math.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
