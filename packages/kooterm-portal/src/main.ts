import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import '@xterm/xterm/css/xterm.css'
import router from './router'
import loglevel from 'loglevel'
import { setLogger } from '@kooterm/common'

loglevel.setLevel('debug')
setLogger(loglevel.getLogger('common'))

const app = createApp(App)
app.use(router)
app.mount('#app')
