// Met l'application en ligne : construit le dossier dist puis l'envoie sur la branche gh-pages du dépôt GitHub.
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const lancer = (cmd, args, options = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...options });
const lire = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const depot = lire(['remote', 'get-url', 'origin']);
const nom = lire(['config', 'user.name']);
const mel = lire(['config', 'user.email']);

lancer(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { shell: true });
writeFileSync('dist/.nojekyll', '');
rmSync('dist/.git', { recursive: true, force: true });
const git = (...args) => lancer('git', args, { cwd: 'dist' });
git('init', '-q', '-b', 'gh-pages');
git('config', 'user.name', nom);
git('config', 'user.email', mel);
git('add', '-A');
git('commit', '-q', '-m', `Mise en ligne du ${new Date().toLocaleString('fr-FR')}`);
git('push', '-f', depot, 'gh-pages');
rmSync('dist/.git', { recursive: true, force: true });
console.log('Application envoyée. Elle est à jour en ligne dans une à deux minutes.');
