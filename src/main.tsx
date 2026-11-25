import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes alojadas con la app (sin llamadas a Google: mejor para el RGPD y para usarla sin conexión)
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
// Títulos: Bricolage Grotesque, la misma tipografía de futbollab.com
import '@fontsource-variable/bricolage-grotesque/wght.css'
import './index.css'
import './estilo-v2.css'
import './estilo-cesped.css'
import './estilo-pulido.css'
import App from './App'
import { FLAGS } from './config'

// Diseño nuevo: estructura en html[data-estilo='v2'] y capa visual en html[data-visual].
if (FLAGS.disenoV2) {
  document.documentElement.dataset.estilo = 'v2'
  document.documentElement.dataset.visual = FLAGS.estiloVisual
}

// Versión nueva publicada: el service worker nuevo toma el control (skipWaiting + clientsClaim)
// y la página se recarga UNA vez para enseñarla, sin tener que recargar a mano dos veces.
// Solo si ya había uno antes: en la primera visita no hace falta recargar.
// Se busca actualización al abrir y al volver a la pestaña.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let recargando = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return
    recargando = true
    location.reload()
  })
  const buscar = () => navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => undefined)
  void buscar()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void buscar()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
