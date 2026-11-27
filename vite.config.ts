import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { registroLocal } from './dev/registro-local.ts'

// `npm run build`         → PWA instalable (dist/)
// `npm run build:preview` → un solo HTML autocontenido para la vista previa (dist-preview/)
export default defineConfig(({ mode }) => ({
  // Rutas relativas: la app funciona igual en la raíz (Vercel) que en una subcarpeta
  // del servidor de la empresa (p. ej. /appsfutbol/jugadores/).
  base: './',
  plugins: [
    react(),
    registroLocal(), // solo en `npm run dev`: cuentas sin confirmar el email en localhost

    mode === 'preview'
      ? viteSingleFile()
      : VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
          manifest: {
            name: 'FutbolLab Jugadores',
            short_name: 'Jugadores',
            description: 'Ficha, evaluación y evolución de cada jugador',
            lang: 'es',
            start_url: './',
            scope: './',
            display: 'standalone',
            orientation: 'portrait',
            background_color: '#0E1C2A',
            theme_color: '#0E1C2A',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
          },
        }),
  ],
  // 127.0.0.1 en vez de "localhost": en Windows Node escucha solo en IPv6 (::1) y
  // algunos navegadores entran por IPv4 y reciben "conexión rechazada".
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1' },
  build: mode === 'preview' ? { outDir: 'dist-preview', chunkSizeWarningLimit: 2000 } : undefined,
  // vmThreads: con el pool por defecto, en este equipo las pruebas no llegan a arrancar
  // ("Cannot read properties of undefined (reading 'config')" en el primer describe).
  test: { environment: 'node', pool: 'vmThreads' },
}))
