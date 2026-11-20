import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build`         → PWA instalable (dist/)
// `npm run build:preview` → un solo HTML autocontenido para la vista previa (dist-preview/)
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
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
            start_url: '/',
            display: 'standalone',
            orientation: 'portrait',
            background_color: '#0B1510',
            theme_color: '#0B1510',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          },
        }),
  ],
  build: mode === 'preview' ? { outDir: 'dist-preview', chunkSizeWarningLimit: 2000 } : undefined,
  test: { environment: 'node' },
}))
