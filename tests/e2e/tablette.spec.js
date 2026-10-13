// Parcours complet sur tablette émulée, réseau coupé : saisie, photo, exports, import.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

const lire = async (telechargement) => readFileSync(await telechargement.path());

test('une visite complète sans connexion', async ({ page, context }) => {
  const externes = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173/') && !/^(blob|data):/.test(r.url())) externes.push(r.url()); });
  const erreurs = [];
  page.on('pageerror', (err) => erreurs.push(String(err)));

  // Première ouverture avec réseau : l'application se met en cache.
  await page.goto('./');
  await expect(page.locator('.tuile')).toHaveCount(14);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // Zone blanche : tout le reste se fait hors connexion.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.tuile')).toHaveCount(14);
  await expect(page.locator('#reseau')).toHaveText('Hors connexion');
  await expect(page.locator('.chiffre').first()).toContainText('0 / 14');

  // Filtre par secteur
  await page.getByRole('button', { name: 'Ouest', exact: true }).click();
  await expect(page.locator('.tuile')).toHaveCount(4);
  await page.getByRole('button', { name: 'Tous les secteurs' }).click();

  // Visite
  await page.locator('.tuile', { hasText: 'Noyant' }).first().click();
  await page.getByRole('button', { name: 'Faite' }).click();
  await page.getByLabel('Participants').fill('M. Chaussepied, services techniques');
  await page.getByLabel('Synthèse de la visite').fill('Visite complète du bourg.');
  await expect(page.locator('#etat-sauvegarde')).toContainText('Enregistré');

  // Relevé avec photo annotée
  await page.getByRole('link', { name: /^Relevés/ }).click();
  await page.getByRole('button', { name: 'Bâtiments' }).click();
  await page.getByLabel('Équipement ou lieu').fill('Mairie');
  await page.getByLabel('Point vérifié').selectOption('Électricité');
  await page.getByRole('button', { name: '4 - À reprendre' }).click();
  await page.getByRole('button', { name: 'Sécurité immédiate' }).click();
  await page.getByLabel('Constat').fill('Tableau électrique vétuste');
  await page.getByLabel('Coût estimé (€ TTC)').fill('1200');

  await page.locator('input[data-photo=galerie]').setInputFiles('public/icone-512.png');
  const canevas = page.locator('.plein canvas');
  await expect(canevas).toBeVisible();
  const b = await canevas.boundingBox();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Effacer le dernier tracé' })).toBeEnabled();
  await page.getByRole('button', { name: 'Enregistrer la photo' }).click();
  await expect(page.locator('#photos .vignette')).toHaveCount(1);

  // Fermeture brutale avant d'enregistrer : le brouillon et sa photo doivent être retrouvés.
  await page.reload();
  await expect(page.getByText('Brouillon repris')).toBeVisible();
  await expect(page.getByLabel('Équipement ou lieu')).toHaveValue('Mairie');
  await expect(page.locator('#photos .vignette')).toHaveCount(1);
  await page.getByRole('button', { name: 'Enregistrer le relevé' }).click();
  await expect(page.locator('article.releve')).toHaveCount(1);
  await expect(page.locator('article.releve .vignette')).toHaveCount(1);

  // Photo en plein écran
  await page.locator('article.releve .vignette').click();
  await expect(page.locator('.plein img')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Demande
  await page.getByRole('link', { name: /^Demandes/ }).click();
  await page.getByLabel('Demande', { exact: true }).fill('Refaire le marquage de la place');
  await page.getByRole('button', { name: 'Enregistrer la demande' }).click();
  await expect(page.locator('article.demande')).toHaveCount(1);

  // Accueil : compteurs à jour, y compris après rechargement hors connexion
  await page.reload();
  await page.getByRole('link', { name: 'Communes', exact: true }).first().click();
  const tuile = page.locator('.tuile', { hasText: 'Jean-Claude Chaussepied' });
  await expect(tuile).toContainText('1 point');
  await expect(tuile).toContainText('1 urgence');
  await expect(tuile).toContainText('1 demande');
  await expect(page.locator('.chiffre').first()).toContainText('1 / 14');

  // Pas de défilement horizontal, en portrait comme en paysage
  for (const taille of [{ width: 800, height: 1280 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(taille);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  // Suivi global
  await page.getByRole('link', { name: 'Suivi' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Commune').selectOption('Broc');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByLabel('Commune').selectOption('');

  // Exports
  await page.getByRole('link', { name: 'Export' }).click();
  let attente = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le classeur' }).click();
  const classeur = await lire(await attente);
  const wb = XLSX.read(classeur, { type: 'buffer' });
  expect(wb.SheetNames).toEqual(['Synthèse', 'Relevés', 'Demandes', 'Listes']);
  const ligne = XLSX.utils.sheet_to_json(wb.Sheets['Relevés'], { header: 1, range: 4 })[0];
  expect(ligne.slice(0, 1).concat(ligne.slice(2, 8))).toEqual(['Noyant', 'Bâtiments', 'Mairie', 'Électricité', '4 - À reprendre', 'Sécurité immédiate', 'Tableau électrique vétuste']);
  expect(ligne[9]).toBe(1200);
  expect(ligne[10]).toMatch(/^Noyant_Mairie_\d{4}-\d{2}-\d{2}_1\.jpg$/);
  expect(wb.Sheets['Synthèse'].E5.v).toBe('Faite');

  attente = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger l\'archive' }).click();
  const zip = await JSZip.loadAsync(await lire(await attente));
  const noms = Object.keys(zip.files);
  expect(noms.some((n) => n.endsWith('.xlsx'))).toBe(true);
  const photo = await zip.file(`photos/${ligne[10]}`).async('uint8array');
  expect([photo[0], photo[1]]).toEqual([0xff, 0xd8]); // un vrai JPEG

  attente = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le compte rendu' }).click();
  const pdf = await lire(await attente);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(5000);

  // Import du classeur exporté : aperçu, confirmation, données et photo conservées
  await page.locator('#import').setInputFiles({ name: 'sauvegarde.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: classeur });
  await expect(page.locator('.apercu')).toContainText('Aperçu');
  await page.getByRole('button', { name: 'Remplacer les données de la tablette' }).click();
  await expect(page.locator('.tuile', { hasText: 'Jean-Claude Chaussepied' })).toContainText('1 point');
  await page.locator('.tuile', { hasText: 'Jean-Claude Chaussepied' }).click();
  await expect(page.getByLabel('Participants')).toHaveValue('M. Chaussepied, services techniques');
  await page.getByRole('link', { name: /^Relevés/ }).click();
  await expect(page.locator('article.releve .vignette')).toHaveCount(1);

  // Suppression avec confirmation dans la page
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('button', { name: 'Oui, supprimer' }).click();
  await expect(page.locator('article.releve')).toHaveCount(0);

  expect(externes, 'aucune requête vers internet').toEqual([]);
  expect(erreurs, 'aucune erreur JavaScript').toEqual([]);
});
