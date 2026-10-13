import * as base from '../db.js';
import { NOMS_COMMUNES, DOMAINES, PRIORITES, ETATS, STATUTS_DEMANDE, trierReleves } from '../data.js';
import { e, euros, dateFr, options, classeEtat, classePriorite } from '../ui.js';

const f = { quoi: 'releves', commune: '', domaine: '', priorite: '', etat: '', statut: '' };

export async function vueSuivi(el) {
  const [releves, demandes, photos] = await Promise.all([base.releves(), base.demandes(), base.photos()]);
  const nbPhotos = {};
  for (const p of photos) nbPhotos[p.releveId] = (nbPhotos[p.releveId] || 0) + 1;

  const dessiner = () => {
    const estR = f.quoi === 'releves';
    const lignes = estR
      ? trierReleves(releves.filter((r) => (!f.commune || r.commune === f.commune) && (!f.domaine || r.domaine === f.domaine)
        && (!f.priorite || r.priorite === f.priorite) && (!f.etat || r.etat === f.etat)))
      : demandes.filter((d) => (!f.commune || d.commune === f.commune) && (!f.priorite || d.priorite === f.priorite) && (!f.statut || d.statut === f.statut));
    const cout = estR ? lignes.reduce((s, r) => s + (Number(r.cout) || 0), 0) : 0;
    const filtre = (cle, libelle, liste, tous) => `<label class="champ"><span class="libelle">${libelle}</span><select data-filtre="${cle}">${options(liste, f[cle], tous)}</select></label>`;
    const versFiche = (x, onglet) => `#/commune/${encodeURIComponent(x.commune)}/${onglet}/${x.id}`;

    el.innerHTML = `
      <h1>Suivi global</h1>
      <div class="segments large" role="group" aria-label="Type de suivi">
        <button type="button" class="choix ${estR ? 'actif' : ''}" aria-pressed="${estR}" data-quoi="releves">Relevés (${releves.length})</button>
        <button type="button" class="choix ${estR ? '' : 'actif'}" aria-pressed="${!estR}" data-quoi="demandes">Demandes (${demandes.length})</button>
      </div>
      <div class="filtres-suivi">
        ${filtre('commune', 'Commune', NOMS_COMMUNES, 'Toutes')}
        ${estR ? filtre('domaine', 'Domaine', DOMAINES, 'Tous') : ''}
        ${filtre('priorite', 'Priorité', PRIORITES, 'Toutes')}
        ${estR ? filtre('etat', 'État', ETATS, 'Tous') : filtre('statut', 'Statut', STATUTS_DEMANDE, 'Tous')}
      </div>
      <p class="note">${lignes.length} ligne${lignes.length > 1 ? 's' : ''}${estR ? ` · coût estimé ${euros(cout)}` : ''}. Touchez une ligne pour l'ouvrir.</p>
      <div class="defilant">
        ${!lignes.length ? '<p class="vide">Rien à afficher avec ces filtres.</p>' : estR ? `
        <table><thead><tr><th>Commune</th><th>Lieu</th><th>Domaine</th><th>Point vérifié</th><th>État</th><th>Priorité</th><th>Constat</th><th class="num">Coût</th><th class="num">Photos</th></tr></thead>
        <tbody>${lignes.map((r) => `<tr data-vers="${versFiche(r, 'releves')}" tabindex="0">
          <td>${e(r.commune)}</td><td><b>${e(r.lieu)}</b></td><td>${e(r.domaine)}</td><td>${e(r.point)}</td>
          <td><span class="badge ${classeEtat(r.etat)}">${e(r.etat)}</span></td><td><span class="badge ${classePriorite(r.priorite)}">${e(r.priorite)}</span></td>
          <td class="long">${e(r.constat)}</td><td class="num">${r.cout ? euros(r.cout) : ''}</td><td class="num">${nbPhotos[r.id] || ''}</td></tr>`).join('')}</tbody></table>` : `
        <table><thead><tr><th>Commune</th><th>Notée le</th><th>Demande</th><th>Priorité</th><th>Échéance</th><th>Statut</th><th>Réponse</th></tr></thead>
        <tbody>${lignes.map((d) => `<tr data-vers="${versFiche(d, 'demandes')}" tabindex="0">
          <td>${e(d.commune)}</td><td>${dateFr(d.date)}</td><td><b>${e(d.demande)}</b></td>
          <td>${d.priorite ? `<span class="badge ${classePriorite(d.priorite)}">${e(d.priorite)}</span>` : ''}</td>
          <td>${dateFr(d.echeance)}</td><td>${e(d.statut)}</td><td class="long">${e(d.reponse)}</td></tr>`).join('')}</tbody></table>`}
      </div>`;
  };
  dessiner();
  el.addEventListener('change', (ev) => { const c = ev.target.dataset.filtre; if (c) { f[c] = ev.target.value; dessiner(); } });
  el.addEventListener('click', (ev) => {
    const q = ev.target.closest('[data-quoi]'); if (q) { f.quoi = q.dataset.quoi; dessiner(); return; }
    const l = ev.target.closest('[data-vers]'); if (l) location.hash = l.dataset.vers;
  });
  el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.dataset?.vers) location.hash = ev.target.dataset.vers; });
}
