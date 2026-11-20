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
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
