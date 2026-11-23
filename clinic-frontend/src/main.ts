import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import App from './App.vue'
import router from './router'
import { ApiError, newRequestRef } from './lib/api'
import { t } from './lib/i18n'
import { pushToast } from './composables/useToast'
import './styles/tokens.css'
import './styles/clinza.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.config.errorHandler = (err) => {
  const ref = err instanceof ApiError && err.ref ? err.ref : newRequestRef()
  console.error(`[clinza] ${ref}`, err)
  pushToast(err instanceof ApiError ? err.message : t('error.unexpected'), 'danger', { reference: ref })
}
app.mount('#app')
