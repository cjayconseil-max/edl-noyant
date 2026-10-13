// Petits outils d'interface partagés

export const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function aujourdhui() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function dateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
export function euros(n) {
  return `${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
}
export function taille(octets) {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  if (octets < 1024 ** 3) return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${(octets / 1024 ** 3).toFixed(2).replace('.', ',')} Go`;
}

export const options = (liste, valeur, vide = null) => (vide === null ? '' : `<option value="">${e(vide)}</option>`)
  + liste.map((x) => `<option${x === valeur ? ' selected' : ''}>${e(x)}</option>`).join('');

export const classeEtat = (etat) => `etat-${String(etat || '').charAt(0) || '0'}`;
export const classePriorite = (p) => (p === 'Sécurité immédiate' ? 'prio-1' : p === 'À programmer cette année' ? 'prio-2' : 'prio-3');

let minuterie;
export function message(texte, type = 'info') {
  let zone = document.getElementById('message');
  if (!zone) { zone = document.createElement('div'); zone.id = 'message'; zone.setAttribute('role', 'status'); document.body.append(zone); }
  zone.textContent = texte;
  zone.className = `visible ${type}`;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => { zone.className = ''; }, type === 'erreur' ? 6000 : 2800);
}

/**
 * Confirmation dans la page : le bouton est remplacé par « Oui / Non ».
 * @returns Promise<boolean>
 */
export function confirmerSurPlace(bouton, question, libelleOui = 'Oui, supprimer') {
  return new Promise((resoudre) => {
    const boite = document.createElement('span');
    boite.className = 'confirmation';
    boite.innerHTML = `<span>${e(question)}</span><button type="button" class="btn danger">${e(libelleOui)}</button><button type="button" class="btn">Non</button>`;
    bouton.hidden = true;
    bouton.after(boite);
    const [oui, non] = boite.querySelectorAll('button');
    const fin = (v) => { boite.remove(); bouton.hidden = false; resoudre(v); };
    oui.addEventListener('click', () => fin(true));
    non.addEventListener('click', () => fin(false));
    non.focus();
  });
}

export function differe(fn, delai = 350) {
  let t;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delai); };
  f.maintenant = (...a) => { clearTimeout(t); return fn(...a); };
  return f;
}

// Adresses temporaires des images affichées, libérées à chaque changement d'écran.
const adresses = new Set();
export function adresseImage(blob) { const u = URL.createObjectURL(blob); adresses.add(u); return u; }
export function libererImages() { for (const u of adresses) URL.revokeObjectURL(u); adresses.clear(); }
