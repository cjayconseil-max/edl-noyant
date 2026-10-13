// Fabrique les icônes PNG de l'application à partir de public/icone.svg (avec le Chrome du PC).
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile('public/icone.svg', 'utf8');
const nav = await chromium.launch({ channel: 'chrome' });
const page = await nav.newPage();
const rendre = async (fichier, cote, masque) => {
  await page.setViewportSize({ width: cote, height: cote });
  // Icône « masquable » : fond plein et dessin réduit pour rester dans la zone sûre d'Android.
  await page.setContent(`<body style="margin:0;background:${masque ? '#0B1F3A' : 'transparent'};display:grid;place-items:center;height:100vh">
    <div style="width:${masque ? 72 : 100}%;line-height:0">${svg}</div></body>`);
  await page.screenshot({ path: `public/${fichier}`, omitBackground: !masque });
  console.log('Icône créée :', fichier);
};
await rendre('icone-192.png', 192, false);
await rendre('icone-512.png', 512, false);
await rendre('icone-masque-512.png', 512, true);
await nav.close();
