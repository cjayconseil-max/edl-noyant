import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  base: './', // chemins relatifs : fonctionne dans un sous-dossier (GitHub Pages)
  define: { __VERSION__: JSON.stringify(version) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg', 'modele.xlsx'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,xlsx}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'États des lieux',
        short_name: 'EDL Noyant',
        description: 'États des lieux des communes déléguées de Noyant-Villages',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0B1F3A',
        background_color: '#0B1F3A',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icone-masque-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { include: ['tests/*.test.js'] },
});
