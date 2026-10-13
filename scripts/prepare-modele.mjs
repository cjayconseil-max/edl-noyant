// Fabrique public/modele.xlsx à partir du classeur d'origine, en retirant les informations
// personnelles (chemin OneDrive, auteur) puisque le modèle est publié avec l'application.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import JSZip from 'jszip';

const source = 'Etats_des_lieux_Noyant-Villages.xlsx';
const cible = 'public/modele.xlsx';

try { await access(source); } catch {
  try { await access(cible); console.log('Classeur d\'origine absent : le modèle existant est conservé.'); process.exit(0); } catch {
    console.error(`Il manque ${source} dans le dossier du projet.`); process.exit(1);
  }
}

const zip = await JSZip.loadAsync(await readFile(source));
let wb = await zip.file('xl/workbook.xml').async('string');
const ordre = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]).join(',');
if (ordre !== 'Synthèse,Relevés,Demandes,Listes') throw new Error(`Onglets inattendus : ${ordre}`);
wb = wb.replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/, '');
zip.file('xl/workbook.xml', wb);
const core = zip.file('docProps/core.xml');
if (core) {
  zip.file('docProps/core.xml', (await core.async('string'))
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '<dc:creator>EDL Noyant</dc:creator>')
    .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>EDL Noyant</cp:lastModifiedBy>'));
}
await mkdir('public', { recursive: true });
await writeFile(cible, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Modèle prêt :', cible);
