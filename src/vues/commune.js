import * as base from '../db.js';
import { DOMAINES, ETATS, PRIORITES, POINTS, SECTEURS, STATUTS_VISITE, STATUTS_DEMANDE, STATUTS_DEMANDE_CLOS, compteurs, trierReleves } from '../data.js';
import { e, euros, dateFr, aujourdhui, options, classeEtat, classePriorite, message, confirmerSurPlace, adresseImage } from '../ui.js';
import { fichierVersCanevas, annoter, viseur, visionneuse } from '../photo.js';
import { compteRenduPdf, remettre, partagePossible } from '../exports.js';

const lien = (nom, onglet = '', id = '') => `#/commune/${encodeURIComponent(nom)}${onglet ? `/${onglet}` : ''}${id ? `/${id}` : ''}`;
const boutons = (liste, valeur, champ, classe = () => '') => liste.map((x) =>
  `<button type="button" class="choix ${classe(x)} ${x === valeur ? 'actif' : ''}" aria-pressed="${x === valeur}" data-choix="${champ}" data-valeur="${e(x)}">${e(x)}</button>`).join('');

export async function vueCommune(el, [nomCode, onglet = 'visite', idEdition = '']) {
  const nom = decodeURIComponent(nomCode || '');
  const c = await base.commune(nom);
  if (!c) { el.innerHTML = '<p class="vide">Commune inconnue. <a href="#/">Retour à l\'accueil</a></p>'; return; }
  const [releves, demandes] = await Promise.all([base.releves(), base.demandes()]);
  const k = compteurs(nom, releves, demandes);

  el.innerHTML = `
    <header class="entete-commune">
      <a class="retour" href="#/">‹ Communes</a>
      <div>
        <h1>${e(c.nom)}</h1>
        <p class="maire">${e(c.maire)} · secteur ${e(c.secteur)} · ${c.habitants} habitants</p>
      </div>
    </header>
    <nav class="onglets" aria-label="Rubriques de la commune">
      <a href="${lien(nom)}" ${onglet === 'visite' ? 'aria-current="page"' : ''}>Visite</a>
      <a href="${lien(nom, 'releves')}" ${onglet === 'releves' ? 'aria-current="page"' : ''}>Relevés <span class="pastille ${k.urgences ? 'urgent' : ''}">${k.points}</span></a>
      <a href="${lien(nom, 'demandes')}" ${onglet === 'demandes' ? 'aria-current="page"' : ''}>Demandes <span class="pastille">${k.demandesOuvertes}</span></a>
    </nav>
    <div id="contenu"></div>`;
  const zone = el.querySelector('#contenu');
  if (onglet === 'releves') await ongletReleves(zone, c, releves.filter((r) => r.commune === nom), idEdition);
  else if (onglet === 'demandes') await ongletDemandes(zone, c, demandes.filter((r) => r.commune === nom), idEdition);
  else ongletVisite(zone, c, k);
}

// ---------- Visite ----------
function ongletVisite(zone, c, k) {
  zone.innerHTML = `
    <section class="carte">
      <h2>Visite</h2>
      <div class="champ"><span class="libelle">Statut de la visite</span>
        <div class="segments" role="group" aria-label="Statut de la visite">${boutons(STATUTS_VISITE, c.statut, 'statut')}</div></div>
      <div class="grille-2">
        <label class="champ"><span class="libelle">Date de la visite</span><input type="date" data-champ="dateVisite" value="${e(c.dateVisite)}"></label>
        <label class="champ"><span class="libelle">Participants</span><input type="text" data-champ="participants" value="${e(c.participants)}" placeholder="Maire délégué, agents, élus…" autocomplete="off"></label>
      </div>
      <label class="champ"><span class="libelle">Synthèse de la visite</span>
        <textarea data-champ="synthese" rows="6" placeholder="Points marquants, décisions, suites à donner…">${e(c.synthese)}</textarea></label>
      <p class="note" id="etat-sauvegarde">Enregistrement automatique à chaque saisie.</p>
    </section>
    <section class="carte">
      <h2>Bilan</h2>
      <div class="chiffres compact">
        <div class="chiffre"><b>${k.points}</b><span>Points relevés</span></div>
        <div class="chiffre ${k.urgences ? 'alerte' : ''}"><b>${k.urgences}</b><span>Sécurité immédiate</span></div>
        <div class="chiffre"><b>${k.etat4}</b><span>État 4 - À reprendre</span></div>
        <div class="chiffre"><b>${euros(k.cout)}</b><span>Coût estimé</span></div>
        <div class="chiffre"><b>${k.demandesOuvertes}</b><span>Demandes ouvertes</span></div>
      </div>
      <div class="actions">
        <a class="btn primaire" href="${lien(c.nom, 'releves')}">Ajouter un relevé</a>
        <a class="btn" href="${lien(c.nom, 'demandes')}">Noter une demande</a>
        ${partagePossible() ? '<button type="button" class="btn" data-a="pdf-partage">Partager le compte rendu PDF</button>' : ''}
        <button type="button" class="btn" data-a="pdf">Télécharger le compte rendu PDF</button>
      </div>
    </section>
    <details class="carte">
      <summary>Modifier les informations de la commune</summary>
      <div class="grille-2">
        <label class="champ"><span class="libelle">Maire délégué(e)</span><input type="text" data-champ="maire" value="${e(c.maire)}" autocomplete="off"></label>
        <label class="champ"><span class="libelle">Secteur</span><select data-champ="secteur">${options(SECTEURS, c.secteur)}</select></label>
        <label class="champ"><span class="libelle">Habitants</span><input type="number" inputmode="numeric" min="0" data-champ="habitants" value="${e(c.habitants)}"></label>
      </div>
    </details>`;
  const note = zone.querySelector('#etat-sauvegarde');
  const sauver = async () => { await base.enregistrerCommune(c); note.textContent = `Enregistré à ${new Date().toLocaleTimeString('fr-FR')}.`; };
  zone.addEventListener('input', (ev) => {
    const champ = ev.target.dataset.champ; if (!champ) return;
    c[champ] = champ === 'habitants' ? Number(ev.target.value) || 0 : ev.target.value;
    sauver();
  });
  zone.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.choix === 'statut') {
      c.statut = b.dataset.valeur;
      if (c.statut === 'Faite' && !c.dateVisite) { c.dateVisite = aujourdhui(); zone.querySelector('[data-champ=dateVisite]').value = c.dateVisite; }
      b.parentElement.querySelectorAll('.choix').forEach((x) => { x.classList.toggle('actif', x === b); x.setAttribute('aria-pressed', x === b); });
      sauver();
    }
    if (b.dataset.a?.startsWith('pdf')) {
      b.disabled = true;
      try { const r = await remettre(await compteRenduPdf(c.nom), { partager: b.dataset.a === 'pdf-partage' }); if (r === 'telechargement') message('Compte rendu PDF téléchargé.'); }
      catch (err) { console.error(err); message('Le PDF n\'a pas pu être créé.', 'erreur'); }
      b.disabled = false;
    }
  });
}

// ---------- Relevés ----------
async function ongletReleves(zone, c, releves, idEdition) {
  const brouillons = (await base.releves({ brouillons: true })).filter((r) => r.brouillon && r.commune === c.nom);
  let r = idEdition ? await base.releve(idEdition) : brouillons[0];
  const existant = !!(r && !r.brouillon);
  const repris = !!(r && r.brouillon);
  r ??= { id: base.nouvelId(), commune: c.nom, date: c.dateVisite || aujourdhui(), domaine: '', lieu: '', point: '', etat: '', priorite: '',
    constat: '', action: '', cout: null, brouillon: true, cree: Date.now() };
  const gpsActif = await base.reglage('gps', true);
  const lieux = [...new Set(releves.map((x) => x.lieu).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const photosDe = {};
  for (const x of releves) photosDe[x.id] = await base.photosDuReleve(x.id);
  const listePoints = () => { const l = POINTS[r.domaine] || []; return r.point && !l.includes(r.point) ? [r.point, ...l] : l; };

  zone.innerHTML = `
    <section class="carte" id="formulaire">
      <h2>${existant ? 'Modifier le relevé' : 'Nouveau relevé'}</h2>
      ${repris ? '<p class="note">Brouillon repris : votre saisie précédente n\'était pas terminée.</p>' : ''}
      <div class="champ"><span class="libelle">Domaine</span>
        <div class="segments" role="group" aria-label="Domaine">${boutons(DOMAINES, r.domaine, 'domaine')}</div></div>
      <div class="grille-2">
        <label class="champ"><span class="libelle">Équipement ou lieu</span>
          <input type="text" data-champ="lieu" list="lieux" value="${e(r.lieu)}" placeholder="Mairie, église, rue de…" autocomplete="off"></label>
        <label class="champ"><span class="libelle">Point vérifié</span>
          <select data-champ="point">${options(listePoints(), r.point, r.domaine ? 'Choisir…' : 'Choisir d\'abord un domaine')}</select></label>
      </div>
      <datalist id="lieux">${lieux.map((l) => `<option value="${e(l)}">`).join('')}</datalist>
      <div class="champ"><span class="libelle">État</span>
        <div class="etats" role="group" aria-label="État">${boutons(ETATS, r.etat, 'etat', classeEtat)}</div></div>
      <div class="champ"><span class="libelle">Priorité</span>
        <div class="segments" role="group" aria-label="Priorité">${boutons(PRIORITES, r.priorite, 'priorite', classePriorite)}</div></div>
      <div class="grille-2">
        <label class="champ"><span class="libelle">Constat</span><textarea data-champ="constat" rows="4">${e(r.constat)}</textarea></label>
        <label class="champ"><span class="libelle">Action proposée</span><textarea data-champ="action" rows="4">${e(r.action)}</textarea></label>
      </div>
      <div class="grille-2">
        <label class="champ"><span class="libelle">Coût estimé (€ TTC)</span><input type="number" inputmode="decimal" min="0" step="any" data-champ="cout" value="${r.cout ?? ''}"></label>
        <label class="champ"><span class="libelle">Date de la visite</span><input type="date" data-champ="date" value="${e(r.date)}"></label>
      </div>
      <div class="champ"><span class="libelle">Photos</span>
        <div class="photos" id="photos"></div>
        <div class="actions">
          <label class="btn primaire grand">📷 Prendre une photo<input class="masque" type="file" accept="image/*" capture="environment" data-photo="appareil"></label>
          <button type="button" class="btn" data-a="viseur">Viseur intégré</button>
          <label class="btn">Choisir dans la galerie<input class="masque" type="file" accept="image/*" multiple data-photo="galerie"></label>
        </div>
      </div>
      <p class="erreur" id="erreur" role="alert" hidden></p>
      <div class="actions fin">
        <button type="button" class="btn primaire grand" data-a="valider">${existant ? 'Terminer la modification' : 'Enregistrer le relevé'}</button>
        ${existant ? '' : '<button type="button" class="btn" data-a="effacer">Effacer la saisie</button>'}
      </div>
    </section>
    <section>
      <h2 class="titre-liste">Relevés de ${e(c.nom)} <small>(${releves.length}, triés par priorité)</small></h2>
      ${releves.length ? '' : '<p class="vide">Aucun relevé pour le moment.</p>'}
      ${trierReleves(releves).map((x) => `
        <article class="carte releve ${classeEtat(x.etat)} ${x.id === r.id ? 'en-cours' : ''}">
          <div class="releve-tete"><span class="badge ${classeEtat(x.etat)}">${e(x.etat || 'État ?')}</span>
            <span class="badge ${classePriorite(x.priorite)}">${e(x.priorite || 'Priorité ?')}</span>
            ${x.cout ? `<span class="cout">${euros(x.cout)}</span>` : ''}</div>
          <h3>${e(x.lieu || 'Lieu non précisé')}</h3>
          <p class="sous">${e([x.domaine, x.point, dateFr(x.date)].filter(Boolean).join(' · '))}</p>
          ${x.constat ? `<p><b>Constat :</b> ${e(x.constat)}</p>` : ''}
          ${x.action ? `<p><b>Action proposée :</b> ${e(x.action)}</p>` : ''}
          ${photosDe[x.id].length ? `<div class="photos">${photosDe[x.id].map((p) => `<button type="button" class="vignette" data-voir="${p.id}" data-releve="${x.id}"><img src="${adresseImage(p.mini || p.blob)}" alt="Photo ${e(p.nom)}" loading="lazy"></button>`).join('')}</div>` : ''}
          <div class="actions"><a class="btn" href="${lien(c.nom, 'releves', x.id)}">Modifier</a>
            <button type="button" class="btn discret" data-suppr="${x.id}">Supprimer</button></div>
        </article>`).join('')}
    </section>`;

  const erreur = zone.querySelector('#erreur');
  const sauver = () => base.enregistrerReleve(r);
  const zonePhotos = zone.querySelector('#photos');
  const afficherPhotos = async () => {
    const ph = await base.photosDuReleve(r.id);
    zonePhotos.innerHTML = ph.length ? ph.map((p) => `<button type="button" class="vignette" data-voir="${p.id}" data-releve="${r.id}"><img src="${adresseImage(p.mini || p.blob)}" alt="Photo ${e(p.nom)}"></button>`).join('')
      : '<span class="note">Aucune photo pour ce relevé.</span>';
  };
  await afficherPhotos();

  const ajouterPhoto = async (canevas) => {
    const res = await annoter(canevas, { commune: c.nom, lieu: r.lieu, gpsActif });
    if (!res) return;
    await sauver();
    await base.enregistrerPhoto({ id: base.nouvelId(), releveId: r.id, commune: c.nom, nom: await base.nomPhotoLibre(r),
      blob: res.blob, mini: res.mini, taille: res.blob.size + res.mini.size, gps: res.gps, cree: res.pris });
    await afficherPhotos();
    message('Photo enregistrée.');
  };

  zone.addEventListener('input', (ev) => {
    const champ = ev.target.dataset.champ; if (!champ) return;
    r[champ] = champ === 'cout' ? (ev.target.value === '' ? null : Number(ev.target.value)) : ev.target.value;
    sauver();
  });
  zone.addEventListener('change', async (ev) => {
    if (!ev.target.dataset.photo) return;
    const fichiers = [...ev.target.files]; ev.target.value = '';
    for (const f of fichiers) {
      try { await ajouterPhoto(await fichierVersCanevas(f)); } catch (err) { console.error(err); message('Cette image n\'a pas pu être lue.', 'erreur'); }
    }
  });
  zone.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.choix) {
      const champ = b.dataset.choix;
      r[champ] = b.dataset.valeur;
      b.parentElement.querySelectorAll('.choix').forEach((x) => { x.classList.toggle('actif', x === b); x.setAttribute('aria-pressed', x === b); });
      if (champ === 'domaine') {
        if (!(POINTS[r.domaine] || []).includes(r.point)) r.point = '';
        zone.querySelector('[data-champ=point]').innerHTML = options(listePoints(), r.point, 'Choisir…');
      }
      sauver();
    } else if (b.dataset.a === 'viseur') {
      const canevas = await viseur();
      if (canevas === 'refus') message('Appareil photo indisponible ou non autorisé. Utilisez « Prendre une photo ».', 'erreur');
      else if (canevas) await ajouterPhoto(canevas);
    } else if (b.dataset.a === 'valider') {
      const manque = [!r.lieu.trim() && 'l\'équipement ou le lieu', !r.domaine && 'le domaine', !r.etat && 'l\'état'].filter(Boolean);
      if (manque.length) { erreur.textContent = `Pour enregistrer, indiquez ${manque.join(', ')}.`; erreur.hidden = false; return; }
      delete r.brouillon;
      await sauver(); await base.renommerPhotos(r);
      message(existant ? 'Relevé modifié.' : 'Relevé enregistré.');
      rafraichir(lien(c.nom, 'releves'));
    } else if (b.dataset.a === 'effacer') {
      if (await confirmerSurPlace(b, 'Effacer cette saisie et ses photos ?', 'Oui, effacer')) { await base.supprimerReleve(r.id); rafraichir(lien(c.nom, 'releves')); }
    } else if (b.dataset.suppr) {
      if (await confirmerSurPlace(b, 'Supprimer ce relevé et ses photos ?')) {
        await base.supprimerReleve(b.dataset.suppr); message('Relevé supprimé.');
        rafraichir(lien(c.nom, 'releves', b.dataset.suppr === idEdition ? '' : idEdition));
      }
    } else if (b.dataset.voir) {
      const p = (await base.photosDuReleve(b.dataset.releve)).find((x) => x.id === b.dataset.voir);
      if (p) visionneuse(p, { onSupprimer: async () => { await base.supprimerPhoto(p.id); message('Photo supprimée.'); rafraichir(location.hash); } });
    }
  });
}

// ---------- Demandes ----------
async function ongletDemandes(zone, c, demandes, idEdition) {
  const brouillons = (await base.demandes({ brouillons: true })).filter((d) => d.brouillon && d.commune === c.nom);
  let d = idEdition ? await base.demande(idEdition) : brouillons[0];
  const existant = !!(d && !d.brouillon);
  d ??= { id: base.nouvelId(), commune: c.nom, date: aujourdhui(), demande: '', precisions: '', priorite: '', echeance: '', statut: 'Nouvelle', reponse: '', brouillon: true, cree: Date.now() };

  zone.innerHTML = `
    <section class="carte" id="formulaire">
      <h2>${existant ? 'Modifier la demande' : 'Nouvelle demande du maire délégué'}</h2>
      <label class="champ"><span class="libelle">Demande</span><input type="text" data-champ="demande" value="${e(d.demande)}" placeholder="En une phrase" autocomplete="off"></label>
      <label class="champ"><span class="libelle">Précisions</span><textarea data-champ="precisions" rows="3">${e(d.precisions)}</textarea></label>
      <div class="grille-2">
        <label class="champ"><span class="libelle">Priorité</span><select data-champ="priorite">${options(PRIORITES, d.priorite, 'Non précisée')}</select></label>
        <label class="champ"><span class="libelle">Statut</span><select data-champ="statut">${options(STATUTS_DEMANDE, d.statut)}</select></label>
        <label class="champ"><span class="libelle">Notée le</span><input type="date" data-champ="date" value="${e(d.date)}"></label>
        <label class="champ"><span class="libelle">Échéance souhaitée</span><input type="date" data-champ="echeance" value="${e(d.echeance)}"></label>
      </div>
      <label class="champ"><span class="libelle">Réponse au maire délégué</span><textarea data-champ="reponse" rows="3">${e(d.reponse)}</textarea></label>
      <p class="erreur" id="erreur" role="alert" hidden></p>
      <div class="actions fin">
        <button type="button" class="btn primaire grand" data-a="valider">${existant ? 'Terminer la modification' : 'Enregistrer la demande'}</button>
        ${existant ? '' : '<button type="button" class="btn" data-a="effacer">Effacer la saisie</button>'}
      </div>
    </section>
    <section>
      <h2 class="titre-liste">Demandes de ${e(c.nom)} <small>(${demandes.length})</small></h2>
      ${demandes.length ? '' : '<p class="vide">Aucune demande pour le moment.</p>'}
      ${demandes.map((x) => `
        <article class="carte demande ${STATUTS_DEMANDE_CLOS.includes(x.statut) ? 'close' : ''} ${x.id === d.id ? 'en-cours' : ''}">
          <div class="releve-tete">
            <label class="statut-rapide"><span class="libelle">Statut</span><select data-statut="${x.id}">${options(STATUTS_DEMANDE, x.statut)}</select></label>
            ${x.priorite ? `<span class="badge ${classePriorite(x.priorite)}">${e(x.priorite)}</span>` : ''}
          </div>
          <h3>${e(x.demande || 'Demande sans titre')}</h3>
          <p class="sous">${e([x.date && `Notée le ${dateFr(x.date)}`, x.echeance && `échéance souhaitée : ${dateFr(x.echeance)}`].filter(Boolean).join(' · '))}</p>
          ${x.precisions ? `<p>${e(x.precisions)}</p>` : ''}
          ${x.reponse ? `<p><b>Réponse :</b> ${e(x.reponse)}</p>` : ''}
          <div class="actions"><a class="btn" href="${lien(c.nom, 'demandes', x.id)}">Modifier ou répondre</a>
            <button type="button" class="btn discret" data-suppr="${x.id}">Supprimer</button></div>
        </article>`).join('')}
    </section>`;

  const erreur = zone.querySelector('#erreur');
  zone.addEventListener('input', (ev) => {
    const champ = ev.target.dataset.champ; if (!champ) return;
    d[champ] = ev.target.value; base.enregistrerDemande(d);
  });
  zone.addEventListener('change', async (ev) => {
    const id = ev.target.dataset.statut; if (!id) return;
    const x = await base.demande(id); x.statut = ev.target.value; await base.enregistrerDemande(x);
    message('Statut enregistré.'); rafraichir(location.hash);
  });
  zone.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'valider') {
      if (!d.demande.trim()) { erreur.textContent = 'Pour enregistrer, indiquez la demande.'; erreur.hidden = false; return; }
      delete d.brouillon; await base.enregistrerDemande(d);
      message(existant ? 'Demande modifiée.' : 'Demande enregistrée.'); rafraichir(lien(c.nom, 'demandes'));
    } else if (b.dataset.a === 'effacer') {
      if (await confirmerSurPlace(b, 'Effacer cette saisie ?', 'Oui, effacer')) { await base.supprimerDemande(d.id); rafraichir(lien(c.nom, 'demandes')); }
    } else if (b.dataset.suppr && await confirmerSurPlace(b, 'Supprimer cette demande ?')) {
      await base.supprimerDemande(b.dataset.suppr); message('Demande supprimée.');
      rafraichir(lien(c.nom, 'demandes', b.dataset.suppr === idEdition ? '' : idEdition));
    }
  });
}

/** Va à l'adresse indiquée, ou redessine l'écran si on y est déjà. */
function rafraichir(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
