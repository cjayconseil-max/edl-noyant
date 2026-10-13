// Aller-retour export → import : aucune donnée ne doit être perdue ni modifiée.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { construireClasseur, lireClasseur, isoVersSerie, versIso } from '../src/excel.js';
import { COMMUNES_BASE, DOMAINES, ETATS, PRIORITES, POINTS, STATUTS_DEMANDE, ENTETES, compteurs } from '../src/data.js';

const modele = readFileSync('public/modele.xlsx');

function jeu(nbReleves, nbDemandes) {
  const communes = COMMUNES_BASE.map((c, i) => ({ ...c, statut: ['À planifier', 'Planifiée', 'Faite'][i % 3], dateVisite: i % 3 ? `2026-11-${String(i + 1).padStart(2, '0')}` : '',
    synthese: i % 2 ? `Synthèse de ${c.nom}\nDeuxième ligne avec <balise> & "guillemets" et l'apostrophe` : '' }));
  communes[0].maire = 'Nom modifié — Élu·e';
  const releves = Array.from({ length: nbReleves }, (_, i) => {
    const domaine = DOMAINES[i % 3];
    return { id: `r${i}`, commune: communes[i % 14].nom, date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, domaine,
      lieu: `Lieu n°${i} – salle des fêtes`, point: POINTS[domaine][i % POINTS[domaine].length], etat: ETATS[i % 4], priorite: PRIORITES[i % 4],
      constat: i % 5 ? `Constat ${i} : fissure > 2 mm & humidité` : '', action: i % 4 ? `Reprendre l'enduit\nPuis peindre` : '', cout: i % 3 ? i * 150.5 : null };
  });
  const photosParReleve = Object.fromEntries(releves.filter((_, i) => i % 2).map((r, i) => [r.id, [`Noyant_Mairie_2026-10-12_${i + 1}.jpg`, `Noyant_Mairie_2026-10-12_${i + 100}.jpg`]]));
  const demandes = Array.from({ length: nbDemandes }, (_, i) => ({ id: `d${i}`, commune: communes[(i * 3) % 14].nom, date: '2026-10-12', demande: `Demande ${i}`,
    precisions: i % 2 ? 'Détails\nsur deux lignes' : '', priorite: i % 3 ? PRIORITES[i % 4] : '', echeance: i % 2 ? '2027-03-01' : '', statut: STATUTS_DEMANDE[i % 5], reponse: i % 4 ? '' : 'Prévu au budget 2027' }));
  return { communes, releves, demandes, photosParReleve };
}

const sansId = ({ id, ...reste }) => reste;

describe.each([['jeu courant', 37, 12], ['classeur vide', 0, 0], ['au-delà des lignes du modèle', 430, 215]])('aller-retour Excel : %s', (_, nR, nD) => {
  const d = jeu(nR, nD);
  let octets; let lu; let wb;
  beforeAll(async () => { octets = await construireClasseur(modele, d); lu = lireClasseur(octets); wb = XLSX.read(octets, { type: 'array', cellFormula: true }); });

  it('se relit sans erreur ni avertissement', () => { expect(lu.erreurs).toEqual([]); expect(lu.avertissements).toEqual([]); });

  it('garde exactement les 4 onglets et les en-têtes en ligne 4', () => {
    expect(wb.SheetNames).toEqual(['Synthèse', 'Relevés', 'Demandes', 'Listes']);
    for (const [nom, attendu] of Object.entries(ENTETES)) {
      expect(XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, range: 3 })[0]).toEqual(attendu);
    }
    expect(wb.Sheets['Synthèse'].A1.v).toBe('États des lieux — Noyant-Villages');
  });

  it('restitue les relevés à l\'identique, photos comprises', () => {
    expect(lu.releves).toEqual(d.releves.map((r) => ({ ...sansId(r), photos: d.photosParReleve[r.id] || [] })));
  });

  it('restitue les demandes à l\'identique', () => { expect(lu.demandes).toEqual(d.demandes.map(sansId)); });

  it('restitue les communes (maire, secteur, habitants, statut, date, synthèse)', () => {
    expect(lu.communes).toEqual(d.communes.map(({ nom, maire, secteur, habitants, statut, dateVisite, synthese }) => ({ nom, maire, secteur, habitants, statut, dateVisite, synthese })));
  });

  it('conserve les formules de Synthèse avec des valeurs justes', () => {
    const s = wb.Sheets['Synthèse'];
    expect(s.G5.f).toBe('COUNTIF(Relevés!$A:$A,A5)');
    expect(s.J19.f).toBe('SUM(J5:J18)');
    d.communes.forEach((c, i) => {
      const k = compteurs(c.nom, d.releves, d.demandes);
      expect([s[`G${5 + i}`].v, s[`H${5 + i}`].v, s[`I${5 + i}`].v, s[`J${5 + i}`].v, s[`K${5 + i}`].v]).toEqual([k.points, k.urgences, k.etat4, k.cout, k.demandesOuvertes]);
    });
    expect(s.G19.v).toBe(d.releves.length);
    expect(s.D19.v).toBe(5501);
    expect(s.E19.v).toBe(`${d.communes.filter((c) => c.statut === 'Faite').length} / 14 faites`);
  });

  it('garde l\'onglet Listes, les listes déroulantes et un XML valide', async () => {
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Listes, { header: 1 })[0]).toEqual(['Communes', 'Domaines', 'États', 'Priorités', 'Statut visite', 'Statut demande']);
    const zip = await JSZip.loadAsync(octets);
    const s2 = await zip.file('xl/worksheets/sheet2.xml').async('string');
    const fin = 4 + Math.max(400, nR);
    expect(s2).toContain(`<xm:sqref>F5:F${fin}</xm:sqref>`);
    expect(s2).toContain(`<autoFilter ref="A4:K${fin}"`);
    expect(s2).toContain(`<dimension ref="A1:K${fin}"/>`);
    expect((s2.match(/<row /g) || []).length).toBe(fin - 1); // la ligne 3 du classeur est vide
    expect(await zip.file('xl/workbook.xml').async('string')).toContain('fullCalcOnLoad="1"');
  });
});

describe('modèle publié', () => {
  it('ne contient plus le chemin OneDrive personnel', async () => {
    const zip = await JSZip.loadAsync(modele);
    for (const f of Object.values(zip.files)) if (!f.dir) expect(await f.async('string')).not.toMatch(/sharepoint|julien/i);
  });
});

describe('dates', () => {
  it('convertit dans les deux sens', () => {
    expect(isoVersSerie('2026-10-12')).toBe(46307);
    expect(versIso(46307)).toBe('2026-10-12');
    expect(versIso('12/10/2026')).toBe('2026-10-12');
    expect(versIso('')).toBe('');
  });
});

describe('import d\'un fichier incorrect', () => {
  it('refuse un classeur sans les bons onglets', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b']]), 'Feuil1');
    expect(lireClasseur(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })).erreurs.length).toBeGreaterThan(0);
  });
  it('refuse un fichier qui n\'est pas un classeur', () => {
    expect(lireClasseur(new Uint8Array([1, 2, 3, 4])).erreurs.length).toBeGreaterThan(0);
  });
});
