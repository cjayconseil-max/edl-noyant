import * as base from '../db.js';
import { SECTEURS, compteurs } from '../data.js';
import { e, euros, dateFr } from '../ui.js';

let secteur = '';
const SEPT_JOURS = 7 * 24 * 3600 * 1000;

export async function vueAccueil(el) {
  const [communes, releves, demandes, dernier, premiere] = await Promise.all([
    base.communes(), base.releves(), base.demandes(), base.reglage('dernierExport'), base.reglage('premiereSaisie')]);
  const ks = Object.fromEntries(communes.map((c) => [c.nom, compteurs(c.nom, releves, demandes)]));
  const total = (cle) => Object.values(ks).reduce((s, k) => s + k[cle], 0);
  const faites = communes.filter((c) => c.statut === 'Faite').length;
  const reference = dernier || premiere;
  const rappel = reference && Date.now() - reference > SEPT_JOURS;
  const jours = reference ? Math.floor((Date.now() - reference) / 86400000) : 0;

  const dessiner = () => {
    const visibles = communes.filter((c) => !secteur || c.secteur === secteur);
    el.innerHTML = `
      ${rappel ? `<a class="rappel" href="#/echanges"><strong>Pensez à sauvegarder.</strong>
        ${dernier ? `Dernier export il y a ${jours} jours.` : `Aucun export depuis le début de la saisie (${jours} jours).`}
        Les données ne sont que sur cette tablette. <span class="lien">Faire un export</span></a>` : ''}
      <section class="chiffres" aria-label="Chiffres globaux">
        <div class="chiffre"><b>${faites}<small> / 14</small></b><span>Visites faites</span></div>
        <div class="chiffre"><b>${total('points')}</b><span>Points relevés</span></div>
        <div class="chiffre ${total('urgences') ? 'alerte' : ''}"><b>${total('urgences')}</b><span>Sécurité immédiate</span></div>
        <div class="chiffre"><b>${total('demandesOuvertes')}</b><span>Demandes ouvertes</span></div>
        <div class="chiffre"><b>${euros(total('cout'))}</b><span>Coût estimé</span></div>
      </section>
      <div class="filtres" role="group" aria-label="Filtrer par secteur">
        ${['', ...SECTEURS].map((s) => `<button type="button" class="puce ${s === secteur ? 'actif' : ''}" aria-pressed="${s === secteur}" data-secteur="${e(s)}">${e(s || 'Tous les secteurs')}</button>`).join('')}
      </div>
      <section class="tuiles">
        ${visibles.map((c) => { const k = ks[c.nom]; return `
          <a class="tuile" href="#/commune/${encodeURIComponent(c.nom)}">
            <span class="tuile-haut"><span class="statut statut-${c.statut === 'Faite' ? 'ok' : c.statut === 'Planifiée' ? 'plan' : 'att'}">${e(c.statut)}${c.dateVisite ? ` · ${dateFr(c.dateVisite)}` : ''}</span>
              <span class="secteur">${e(c.secteur)}</span></span>
            <h2>${e(c.nom)}</h2>
            <p class="maire">${e(c.maire)} · ${c.habitants} hab.</p>
            <span class="compteurs">
              <span><b>${k.points}</b> point${k.points > 1 ? 's' : ''}</span>
              <span class="${k.urgences ? 'urgent' : ''}"><b>${k.urgences}</b> urgence${k.urgences > 1 ? 's' : ''}</span>
              <span><b>${k.demandesOuvertes}</b> demande${k.demandesOuvertes > 1 ? 's' : ''}</span>
            </span>
          </a>`; }).join('')}
      </section>`;
  };
  dessiner();
  el.onclick = (ev) => {
    const b = ev.target.closest('[data-secteur]');
    if (b) { secteur = b.dataset.secteur; dessiner(); }
  };
}
