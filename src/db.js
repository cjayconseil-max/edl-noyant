// Stockage local (IndexedDB) : rien ne quitte la tablette.
import { openDB } from 'idb';
import { COMMUNES_BASE } from './data.js';

let promesse;
export function db() {
  promesse ??= openDB('edl-noyant', 1, {
    upgrade(d) {
      d.createObjectStore('communes', { keyPath: 'nom' });
      d.createObjectStore('releves', { keyPath: 'id' }).createIndex('commune', 'commune');
      d.createObjectStore('photos', { keyPath: 'id' }).createIndex('releveId', 'releveId');
      d.createObjectStore('demandes', { keyPath: 'id' }).createIndex('commune', 'commune');
      d.createObjectStore('reglages');
    },
  });
  return promesse;
}

export const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export async function initialiser() {
  const d = await db();
  if (await d.count('communes') === 0) {
    const tx = d.transaction('communes', 'readwrite');
    for (const c of COMMUNES_BASE) tx.store.put({ ...c });
    await tx.done;
  }
  // Demande au navigateur de ne pas effacer les données en cas de manque de place.
  try { await navigator.storage?.persist?.(); } catch { /* sans gravité */ }
}

export async function communes() { return (await (await db()).getAll('communes')).sort((a, b) => a.ordre - b.ordre); }
export async function commune(nom) { return (await db()).get('communes', nom); }
export async function enregistrerCommune(c) { await (await db()).put('communes', c); }

/** Relevés validés (les brouillons en cours de saisie sont exclus sauf demande explicite). */
export async function releves({ brouillons = false } = {}) {
  const t = await (await db()).getAll('releves');
  return (brouillons ? t : t.filter((r) => !r.brouillon)).sort((a, b) => (a.cree || 0) - (b.cree || 0));
}
export async function releve(id) { return (await db()).get('releves', id); }
export async function enregistrerReleve(r) { await marquerSaisie(); await (await db()).put('releves', r); }
export async function supprimerReleve(id) {
  const d = await db();
  const tx = d.transaction(['releves', 'photos'], 'readwrite');
  for (const cle of await tx.objectStore('photos').index('releveId').getAllKeys(id)) tx.objectStore('photos').delete(cle);
  tx.objectStore('releves').delete(id);
  await tx.done;
}

export async function demandes({ brouillons = false } = {}) {
  const t = await (await db()).getAll('demandes');
  return (brouillons ? t : t.filter((r) => !r.brouillon)).sort((a, b) => (a.cree || 0) - (b.cree || 0));
}
export async function demande(id) { return (await db()).get('demandes', id); }
export async function enregistrerDemande(x) { await marquerSaisie(); await (await db()).put('demandes', x); }
export async function supprimerDemande(id) { await (await db()).delete('demandes', id); }

export async function photos() { return (await (await db()).getAll('photos')).sort((a, b) => (a.cree || 0) - (b.cree || 0)); }
export async function photosDuReleve(id) {
  return (await (await db()).getAllFromIndex('photos', 'releveId', id)).sort((a, b) => (a.cree || 0) - (b.cree || 0));
}
export async function enregistrerPhoto(p) { await (await db()).put('photos', p); }
export async function supprimerPhoto(id) { await (await db()).delete('photos', id); }

export async function reglage(cle, defaut = null) { return (await (await db()).get('reglages', cle)) ?? defaut; }
export async function definirReglage(cle, valeur) { await (await db()).put('reglages', valeur, cle); }
async function marquerSaisie() { if (!(await reglage('premiereSaisie'))) await definirReglage('premiereSaisie', Date.now()); }

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const prefixePhoto = (r) => `${sansAccent(r.commune) || 'Commune'}_${sansAccent(r.lieu) || 'Lieu'}_${r.date || new Date().toISOString().slice(0, 10)}_`;

/** Prochain nom libre de la forme Commune_Lieu_AAAA-MM-JJ_n.jpg */
export async function nomPhotoLibre(r, dejaPris = null) {
  const pris = dejaPris || new Set((await photos()).map((p) => p.nom));
  const prefixe = prefixePhoto(r);
  let n = 1;
  while (pris.has(`${prefixe}${n}.jpg`)) n++;
  return `${prefixe}${n}.jpg`;
}

/** Renomme les photos d'un relevé si la commune, le lieu ou la date ont changé depuis la prise de vue. */
export async function renommerPhotos(r) {
  const toutes = await photos();
  const pris = new Set(toutes.map((p) => p.nom));
  const prefixe = prefixePhoto(r);
  for (const p of toutes.filter((x) => x.releveId === r.id && !x.nom.startsWith(prefixe))) {
    pris.delete(p.nom);
    p.nom = await nomPhotoLibre(r, pris);
    pris.add(p.nom);
    await enregistrerPhoto(p);
  }
}

/** Remplace toutes les données par celles d'un import. Les photos sont rattachées par leur nom de fichier. */
export async function remplacerParImport({ communes: cs, releves: rs, demandes: ds }) {
  const d = await db();
  const tx = d.transaction(['communes', 'releves', 'demandes', 'photos'], 'readwrite');
  const sc = tx.objectStore('communes');
  for (const c of cs) { const actuel = await sc.get(c.nom); if (actuel) sc.put({ ...actuel, ...c }); }
  const sp = tx.objectStore('photos');
  const parNom = new Map((await sp.getAll()).map((p) => [p.nom, p]));
  const gardees = new Set();
  const sr = tx.objectStore('releves');
  await sr.clear();
  let t = Date.now();
  for (const r of rs) {
    const { photos: noms = [], ...reste } = r;
    const id = nouvelId();
    sr.put({ ...reste, id, cree: t++ });
    for (const nom of noms) { const p = parNom.get(nom); if (p && !gardees.has(p.id)) { gardees.add(p.id); sp.put({ ...p, releveId: id, commune: r.commune }); } }
  }
  for (const p of parNom.values()) if (!gardees.has(p.id)) sp.delete(p.id);
  const sd = tx.objectStore('demandes');
  await sd.clear();
  for (const x of ds) sd.put({ ...x, id: nouvelId(), cree: t++ });
  await tx.done;
}
