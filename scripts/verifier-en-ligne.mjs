// Vérifie l'application en ligne : affichage, installation possible, fonctionnement hors connexion.
import { chromium } from '@playwright/test';

const adresse = process.argv[2] || 'https://cjayconseil-max.github.io/edl-noyant/';
const nav = await chromium.launch({ channel: 'chrome' });
const ctx = await nav.newContext({ viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true, locale: 'fr-FR' });
const page = await ctx.newPage();
const ailleurs = [];
page.on('request', (r) => { if (!r.url().startsWith(adresse) && !/^(blob|data):/.test(r.url())) ailleurs.push(r.url()); });
await page.goto(adresse);
await page.locator('.tuile').first().waitFor();
console.log('Tuiles affichées :', await page.locator('.tuile').count());
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
const manifeste = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
console.log('Manifeste :', manifeste.name, '/', manifeste.short_name, '/', manifeste.display, '/', manifeste.icons.length, 'icônes');
await ctx.setOffline(true);
await page.reload();
await page.locator('.tuile').first().waitFor();
console.log('Hors connexion :', await page.locator('.tuile').count(), 'tuiles,', await page.locator('#reseau').textContent());
const modele = await page.evaluate(async () => (await fetch('./modele.xlsx')).ok);
console.log('Modèle Excel disponible hors connexion :', modele);
console.log('Requêtes vers d\'autres sites :', ailleurs.length ? ailleurs : 'aucune');
await nav.close();
