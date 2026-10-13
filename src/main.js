import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/lato/latin-400.css';
import '@fontsource/lato/latin-700.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { initialiser } from './db.js';
import { libererImages } from './ui.js';
import { vueAccueil } from './vues/accueil.js';
import { vueCommune } from './vues/commune.js';
import { vueSuivi } from './vues/suivi.js';
import { vueEchanges } from './vues/echanges.js';

window.appliquerTheme = () => {
  const t = localStorage.getItem('theme');
  if (t === 'clair' || t === 'sombre') document.documentElement.dataset.theme = t === 'clair' ? 'light' : 'dark';
  else delete document.documentElement.dataset.theme;
};
window.appliquerTheme();

const app = document.getElementById('app');
app.innerHTML = `
  <header class="bandeau">
    <a class="marque" href="#/"><span class="titre">États des lieux</span><span class="sous-titre">Noyant-Villages</span></a>
    <nav aria-label="Navigation principale">
      <a href="#/" data-nav="accueil">Communes</a>
      <a href="#/suivi" data-nav="suivi">Suivi</a>
      <a href="#/echanges" data-nav="echanges">Export</a>
    </nav>
    <span class="reseau" id="reseau" role="status"></span>
  </header>
  <main id="vue"></main>`;

const reseau = document.getElementById('reseau');
const majReseau = () => { reseau.textContent = navigator.onLine ? '' : 'Hors connexion'; };
addEventListener('online', majReseau); addEventListener('offline', majReseau); majReseau();

let tour = 0;
async function afficher() {
  const moi = ++tour;
  const [, route = '', ...params] = location.hash.split('/');
  const nom = route === 'commune' ? 'accueil' : (['suivi', 'echanges'].includes(route) ? route : 'accueil');
  document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === nom ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  // On repart d'un élément neuf pour ne garder aucun écouteur de l'écran précédent.
  const vue = document.createElement('main');
  vue.id = 'vue';
  libererImages();
  try {
    if (route === 'commune') await vueCommune(vue, params);
    else if (route === 'suivi') await vueSuivi(vue);
    else if (route === 'echanges') await vueEchanges(vue);
    else await vueAccueil(vue);
  } catch (err) {
    console.error(err);
    vue.innerHTML = '<p class="erreur">Un problème est survenu à l\'affichage. Vos données ne sont pas touchées : revenez à l\'accueil et réessayez.</p>';
  }
  if (moi !== tour) return;
  const memo = scrollY;
  const chemin = location.hash.split('/').slice(0, 4).join('/');
  document.getElementById('vue').replaceWith(vue);
  // Modification d'une ligne : on montre le formulaire. Même écran redessiné : on garde la position.
  if (route === 'commune' && params[2]) vue.querySelector('#formulaire')?.scrollIntoView({ block: 'start' });
  else scrollTo(0, chemin === dernierChemin ? memo : 0);
  dernierChemin = chemin;
}
let dernierChemin = '';

addEventListener('hashchange', afficher);
await initialiser();
await afficher();

registerSW({ immediate: true });
