// Données de base et listes, reprises du classeur « Etats_des_lieux_Noyant-Villages.xlsx »

export const COMMUNES_BASE = [
  ['Noyant', 'Jean-Claude Chaussepied', 'Centre', 1754],
  ['Parçay-les-Pins', 'Laurent Bourdeau', 'Est et Sud', 792],
  ['Auverse', 'Claude Gaillard', 'Ouest', 444],
  ['Genneteil', 'Benoit Mussault', 'Nord-Ouest', 304],
  ['Broc', 'Xavier Conoir', 'Nord-Ouest', 301],
  ['Meigné-le-Vicomte', 'Raymond Lascaud', 'Est et Sud', 300],
  ['Chigné', 'Nathalie Boutruche', 'Nord-Ouest', 297],
  ['Lasse', 'Dominique Bouin', 'Ouest', 268],
  ['Dénezé-sous-le-Lude', 'Thierry Bardet', 'Est et Sud', 258],
  ['Breil', 'Martine Constantin', 'Est et Sud', 239],
  ['Méon', 'Sébastien Souchu', 'Est et Sud', 233],
  ['Chalonnes-sous-le-Lude', 'Jean-Marie Georget', 'Nord-Ouest', 130],
  ['Chavaignes', 'Benjamin Dauphin', 'Ouest', 92],
  ['Linières-Bouton', 'Franck Bussonnais', 'Ouest', 89],
].map(([nom, maire, secteur, habitants], ordre) => ({
  nom, maire, secteur, habitants, ordre,
  statut: 'À planifier', dateVisite: '', participants: '', synthese: '',
}));

export const NOMS_COMMUNES = COMMUNES_BASE.map((c) => c.nom);
export const SECTEURS = ['Centre', 'Est et Sud', 'Nord-Ouest', 'Ouest'];
export const DOMAINES = ['Bâtiments', 'Voirie et réseaux', 'Espaces publics'];
export const ETATS = ['1 - Bon', '2 - Correct', '3 - Dégradé', '4 - À reprendre'];
export const PRIORITES = ['Sécurité immédiate', 'À programmer cette année', 'À programmer plus tard', 'Entretien courant'];
export const STATUTS_VISITE = ['À planifier', 'Planifiée', 'Faite'];
export const STATUTS_DEMANDE = ['Nouvelle', 'En cours', 'Planifiée', 'Réalisée', 'Refusée'];
export const STATUTS_DEMANDE_CLOS = ['Réalisée', 'Refusée'];

export const POINTS = {
  'Bâtiments': [
    'Clos et couvert (toiture, façades, menuiseries)', 'Structure, fissures, humidité', 'Électricité',
    'Chauffage, ventilation', 'Plomberie, sanitaires', 'Sécurité incendie, registre de sécurité',
    'Accessibilité', 'Énergie, isolation', 'Diagnostics (amiante, plomb)', 'Abords, clôtures, accès', 'Autre',
  ],
  'Voirie et réseaux': [
    'Chaussée (nids-de-poule, fissures, ornières)', 'Accotements, bas-côtés', 'Fossés, buses, eaux pluviales',
    'Signalisation verticale', 'Marquage au sol', 'Éclairage public', 'Ouvrages (ponts, murs, parapets)',
    'Chemins ruraux', 'Sécurité (traversées, vitesse, abords d\'école)', 'Autre',
  ],
  'Espaces publics': [
    'Aire de jeux (état, sols, affichage)', 'Cimetière (allées, murs, concessions)', 'Espaces verts, arbres',
    'Mobilier urbain', 'Propreté, dépôts sauvages', 'Terrains de sport, city-stade', 'Places, parkings', 'Autre',
  ],
};

// En-têtes exacts du classeur (ligne 4 de chaque onglet)
export const ENTETES = {
  'Synthèse': ['Commune', 'Maire délégué(e)', 'Secteur', 'Habitants', 'Statut visite', 'Date visite', 'Points relevés',
    'Sécurité immédiate', 'État 4 - À reprendre', 'Coût estimé (€)', 'Demandes ouvertes', 'Synthèse de la visite'],
  'Relevés': ['Commune', 'Date visite', 'Domaine', 'Équipement ou lieu', 'Point vérifié', 'État', 'Priorité', 'Constat',
    'Action proposée', 'Coût estimé (€ TTC)', 'Photos (n° / nom de fichier)'],
  'Demandes': ['Commune', 'Notée le', 'Demande', 'Précisions', 'Priorité', 'Échéance souhaitée', 'Statut',
    'Réponse au maire délégué'],
};

/** Compteurs d'une commune, calculés comme les formules de l'onglet Synthèse. */
export function compteurs(nom, releves, demandes) {
  const r = releves.filter((x) => x.commune === nom);
  const d = demandes.filter((x) => x.commune === nom);
  return {
    points: r.length,
    urgences: r.filter((x) => x.priorite === 'Sécurité immédiate').length,
    etat4: r.filter((x) => String(x.etat).startsWith('4')).length,
    cout: r.reduce((s, x) => s + (Number(x.cout) || 0), 0),
    demandesOuvertes: d.filter((x) => !STATUTS_DEMANDE_CLOS.includes(x.statut)).length,
  };
}

export function trierReleves(releves) {
  const rang = (p) => { const i = PRIORITES.indexOf(p); return i < 0 ? 99 : i; };
  return [...releves].sort((a, b) => rang(a.priorite) - rang(b.priorite)
    || String(b.etat).localeCompare(String(a.etat)) || String(a.lieu).localeCompare(String(b.lieu), 'fr'));
}
