import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = ['index.html', 'css/app.css', 'js/app.js', 'manifest.webmanifest', 'sw.js'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

execFileSync(process.execPath, ['--check', 'js/app.js'], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', 'sw.js'], { stdio: 'inherit' });
JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));

const html = fs.readFileSync('index.html', 'utf8');
for (const id of ['game', 'home', 'hud', 'pause', 'result', 'settings']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing UI contract: ${id}`);
}
if (html.includes('user-scalable=no')) throw new Error('Browser zoom must remain available');
if (!html.includes('data-mode="survival"')) throw new Error('Survival mode must be accessible');

console.log('Balloon Blitz V3 verification passed');
