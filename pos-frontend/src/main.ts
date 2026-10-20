import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import App from './App.vue'
import router from './router'
import { bootstrapNativeShell } from './lib/native'
import { i18nPlugin, t } from './lib/i18n'
import { ApiError, newRequestRef } from './lib/api'
import { pushToast } from './composables/useToast'
import { useUiStore } from './stores/ui'
import './styles/tokens.css'
import './assets/pos.css'

const app = createApp(App)
app.use(createPinia())
app.use(i18nPlugin)
useUiStore().apply()
app.use(router)

// Unexpected errors: a friendly message with a support reference, never a stack trace.
app.config.errorHandler = (err) => {
  const ref = err instanceof ApiError && err.ref ? err.ref : newRequestRef()
  const message = err instanceof ApiError ? err.message : t('error.unexpected')
  console.error(`[pos] ${ref}`, err)
  pushToast(message, 'danger', { reference: ref })
}

app.mount('#app')

bootstrapNativeShell(router)
