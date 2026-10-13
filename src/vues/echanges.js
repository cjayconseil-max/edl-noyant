// Écran « Export » : exports, import, espace utilisé, réglages.
import * as base from '../db.js';
import { NOMS_COMMUNES } from '../data.js';
import { lireClasseur } from '../excel.js';
import { classeurExcel, archiveZip, compteRenduPdf, remettre, marquerExport, partagePossible, TYPE_XLSX } from '../exports.js';
import { e, options, taille, message } from '../ui.js';

let communePdf = NOMS_COMMUNES[0];

export async function vueEchanges(el) {
  const [releves, demandes, photos, dernier, gps] = await Promise.all([
    base.releves(), base.demandes(), base.photos(), base.reglage('dernierExport'), base.reglage('gps', true)]);
  const poidsPhotos = photos.reduce((s, p) => s + (p.taille || p.blob?.size || 0), 0);
  let estimation = null;
  try { estimation = await navigator.storage?.estimate?.(); } catch { /* indicateur facultatif */ }
  const part = estimation?.quota ? Math.min(100, (estimation.usage / estimation.quota) * 100) : null;
  const partage = partagePossible(TYPE_XLSX);
  const duo = (action, libelle) => `${partage ? `<button type="button" class="btn primaire" data-a="${action}" data-partage="1">Partager ${libelle}</button>` : ''}
    <button type="button" class="btn ${partage ? '' : 'primaire'}" data-a="${action}">Télécharger ${libelle}</button>`;

  el.innerHTML = `
    <h1>Export et sauvegarde</h1>
    <p class="note">${dernier ? `Dernier export : ${new Date(dernier).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}.` : 'Aucun export pour le moment.'}
      Les données restent sur cette tablette : exportez régulièrement pour les sauvegarder.</p>

    <section class="carte"><h2>Archive complète (classeur + photos)</h2>
      <p>Un fichier .zip avec le classeur Excel et les ${photos.length} photo${photos.length > 1 ? 's' : ''}. C'est la sauvegarde à privilégier.</p>
      <div class="actions">${duo('zip', 'l\'archive')}</div></section>

    <section class="carte"><h2>Classeur Excel</h2>
      <p>Même structure que le classeur d'origine : Synthèse, Relevés, Demandes, Listes (${releves.length} relevé${releves.length > 1 ? 's' : ''}, ${demandes.length} demande${demandes.length > 1 ? 's' : ''}).</p>
      <div class="actions">${duo('xlsx', 'le classeur')}</div></section>

    <section class="carte"><h2>Compte rendu PDF pour un maire délégué</h2>
      <label class="champ"><span class="libelle">Commune</span><select id="commune-pdf">${options(NOMS_COMMUNES, communePdf)}</select></label>
      <div class="actions">${duo('pdf', 'le compte rendu')}</div></section>

    <section class="carte"><h2>Importer un classeur Excel</h2>
      <p>Pour restaurer une sauvegarde ou reprendre une saisie faite sur ordinateur. Vous verrez un aperçu avant tout remplacement.</p>
      <div class="actions"><label class="btn">Choisir un fichier .xlsx<input class="masque" type="file" id="import" accept=".xlsx,${TYPE_XLSX}"></label></div>
      <div id="apercu"></div></section>

    <section class="carte"><h2>Espace utilisé</h2>
      <p><b>${taille(poidsPhotos)}</b> pour ${photos.length} photo${photos.length > 1 ? 's' : ''}${estimation?.quota ? ` · ${taille(estimation.usage)} utilisés au total sur ${taille(estimation.quota)} disponibles` : ''}.</p>
      ${part === null ? '' : `<div class="jauge" role="img" aria-label="${part.toFixed(1)} % de l'espace disponible utilisé"><span style="width:${Math.max(1, part)}%"></span></div>`}
    </section>

    <section class="carte"><h2>Réglages</h2>
      <label class="bascule"><input type="checkbox" id="gps" ${gps ? 'checked' : ''}><span>Inscrire les coordonnées GPS sur les photos (si la localisation est autorisée)</span></label>
      <div class="champ"><span class="libelle">Affichage</span>
        <div class="segments" role="group" aria-label="Affichage">
          ${[['auto', 'Automatique'], ['clair', 'Clair'], ['sombre', 'Sombre']].map(([v, l]) => { const a = (localStorage.getItem('theme') || 'auto') === v; return `<button type="button" class="choix ${a ? 'actif' : ''}" aria-pressed="${a}" data-theme-choix="${v}">${l}</button>`; }).join('')}
        </div></div>
      <p class="note">Version ${e(__VERSION__)} · fonctionne sans connexion · aucune donnée n'est envoyée sur internet.</p>
    </section>`;

  el.querySelector('#commune-pdf').addEventListener('change', (ev) => { communePdf = ev.target.value; });
  el.querySelector('#gps').addEventListener('change', (ev) => base.definirReglage('gps', ev.target.checked));

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.themeChoix) {
      localStorage.setItem('theme', b.dataset.themeChoix); window.appliquerTheme();
      b.parentElement.querySelectorAll('.choix').forEach((x) => { x.classList.toggle('actif', x === b); x.setAttribute('aria-pressed', x === b); });
      return;
    }
    const action = b.dataset.a; if (!['zip', 'xlsx', 'pdf'].includes(action)) return;
    b.disabled = true; const libelle = b.textContent; b.textContent = 'Préparation…';
    try {
      const fichier = action === 'zip' ? await archiveZip() : action === 'xlsx' ? await classeurExcel() : await compteRenduPdf(communePdf);
      const r = await remettre(fichier, { partager: !!b.dataset.partage });
      if (r !== 'annule' && action !== 'pdf') await marquerExport();
      if (r === 'telechargement') message(`Fichier téléchargé : ${fichier.nom}`);
    } catch (err) { console.error(err); message('L\'export a échoué. Réessayez.', 'erreur'); }
    b.disabled = false; b.textContent = libelle;
  });

  // --- Import avec aperçu et confirmation ---
  const apercu = el.querySelector('#apercu');
  el.querySelector('#import').addEventListener('change', async (ev) => {
    const fichier = ev.target.files[0]; ev.target.value = '';
    if (!fichier) return;
    const lu = lireClasseur(new Uint8Array(await fichier.arrayBuffer()));
    if (lu.erreurs.length) {
      apercu.innerHTML = `<div class="erreur"><b>Import impossible.</b><ul>${lu.erreurs.map((x) => `<li>${e(x)}</li>`).join('')}</ul>
        <p>Le fichier doit avoir la structure du classeur d'origine (titres des colonnes en ligne 4).</p></div>`;
      return;
    }
    const cites = new Set(lu.releves.flatMap((r) => r.photos));
    const gardees = photos.filter((p) => cites.has(p.nom)).length;
    const perdues = photos.length - gardees;
    apercu.innerHTML = `
      <div class="apercu">
        <h3>Aperçu de « ${e(fichier.name)} »</h3>
        <table><thead><tr><th></th><th class="num">Sur la tablette</th><th class="num">Dans le fichier</th></tr></thead><tbody>
          <tr><td>Relevés</td><td class="num">${releves.length}</td><td class="num">${lu.releves.length}</td></tr>
          <tr><td>Demandes</td><td class="num">${demandes.length}</td><td class="num">${lu.demandes.length}</td></tr>
          <tr><td>Communes mises à jour</td><td class="num">14</td><td class="num">${lu.communes.length}</td></tr>
          <tr><td>Photos conservées (retrouvées par leur nom)</td><td class="num">${photos.length}</td><td class="num">${gardees}</td></tr>
        </tbody></table>
        ${lu.avertissements.map((a) => `<p class="note">${e(a)}</p>`).join('')}
        <p class="erreur"><b>Attention :</b> les relevés et demandes de la tablette seront remplacés par ceux du fichier${perdues ? `, et <b>${perdues} photo${perdues > 1 ? 's' : ''}</b> non citée${perdues > 1 ? 's' : ''} dans le fichier ser${perdues > 1 ? 'ont' : 'a'} supprimée${perdues > 1 ? 's' : ''}` : ''}. Faites d'abord un export si vous avez un doute.</p>
        <div class="actions"><button type="button" class="btn danger" id="confirmer-import">Remplacer les données de la tablette</button>
          <button type="button" class="btn" id="annuler-import">Annuler</button></div>
      </div>`;
    apercu.querySelector('#annuler-import').addEventListener('click', () => { apercu.innerHTML = ''; });
    apercu.querySelector('#confirmer-import').addEventListener('click', async () => {
      try {
        await base.remplacerParImport(lu);
        message(`Import terminé : ${lu.releves.length} relevés, ${lu.demandes.length} demandes.`);
        location.hash = '#/';
      } catch (err) { console.error(err); message('L\'import a échoué, rien n\'a été modifié.', 'erreur'); }
    });
  });
}
