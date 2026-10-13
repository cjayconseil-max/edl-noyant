// Export et import Excel.
// Export : on repart du classeur d'origine (public/modele.xlsx) et on ne remplace que les lignes de données,
// ce qui conserve la mise en forme, les formules, les listes déroulantes et l'onglet Listes.
// Import : lecture avec SheetJS.
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { ENTETES, NOMS_COMMUNES, compteurs } from './data.js';

const LIGNES_RELEVES = 400; // lignes 5 à 404 du modèle
const LIGNES_DEMANDES = 200; // lignes 5 à 204 du modèle
export const SEPARATEUR_PHOTOS = ' ; ';

const esc = (s) => String(s)
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => (s === null ? '' : ` s="${s}"`);
const vide = (v) => v === null || v === undefined || v === '';

const cTexte = (ref, s, v) => (vide(v) ? `<c r="${ref}"${attr(s)}/>`
  : `<c r="${ref}"${attr(s)} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
const cNombre = (ref, s, v) => (vide(v) || !Number.isFinite(Number(v)) ? `<c r="${ref}"${attr(s)}/>`
  : `<c r="${ref}"${attr(s)}><v>${Number(v)}</v></c>`);
const cDate = (ref, s, iso) => cNombre(ref, s, isoVersSerie(iso));
const cFormule = (ref, s, f, v, texte = false) => `<c r="${ref}"${attr(s)}${texte ? ' t="str"' : ''}><f>${esc(f)}</f><v>${esc(v)}</v></c>`;

export function isoVersSerie(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
}

export function versIso(v) {
  if (vide(v)) return '';
  if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(s);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

function versNombre(v) {
  if (vide(v)) return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[\s  €]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Remplace les lignes à partir de la ligne 5 jusqu'à la fin de sheetData. */
function remplacerLignes(xml, lignes) {
  const debut = xml.indexOf('<row r="5"');
  const fin = xml.indexOf('</sheetData>');
  if (debut < 0 || fin < 0) throw new Error('Modèle Excel inattendu : lignes de données introuvables.');
  return xml.slice(0, debut) + lignes + xml.slice(fin);
}

function ligneSynthese(c, r, k) {
  const A = `A${r}`;
  return `<row r="${r}" spans="1:12">`
    + cTexte(A, 5, c.nom) + cTexte(`B${r}`, 5, c.maire) + cTexte(`C${r}`, 5, c.secteur) + cNombre(`D${r}`, 5, c.habitants)
    + cTexte(`E${r}`, 5, c.statut) + cDate(`F${r}`, 6, c.dateVisite)
    + cFormule(`G${r}`, 7, `COUNTIF(Relevés!$A:$A,${A})`, k.points)
    + cFormule(`H${r}`, 7, `COUNTIFS(Relevés!$A:$A,${A},Relevés!$G:$G,"Sécurité immédiate")`, k.urgences)
    + cFormule(`I${r}`, 7, `COUNTIFS(Relevés!$A:$A,${A},Relevés!$F:$F,"4*")`, k.etat4)
    + cFormule(`J${r}`, 8, `SUMIF(Relevés!$A:$A,${A},Relevés!$J:$J)`, k.cout)
    + cFormule(`K${r}`, 7, `COUNTIF(Demandes!$A:$A,${A})-COUNTIFS(Demandes!$A:$A,${A},Demandes!$G:$G,"Réalisée")-COUNTIFS(Demandes!$A:$A,${A},Demandes!$G:$G,"Refusée")`, k.demandesOuvertes)
    + cTexte(`L${r}`, 5, c.synthese) + '</row>';
}

/**
 * Construit le classeur .xlsx à partir du modèle.
 * @param modele ArrayBuffer ou Uint8Array du classeur modèle
 * @param donnees { communes, releves, demandes, photosParReleve: {idRelevé: [noms de fichiers]} }
 * @returns Promise<Uint8Array>
 */
export async function construireClasseur(modele, { communes, releves, demandes, photosParReleve = {} }) {
  const zip = await JSZip.loadAsync(modele);
  const lire = (chemin) => {
    const f = zip.file(chemin);
    if (!f) throw new Error(`Modèle Excel inattendu : ${chemin} manquant.`);
    return f.async('string');
  };

  // --- Synthèse ---
  const liste = [...communes].sort((a, b) => a.ordre - b.ordre);
  const ks = liste.map((c) => compteurs(c.nom, releves, demandes));
  const somme = (cle) => ks.reduce((s, k) => s + k[cle], 0);
  const der = 4 + liste.length;
  let l1 = liste.map((c, i) => ligneSynthese(c, 5 + i, ks[i])).join('');
  const faites = liste.filter((c) => c.statut === 'Faite').length;
  l1 += `<row r="${der + 1}" spans="1:12">` + cTexte(`A${der + 1}`, 11, 'Total')
    + cFormule(`D${der + 1}`, null, `SUM(D5:D${der})`, liste.reduce((s, c) => s + (Number(c.habitants) || 0), 0))
    + cFormule(`E${der + 1}`, null, `COUNTIF(E5:E${der},"Faite")&" / 14 faites"`, `${faites} / 14 faites`, true)
    + cFormule(`G${der + 1}`, 11, `SUM(G5:G${der})`, somme('points'))
    + cFormule(`H${der + 1}`, 11, `SUM(H5:H${der})`, somme('urgences'))
    + cFormule(`I${der + 1}`, 11, `SUM(I5:I${der})`, somme('etat4'))
    + cFormule(`J${der + 1}`, 12, `SUM(J5:J${der})`, somme('cout'))
    + cFormule(`K${der + 1}`, 11, `SUM(K5:K${der})`, somme('demandesOuvertes')) + '</row>';
  zip.file('xl/worksheets/sheet1.xml', remplacerLignes(await lire('xl/worksheets/sheet1.xml'), l1));

  // --- Relevés --- (lignes impaires blanches, lignes paires teintées, comme le modèle)
  const nR = Math.max(LIGNES_RELEVES, releves.length);
  let l2 = '';
  for (let i = 0; i < nR; i++) {
    const r = 5 + i; const x = releves[i];
    const [t, d, n] = r % 2 ? [5, 6, 13] : [9, 10, 14];
    if (!x) {
      l2 += `<row r="${r}" spans="1:11" ht="16.2">` + 'ABCDEFGHIJK'.split('').map((c) => `<c r="${c}${r}" s="${c === 'B' ? d : c === 'J' ? n : t}"/>`).join('') + '</row>';
      continue;
    }
    l2 += `<row r="${r}" spans="1:11">` + cTexte(`A${r}`, t, x.commune) + cDate(`B${r}`, d, x.date) + cTexte(`C${r}`, t, x.domaine)
      + cTexte(`D${r}`, t, x.lieu) + cTexte(`E${r}`, t, x.point) + cTexte(`F${r}`, t, x.etat) + cTexte(`G${r}`, t, x.priorite)
      + cTexte(`H${r}`, t, x.constat) + cTexte(`I${r}`, t, x.action) + cNombre(`J${r}`, n, x.cout)
      + cTexte(`K${r}`, t, (photosParReleve[x.id] || x.photos || []).join(SEPARATEUR_PHOTOS)) + '</row>';
  }
  let s2 = remplacerLignes(await lire('xl/worksheets/sheet2.xml'), l2);

  // --- Demandes ---
  const nD = Math.max(LIGNES_DEMANDES, demandes.length);
  let l3 = '';
  for (let i = 0; i < nD; i++) {
    const r = 5 + i; const x = demandes[i];
    const [t, d] = r % 2 ? [5, 6] : [9, 10];
    if (!x) {
      l3 += `<row r="${r}" spans="1:8" ht="16.2">` + 'ABCDEFGH'.split('').map((c) => `<c r="${c}${r}" s="${c === 'B' || c === 'F' ? d : t}"/>`).join('') + '</row>';
      continue;
    }
    l3 += `<row r="${r}" spans="1:8">` + cTexte(`A${r}`, t, x.commune) + cDate(`B${r}`, d, x.date) + cTexte(`C${r}`, t, x.demande)
      + cTexte(`D${r}`, t, x.precisions) + cTexte(`E${r}`, t, x.priorite) + cDate(`F${r}`, d, x.echeance)
      + cTexte(`G${r}`, t, x.statut) + cTexte(`H${r}`, t, x.reponse) + '</row>';
  }
  let s3 = remplacerLignes(await lire('xl/worksheets/sheet3.xml'), l3);

  // Au-delà de 400 relevés ou 200 demandes : on étend les plages (filtre, couleurs, listes déroulantes).
  let wb = await lire('xl/workbook.xml');
  const etendre = (xml, ancien, nouveau) => {
    const coupe = xml.indexOf('</sheetData>');
    const tete = xml.slice(0, coupe).replace(new RegExp(`(<dimension ref="A1:[A-Z]+)${ancien}"`), `$1${nouveau}"`);
    return tete + xml.slice(coupe).replace(new RegExp(`([A-Z])${ancien}\\b`, 'g'), `$1${nouveau}`);
  };
  if (nR > LIGNES_RELEVES) { s2 = etendre(s2, 4 + LIGNES_RELEVES, 4 + nR); wb = wb.replace('Relevés!$A$4:$K$404', `Relevés!$A$4:$K$${4 + nR}`); }
  if (nD > LIGNES_DEMANDES) { s3 = etendre(s3, 4 + LIGNES_DEMANDES, 4 + nD); wb = wb.replace('Demandes!$A$4:$H$204', `Demandes!$A$4:$H$${4 + nD}`); }
  zip.file('xl/worksheets/sheet2.xml', s2);
  zip.file('xl/worksheets/sheet3.xml', s3);

  // Excel recalcule toutes les formules à l'ouverture.
  if (!wb.includes('fullCalcOnLoad')) wb = wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"');
  zip.file('xl/workbook.xml', wb);

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * Lit un classeur au format d'origine.
 * @returns { communes, releves, demandes, erreurs: [], avertissements: [] }
 */
export function lireClasseur(donnees) {
  const res = { communes: [], releves: [], demandes: [], erreurs: [], avertissements: [] };
  let wb;
  try { wb = XLSX.read(donnees, { type: 'array' }); } catch { res.erreurs.push('Ce fichier n\'est pas un classeur Excel lisible.'); return res; }

  const lignes = {};
  for (const nom of Object.keys(ENTETES)) {
    const ws = wb.Sheets[nom];
    if (!ws) { res.erreurs.push(`Onglet « ${nom} » introuvable.`); continue; }
    const t = XLSX.utils.sheet_to_json(ws, { header: 1, range: 3, raw: true, defval: '', blankrows: false });
    const entetes = (t[0] || []).map((x) => String(x).trim());
    const manquants = ENTETES[nom].filter((e, i) => entetes[i] !== e);
    if (manquants.length) { res.erreurs.push(`Onglet « ${nom} » : colonnes inattendues en ligne 4 (attendu : ${manquants.join(', ')}).`); continue; }
    lignes[nom] = t.slice(1);
  }
  if (res.erreurs.length) return res;

  const txt = (v) => (vide(v) ? '' : String(v).replace(/\r\n?/g, '\n').trim());
  const inconnues = new Set();
  const communeOk = (nom) => { if (NOMS_COMMUNES.includes(nom)) return true; if (nom) inconnues.add(nom); return false; };

  for (const l of lignes['Synthèse']) {
    const nom = txt(l[0]);
    if (!nom || nom === 'Total') continue;
    if (!communeOk(nom)) continue;
    res.communes.push({ nom, maire: txt(l[1]), secteur: txt(l[2]), habitants: versNombre(l[3]) ?? 0, statut: txt(l[4]) || 'À planifier',
      dateVisite: versIso(l[5]), synthese: txt(l[11]) });
  }
  for (const l of lignes['Relevés']) {
    if (l.every(vide)) continue;
    const commune = txt(l[0]);
    if (!communeOk(commune)) continue;
    res.releves.push({ commune, date: versIso(l[1]), domaine: txt(l[2]), lieu: txt(l[3]), point: txt(l[4]), etat: txt(l[5]),
      priorite: txt(l[6]), constat: txt(l[7]), action: txt(l[8]), cout: versNombre(l[9]),
      photos: txt(l[10]).split(/\s*[;\n]\s*/).filter(Boolean) });
  }
  for (const l of lignes['Demandes']) {
    if (l.every(vide)) continue;
    const commune = txt(l[0]);
    if (!communeOk(commune)) continue;
    res.demandes.push({ commune, date: versIso(l[1]), demande: txt(l[2]), precisions: txt(l[3]), priorite: txt(l[4]),
      echeance: versIso(l[5]), statut: txt(l[6]) || 'Nouvelle', reponse: txt(l[7]) });
  }
  if (inconnues.size) res.avertissements.push(`Lignes ignorées car la commune n'est pas reconnue : ${[...inconnues].join(', ')}.`);
  const absentes = NOMS_COMMUNES.filter((n) => !res.communes.some((c) => c.nom === n));
  if (absentes.length) res.avertissements.push(`Communes absentes de l'onglet Synthèse (conservées telles quelles) : ${absentes.join(', ')}.`);
  return res;
}
