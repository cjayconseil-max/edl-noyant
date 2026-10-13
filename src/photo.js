// Photos : prise de vue, redimensionnement, incrustation, annotation au doigt, visionneuse.
import { e, confirmerSurPlace } from './ui.js';

const LARGEUR_MAX = 1600;
const QUALITE = 0.8;
const ROUGE = '#E0241B';

/** Charge un fichier image dans un canevas de 1600 px de large au plus (orientation de l'appareil respectée). */
export async function fichierVersCanevas(fichier) {
  let source;
  try { source = await createImageBitmap(fichier, { imageOrientation: 'from-image' }); } catch {
    source = await new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => ok(img); img.onerror = () => ko(new Error('Image illisible'));
      img.src = URL.createObjectURL(fichier);
    });
  }
  return reduire(source, source.width, source.height);
}

function reduire(source, l, h, max = LARGEUR_MAX) {
  const k = Math.min(1, max / l);
  const c = document.createElement('canvas');
  c.width = Math.round(l * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}

const versJpeg = (canevas, q = QUALITE) => new Promise((ok) => canevas.toBlob(ok, 'image/jpeg', q));

function positionGps() {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => ok(null), // refus ou échec : on continue sans coordonnées
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

function plein(html) {
  const d = document.createElement('div');
  d.className = 'plein';
  d.innerHTML = html;
  document.body.append(d);
  document.body.classList.add('fige');
  return { el: d, fermer: () => { d.remove(); document.body.classList.remove('fige'); } };
}

function tracer(ctx, f, ep) {
  ctx.save();
  ctx.strokeStyle = ROUGE; ctx.fillStyle = ROUGE; ctx.lineWidth = ep; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (f.type === 'cercle') {
    ctx.beginPath();
    ctx.ellipse((f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2, Math.max(4, Math.abs(f.x2 - f.x1) / 2), Math.max(4, Math.abs(f.y2 - f.y1) / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const a = Math.atan2(f.y2 - f.y1, f.x2 - f.x1); const t = ep * 4.5;
    ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2 - Math.cos(a) * t * 0.6, f.y2 - Math.sin(a) * t * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(f.x2, f.y2);
    ctx.lineTo(f.x2 - t * Math.cos(a - 0.45), f.y2 - t * Math.sin(a - 0.45));
    ctx.lineTo(f.x2 - t * Math.cos(a + 0.45), f.y2 - t * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function incruster(ctx, l, h, texte) {
  const bande = Math.max(34, Math.round(l * 0.042));
  ctx.save();
  ctx.fillStyle = 'rgba(11,31,58,0.78)';
  ctx.fillRect(0, h - bande, l, bande);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  let corps = Math.round(bande * 0.5);
  do { ctx.font = `700 ${corps}px Lato, Arial, sans-serif`; corps--; } while (ctx.measureText(texte).width > l - bande && corps > 9);
  ctx.fillText(texte, bande / 2, h - bande / 2 + 1);
  ctx.restore();
}

/**
 * Écran d'annotation avant enregistrement.
 * @returns Promise<{blob, mini, gps, pris}|null> (null si la photo est abandonnée)
 */
export function annoter(base, { commune, lieu, gpsActif }) {
  return new Promise((resoudre) => {
    const pris = new Date();
    const horodatage = `${pris.toLocaleDateString('fr-FR')} ${pris.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    let gps = null;
    const legende = () => [commune, lieu, horodatage, gps && `GPS ${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`].filter(Boolean).join('  ·  ');

    const { el, fermer } = plein(`
      <div class="barre-outils">
        <button type="button" class="btn" data-a="abandon">Abandonner</button>
        <span class="groupe">
          <button type="button" class="btn outil actif" data-outil="fleche" aria-pressed="true">↗ Flèche</button>
          <button type="button" class="btn outil" data-outil="cercle" aria-pressed="false">◯ Cercle</button>
          <button type="button" class="btn" data-a="retour" disabled>Effacer le dernier tracé</button>
        </span>
        <button type="button" class="btn primaire" data-a="ok">Enregistrer la photo</button>
      </div>
      <div class="zone-photo"><canvas aria-label="Photo à annoter : dessinez au doigt une flèche ou un cercle"></canvas></div>
      <p class="aide-photo">Facultatif : glissez le doigt sur la photo pour dessiner une flèche ou un cercle rouge.</p>`);
    const canevas = el.querySelector('canvas');
    canevas.width = base.width; canevas.height = base.height;
    const ctx = canevas.getContext('2d');
    const ep = Math.max(5, Math.round(base.width / 220));
    const formes = []; let outil = 'fleche'; let enCours = null;

    const dessiner = () => {
      ctx.drawImage(base, 0, 0);
      for (const f of formes) tracer(ctx, f, ep);
      if (enCours) tracer(ctx, enCours, ep);
      incruster(ctx, canevas.width, canevas.height, legende());
      el.querySelector('[data-a=retour]').disabled = !formes.length;
    };
    dessiner();
    if (gpsActif) positionGps().then((p) => { if (p && el.isConnected) { gps = p; dessiner(); } });

    const point = (ev) => {
      const r = canevas.getBoundingClientRect();
      return [(ev.clientX - r.left) * canevas.width / r.width, (ev.clientY - r.top) * canevas.height / r.height];
    };
    canevas.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); canevas.setPointerCapture(ev.pointerId);
      const [x, y] = point(ev); enCours = { type: outil, x1: x, y1: y, x2: x, y2: y };
    });
    canevas.addEventListener('pointermove', (ev) => { if (enCours) { [enCours.x2, enCours.y2] = point(ev); dessiner(); } });
    const lever = () => {
      if (!enCours) return;
      if (Math.hypot(enCours.x2 - enCours.x1, enCours.y2 - enCours.y1) > ep * 3) formes.push(enCours);
      enCours = null; dessiner();
    };
    canevas.addEventListener('pointerup', lever);
    canevas.addEventListener('pointercancel', () => { enCours = null; dessiner(); });

    el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.outil) {
        outil = b.dataset.outil;
        el.querySelectorAll('.outil').forEach((o) => { const a = o === b; o.classList.toggle('actif', a); o.setAttribute('aria-pressed', a); });
      } else if (b.dataset.a === 'retour') { formes.pop(); dessiner();
      } else if (b.dataset.a === 'abandon') { fermer(); resoudre(null);
      } else if (b.dataset.a === 'ok') {
        b.disabled = true; dessiner();
        const blob = await versJpeg(canevas);
        const mini = await versJpeg(reduire(canevas, canevas.width, canevas.height, 360), 0.7);
        fermer(); resoudre({ blob, mini, gps, pris: pris.getTime() });
      }
    });
  });
}

/** Viseur intégré (appareil arrière). @returns Promise<HTMLCanvasElement|null> */
export async function viseur() {
  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } });
  } catch { return 'refus'; }
  return new Promise((resoudre) => {
    const { el, fermer } = plein(`
      <div class="zone-photo"><video autoplay playsinline muted></video></div>
      <div class="barre-viseur">
        <button type="button" class="btn" data-a="fermer">Fermer</button>
        <button type="button" class="declencheur" data-a="clic" aria-label="Prendre la photo"></button>
        <span class="equilibre"></span>
      </div>`);
    const video = el.querySelector('video');
    video.srcObject = flux;
    const fin = (r) => { flux.getTracks().forEach((t) => t.stop()); fermer(); resoudre(r); };
    el.addEventListener('click', (ev) => {
      const a = ev.target.closest('button')?.dataset.a;
      if (a === 'fermer') fin(null);
      if (a === 'clic' && video.videoWidth) fin(reduire(video, video.videoWidth, video.videoHeight));
    });
  });
}

/** Photo en plein écran, avec suppression possible. */
export function visionneuse(photo, { onSupprimer } = {}) {
  const url = URL.createObjectURL(photo.blob);
  const { el, fermer } = plein(`
    <div class="barre-outils">
      <button type="button" class="btn" data-a="fermer">Fermer</button>
      <span class="nom-photo">${e(photo.nom)}</span>
      ${onSupprimer ? '<button type="button" class="btn danger" data-a="suppr">Supprimer la photo</button>' : '<span></span>'}
    </div>
    <div class="zone-photo"><img src="${url}" alt="Photo ${e(photo.nom)}"></div>`);
  const fin = () => { URL.revokeObjectURL(url); fermer(); };
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (b?.dataset.a === 'fermer') fin();
    if (b?.dataset.a === 'suppr' && await confirmerSurPlace(b, 'Supprimer cette photo ?')) { fin(); onSupprimer(); }
  });
}
