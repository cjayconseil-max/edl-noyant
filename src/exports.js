// Exports : classeur Excel, archive zip avec photos, compte rendu PDF, partage Android.
import JSZip from 'jszip';
import * as base from './db.js';
import { construireClasseur } from './excel.js';
import { compteurs, trierReleves, STATUTS_DEMANDE_CLOS } from './data.js';
import { aujourdhui, dateFr } from './ui.js';

export const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function donnees() {
  const [communes, releves, demandes, photos] = await Promise.all([base.communes(), base.releves(), base.demandes(), base.photos()]);
  const ids = new Set(releves.map((r) => r.id));
  const utiles = photos.filter((p) => ids.has(p.releveId));
  const photosParReleve = {};
  for (const p of utiles) (photosParReleve[p.releveId] ??= []).push(p.nom);
  return { communes, releves, demandes, photos: utiles, photosParReleve };
}

export async function classeurExcel(d = null) {
  d ??= await donnees();
  const modele = await (await fetch(`${import.meta.env.BASE_URL}modele.xlsx`)).arrayBuffer();
  const octets = await construireClasseur(modele, d);
  return { blob: new Blob([octets], { type: TYPE_XLSX }), nom: `Etats_des_lieux_Noyant-Villages_${aujourdhui()}.xlsx` };
}

export async function archiveZip() {
  const d = await donnees();
  const zip = new JSZip();
  const xl = await classeurExcel(d);
  zip.file(xl.nom, xl.blob);
  for (const p of d.photos) zip.file(`photos/${p.nom}`, p.blob, { compression: 'STORE' });
  return { blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }), nom: `Etats_des_lieux_Noyant-Villages_${aujourdhui()}.zip`, photos: d.photos.length };
}

export async function marquerExport() { await base.definirReglage('dernierExport', Date.now()); }

export const partagePossible = (type = 'application/pdf') => {
  try { return !!navigator.canShare?.({ files: [new File([''], 'x', { type })] }); } catch { return false; }
};

/** Partage via le menu Android si possible, sinon téléchargement. @returns 'partage' | 'telechargement' | 'annule' */
export async function remettre({ blob, nom }, { partager = true } = {}) {
  const fichier = new File([blob], nom, { type: blob.type });
  if (partager && navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: nom }); return 'partage'; } catch (err) {
      if (err?.name === 'AbortError') return 'annule';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'telechargement';
}

// --- Compte rendu PDF ---
// Les polices standard du PDF ne connaissent pas tous les caractères : on remplace les plus exotiques.
const pdfTxt = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/…/g, '...').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/€/g, 'EUR').replace(/[  ]/g, ' ')
  .replace(/[^\n\x20-\x7E¡-ÿ]/g, '');
const eurosPdf = (n) => `${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} EUR`;
const blobVersDataUrl = (b) => new Promise((ok, ko) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = ko; l.readAsDataURL(b); });
const dimensions = (url) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok([4, 3]); i.src = url; });

const COULEUR_ETAT = { 1: [30, 132, 73], 2: [45, 90, 142], 3: [214, 120, 12], 4: [192, 40, 30] };

export async function compteRenduPdf(nomCommune) {
  const { jsPDF } = await import('jspdf');
  const c = await base.commune(nomCommune);
  const releves = trierReleves((await base.releves()).filter((r) => r.commune === nomCommune));
  const demandes = (await base.demandes()).filter((r) => r.commune === nomCommune);
  const k = compteurs(nomCommune, releves, demandes);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, H = 297, M = 15, LU = L - 2 * M;
  let y = 0;
  const marine = [11, 31, 58], bleu = [45, 90, 142], gris = [90, 100, 115];
  const place = (h) => { if (y + h > H - 16) { pdf.addPage(); y = 18; } };
  const texte = (t, { corps = 10, gras = false, couleur = [25, 30, 40], x = M, largeur = LU, interligne = 1.32 } = {}) => {
    pdf.setFont('helvetica', gras ? 'bold' : 'normal'); pdf.setFontSize(corps); pdf.setTextColor(...couleur);
    const pas = corps * 0.3528 * interligne;
    for (const l of pdf.splitTextToSize(pdfTxt(t), largeur)) { place(pas); pdf.text(l, x, y + pas * 0.78); y += pas; }
  };
  const titre = (t) => {
    y += 5; place(14);
    pdf.setFillColor(...bleu); pdf.rect(M, y, 1.6, 6.5, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(...marine); pdf.text(pdfTxt(t), M + 4, y + 5.1);
    y += 10;
  };

  // En-tête
  pdf.setFillColor(...marine); pdf.rect(0, 0, L, 34, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19);
  pdf.text(pdfTxt(`État des lieux - ${c.nom}`), M, 15);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5);
  pdf.text(pdfTxt(`Commune déléguée de Noyant-Villages  ·  Maire délégué(e) : ${c.maire}`), M, 22.5);
  pdf.text(pdfTxt(`Visite : ${c.statut}${c.dateVisite ? ` le ${dateFr(c.dateVisite)}` : ''}  ·  Compte rendu du ${dateFr(aujourdhui())}`), M, 28.5);
  y = 42;

  if (c.participants) texte(`Participants : ${c.participants}`, { couleur: gris });
  y += 2;
  // Chiffres clés
  const cases = [['Points relevés', k.points], ['Sécurité immédiate', k.urgences], ['État 4 - À reprendre', k.etat4], ['Coût estimé', eurosPdf(k.cout)], ['Demandes ouvertes', k.demandesOuvertes]];
  const lc = (LU - 4 * 3) / 5;
  cases.forEach(([lib, val], i) => {
    const x = M + i * (lc + 3);
    pdf.setFillColor(238, 243, 249); pdf.roundedRect(x, y, lc, 17, 1.5, 1.5, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(...(i === 1 && val > 0 ? COULEUR_ETAT[4] : marine)); pdf.text(String(val), x + 3, y + 7.5);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...gris); pdf.text(pdfTxt(lib), x + 3, y + 13.2);
  });
  y += 21;

  titre('Synthèse de la visite');
  texte(c.synthese || 'Aucune synthèse saisie.', c.synthese ? {} : { couleur: gris });

  titre(`Relevés (${releves.length})`);
  if (!releves.length) texte('Aucun relevé.', { couleur: gris });
  for (const [i, r] of releves.entries()) {
    place(26);
    const col = COULEUR_ETAT[String(r.etat).charAt(0)] || gris;
    pdf.setDrawColor(215, 222, 232); pdf.line(M, y, L - M, y); y += 3;
    pdf.setFillColor(...col); pdf.roundedRect(M, y, 34, 6, 1, 1, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(255, 255, 255); pdf.text(pdfTxt(r.etat || 'État non précisé'), M + 2, y + 4.2);
    pdf.setTextColor(...(r.priorite === 'Sécurité immédiate' ? COULEUR_ETAT[4] : gris)); pdf.text(pdfTxt(r.priorite || ''), M + 37, y + 4.2);
    y += 8;
    texte(`${i + 1}. ${r.lieu || 'Lieu non précisé'}`, { corps: 11, gras: true, couleur: marine });
    texte([r.domaine, r.point].filter(Boolean).join(' · '), { corps: 9, couleur: gris });
    if (r.constat) texte(`Constat : ${r.constat}`);
    if (r.action) texte(`Action proposée : ${r.action}`);
    if (r.cout) texte(`Coût estimé : ${eurosPdf(r.cout)} TTC`, { gras: true });
    const ph = await base.photosDuReleve(r.id);
    if (ph.length) {
      y += 1.5;
      const lv = (LU - 3 * 3) / 4; let x = M; let hLigne = 0;
      for (const p of ph) {
        const url = await blobVersDataUrl(p.mini || p.blob);
        const [pl, phh] = await dimensions(url);
        const h = Math.min(60, lv * phh / pl); const l = h * pl / phh;
        if (x + l > L - M + 0.1) { x = M; y += hLigne + 3; hLigne = 0; }
        if (y + h > H - 16) { pdf.addPage(); y = 18; x = M; hLigne = 0; }
        pdf.addImage(url, 'JPEG', x, y, l, h, undefined, 'FAST');
        x += l + 3; hLigne = Math.max(hLigne, h);
      }
      y += hLigne + 1;
    }
    y += 3;
  }

  titre(`Demandes du maire délégué (${demandes.length})`);
  if (!demandes.length) texte('Aucune demande.', { couleur: gris });
  for (const d of demandes) {
    place(16);
    pdf.setDrawColor(215, 222, 232); pdf.line(M, y, L - M, y); y += 2.5;
    texte(d.demande || 'Demande sans titre', { corps: 11, gras: true, couleur: marine });
    texte([`Statut : ${d.statut}`, d.priorite, d.date && `notée le ${dateFr(d.date)}`, d.echeance && `échéance souhaitée : ${dateFr(d.echeance)}`].filter(Boolean).join('  ·  '),
      { corps: 9, couleur: STATUTS_DEMANDE_CLOS.includes(d.statut) ? gris : bleu });
    if (d.precisions) texte(d.precisions);
    if (d.reponse) texte(`Réponse : ${d.reponse}`, { gras: true });
    y += 2.5;
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...gris);
    pdf.text(pdfTxt(`Noyant-Villages - Services techniques - État des lieux de ${c.nom}`), M, H - 8);
    pdf.text(`${i} / ${pages}`, L - M, H - 8, { align: 'right' });
  }
  const sansAccent = c.nom.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return { blob: pdf.output('blob'), nom: `Compte-rendu_${sansAccent}_${aujourdhui()}.pdf` };
}
