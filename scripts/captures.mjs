// Outil de contrôle visuel : remplit quelques données, puis enregistre des captures d'écran
// et des exemples d'export dans le dossier passé en argument.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const dossier = process.argv[2] || 'captures';
await mkdir(dossier, { recursive: true });
const serveur = await preview({ preview: { port: 4174, strictPort: true } });
const nav = await chromium.launch({ channel: 'chrome' });
const ctx = await nav.newContext({ viewport: { width: 800, height: 1280 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR', acceptDownloads: true });
const page = await ctx.newPage();
const photo = (nom, options = {}) => page.screenshot({ path: `${dossier}/${nom}.png`, ...options });

await page.goto('http://localhost:4174/');
await page.locator('.tuile').first().waitFor();
await page.locator('.tuile', { hasText: 'Auverse' }).click();
await page.getByRole('button', { name: 'Faite' }).click();
await page.getByLabel('Synthèse de la visite').fill('Visite du bourg avec le maire délégué. Église et salle des fêtes à suivre en priorité.');
await page.getByRole('link', { name: /^Relevés/ }).click();

const releves = [
  ['Bâtiments', 'Salle des fêtes', 'Électricité', '4 - À reprendre', 'Sécurité immédiate', 'Tableau électrique vétuste, absence de différentiel.', 'Remplacer le tableau.', '3200'],
  ['Voirie et réseaux', 'Rue de l\'Église', 'Chaussée (nids-de-poule, fissures, ornières)', '3 - Dégradé', 'À programmer cette année', 'Nids-de-poule sur 30 m.', 'Reprise en enrobé.', '4500'],
  ['Espaces publics', 'Aire de jeux', 'Aire de jeux (état, sols, affichage)', '1 - Bon', 'Entretien courant', 'Rien à signaler.', '', ''],
];
for (const [i, [domaine, lieu, point, etat, priorite, constat, action, cout]] of releves.entries()) {
  await page.getByRole('button', { name: domaine }).click();
  await page.getByLabel('Équipement ou lieu').fill(lieu);
  await page.getByLabel('Point vérifié').selectOption(point);
  await page.getByRole('button', { name: etat }).click();
  await page.getByRole('button', { name: priorite }).click();
  await page.getByLabel('Constat').fill(constat);
  await page.getByLabel('Action proposée').fill(action);
  await page.getByLabel('Coût estimé (€ TTC)').fill(cout);
  if (i === 0) {
    await page.locator('input[data-photo=galerie]').setInputFiles('public/icone-512.png');
    const b = await page.locator('.plein canvas').boundingBox();
    await page.mouse.move(b.x + b.width * 0.15, b.y + b.height * 0.15); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.45, b.y + b.height * 0.45, { steps: 4 }); await page.mouse.up();
    await page.getByRole('button', { name: 'Cercle' }).click();
    await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.5); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.85, b.y + b.height * 0.75, { steps: 4 }); await page.mouse.up();
    await photo('3-annotation');
    await page.getByRole('button', { name: 'Enregistrer la photo' }).click();
    await page.locator('#photos .vignette').waitFor();
    await photo('2-formulaire');
  }
  await page.getByRole('button', { name: 'Enregistrer le relevé' }).click();
  await page.locator('article.releve').nth(i).waitFor();
}
await photo('4-releves', { fullPage: true });
await page.getByRole('link', { name: /^Demandes/ }).click();
await page.getByLabel('Demande', { exact: true }).fill('Refaire le marquage de la place');
await page.getByRole('button', { name: 'Enregistrer la demande' }).click();
await page.locator('article.demande').waitFor();
await page.goto('http://localhost:4174/#/');
await page.locator('.tuile').first().waitFor();
await photo('1-accueil-portrait');
await page.setViewportSize({ width: 1280, height: 800 });
await photo('1-accueil-paysage');
await page.emulateMedia({ colorScheme: 'dark' });
await photo('1-accueil-sombre');
await page.emulateMedia({ colorScheme: 'light' });
await page.goto('http://localhost:4174/#/suivi');
await page.locator('tbody tr').first().waitFor();
await photo('5-suivi');
await page.goto('http://localhost:4174/#/echanges');
await page.getByLabel('Commune').selectOption('Auverse');
for (const [bouton, nom] of [['Télécharger le classeur', 'exemple.xlsx'], ['Télécharger le compte rendu', 'exemple.pdf']]) {
  const attente = page.waitForEvent('download');
  await page.getByRole('button', { name: bouton }).click();
  await (await attente).saveAs(`${dossier}/${nom}`);
}
await photo('6-export', { fullPage: true });
await nav.close();
await new Promise((ok) => serveur.httpServer.close(ok));
console.log('Captures enregistrées dans', dossier);
process.exit(0);
