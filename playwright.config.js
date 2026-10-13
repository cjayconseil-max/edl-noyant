import { defineConfig } from '@playwright/test';

// Émulation d'une Samsung Galaxy Tab S9 : écran 1600 x 2560 pixels, soit 800 x 1280 à l'échelle 2.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    channel: 'chrome', // le Chrome déjà installé sur le PC
    viewport: { width: 800, height: 1280 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    acceptDownloads: true,
  },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 60000 },
});
