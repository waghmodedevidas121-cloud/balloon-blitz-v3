import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CAMPAIGN_LENGTH, PUZZLE_LENGTH, SLINGSHOT_LENGTH, WORLDS, campaignStage, puzzleStage, slingshotStage, tracePuzzlePath } from '../js/content.js';
import { CAMPAIGN_LEVELS, PUZZLE_CATALOG, SLINGSHOT_CATALOG } from '../js/catalog.js';

const required = ['index.html', 'css/app.css', 'js/app.js', 'js/content.js', 'js/catalog.js', 'manifest.webmanifest', 'sw.js'];
required.push('assets/ui/play.png', 'assets/ui/back.png', 'assets/ui/profile.png', 'assets/ui/home.png', 'assets/ui/map.png', 'assets/ui/trophy.png', 'assets/ui/shop.png', 'assets/ui/settings.png', 'assets/ui/pause.png', 'assets/ui/medal.png');
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
for (const file of ['js/app.js', 'js/content.js', 'js/catalog.js', 'sw.js', 'tests/static-check.mjs']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));

const html = fs.readFileSync('index.html', 'utf8');
for (const id of ['game', 'home', 'hud', 'maps', 'shop', 'missions', 'profile', 'records', 'pause', 'result', 'settings', 'campaignProgress', 'campaignProgressText', 'campaignFillHud', 'worldPager', 'worldPrev', 'worldNext', 'worldOrdinal']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing UI contract: ${id}`);
}
if (html.includes('user-scalable=no')) throw new Error('Browser zoom must remain available');
for (const mode of ['blitz', 'survival', 'campaign', 'puzzle', 'slingshot']) if (!html.includes(`data-mode="${mode}"`)) throw new Error(`${mode} mode must be accessible`);
if (!html.includes('role="progressbar"')) throw new Error('Campaign objective needs an accessible progress indicator');

const app = fs.readFileSync('js/app.js', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
const css = fs.readFileSync('css/app.css', 'utf8');
if (!css.includes('@media (max-height: 700px)') || !css.includes('.stage-grid { max-height: 20vh; }')) throw new Error('The campaign launch card must remain visible on short viewports');
const bestCheck = app.indexOf('const isNewBest = score > save.best;');
const bestWrite = app.indexOf('save.best = Math.max(save.best, score);');
if (bestCheck < 0 || bestWrite < 0 || bestCheck > bestWrite) throw new Error('New personal-best results must be detected before saving the new best');
if (!app.includes('objectiveProgress >= campaignGoal')) throw new Error('Campaign completion must use the same objective target displayed by its progress bar');
if (!app.includes("event.target !== canvas || state !== 'playing'")) throw new Error('Gameplay input must ignore UI and non-playing pointer events');
if (!serviceWorker.includes('balloon-blitz-v3-6') || !serviceWorker.includes('./js/content.js') || !serviceWorker.includes('./js/catalog.js') || !serviceWorker.includes('./assets/ui/play.png')) throw new Error('Offline cache must version and include the stage catalog and UI assets');
if (CAMPAIGN_LENGTH !== 600 || PUZZLE_LENGTH !== 50 || SLINGSHOT_LENGTH !== 50 || WORLDS.length !== 24) throw new Error('Expected the complete V2 content catalog: 600 stages, 24 worlds, 50 puzzles, 50 slingshot stages');
if (CAMPAIGN_LEVELS.filter(stage => stage.isBoss).length !== 72 || CAMPAIGN_LEVELS.filter(stage => stage.isMidBoss).length !== 48 || CAMPAIGN_LEVELS.filter(stage => stage.isEscort).length !== 12 || SLINGSHOT_CATALOG.filter(stage => stage.bossHp).length !== 8) throw new Error('The V2 boss, mid-boss, escort, and slingshot-boss data must remain intact');
for (let stage = 1; stage <= CAMPAIGN_LENGTH; stage++) {
  const item = campaignStage(stage);
  if (item.id !== stage || item.target < 1 || !item.mission || item.moves < 1 || item.worldId !== Math.ceil(stage / 25)) throw new Error(`Campaign stage ${stage} is incomplete or in the wrong world`);
}
function solveWithDarts(stage) {
  const cleared = new Set();
  for (let dart = 0; dart < stage.darts && cleared.size < stage.nodes.length; dart++) {
    let bestPath = [];
    for (const node of stage.nodes) {
      if (cleared.has(node.id)) continue;
      const nodes = stage.nodes.map(item => ({ ...item, popped: cleared.has(item.id) }));
      const path = tracePuzzlePath({ nodes }, node.id).filter(id => !cleared.has(id));
      if (path.length > bestPath.length) bestPath = path;
    }
    if (!bestPath.length) break;
    for (const id of bestPath) cleared.add(id);
  }
  return cleared.size;
}
for (let stage = 1; stage <= PUZZLE_LENGTH; stage++) {
  const item = puzzleStage(stage);
  if (!item.nodes.length || item.darts < 1) throw new Error(`Puzzle stage ${stage} is incomplete`);
  const solved = solveWithDarts(item);
  if (solved !== item.nodes.length) throw new Error(`Puzzle stage ${stage} cannot be solved with its directional chain rules (${solved}/${item.nodes.length})`);
}
for (let stage = 1; stage <= SLINGSHOT_LENGTH; stage++) {
  const item = slingshotStage(stage);
  if (!item.targets.length || item.arrows < 1) throw new Error(`Slingshot stage ${stage} is incomplete`);
}
console.log('Balloon Blitz V3 verification passed: exact V2 catalog — 600 campaign stages across 24 worlds, 50 solvable puzzles, 50 slingshot challenges.');
