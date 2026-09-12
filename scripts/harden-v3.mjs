import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const patch = (file, from, to) => {
  const source = read(file);
  if (!source.includes(from)) throw new Error(`Patch target missing in ${file}`);
  write(file, source.replace(from, to));
};

// Remove retired cascade layers. Git history preserves them.
for (const file of ['css/style.css', 'css/enhance.css', 'css/cozy.css', 'css/fix.css']) {
  if (fs.existsSync(file)) fs.rmSync(file);
}

// Complete the audio contract used by boss and shield gameplay.
patch('js/audio.js',
  '  MobileAudio.prototype.wallBounce = function () {',
  `  MobileAudio.prototype.laser = function () {
    this.vibrate(12);
    if (!this.ctx || this.muted || !this.settings().sound) return;
    try {
      var n = this.ctx.currentTime;
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(1100, n);
      o.frequency.exponentialRampToValueAtTime(180, n + 0.12);
      g.gain.setValueAtTime(0.16, n);
      g.gain.exponentialRampToValueAtTime(0.001, n + 0.12);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(n); o.stop(n + 0.13);
    } catch (e) { console.warn("Laser SFX failed", e); }
  };
  MobileAudio.prototype.wallBounce = function () {`);

// Debounce synchronous storage writes and retain a last-known-good backup.
patch('js/save.js',
  '  function save() {\n    try { data.version = 1; localStorage.setItem(NEW_KEY, JSON.stringify(data)); } catch (e) {}\n  }',
  `  var saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer); saveTimer = 0;
    try {
      data.version = 2;
      var next = JSON.stringify(data);
      var previous = localStorage.getItem(NEW_KEY);
      if (previous) localStorage.setItem(NEW_KEY + "_backup", previous);
      localStorage.setItem(NEW_KEY, next);
      return true;
    } catch (e) {
      console.error("Progress could not be saved", e);
      return false;
    }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }
  window.addEventListener("pagehide", persist);
  document.addEventListener("visibilitychange", function () { if (document.hidden) persist(); });`);
patch('js/save.js',
  '  return { load: load, save: save, resetKeepSettings: resetKeepSettings,\n    get data() { return data; } }',
  '  return { load: load, save: save, flush: persist, resetKeepSettings: resetKeepSettings,\n    get data() { return data; } }');

// Persist the run coins displayed on successful campaign/puzzle/slingshot results.
patch('js/player.js',
  '    var xp = (r.pops || 0) * 2 + Math.floor((r.score || 0) / 20);\n    BB.Save.save();',
  '    var xp = (r.pops || 0) * 2 + Math.floor((r.score || 0) / 20);\n    if (mode === "LEVELS" || mode === "PUZZLE" || mode === "SLING") {\n      dd.coins = (dd.coins || 0) + coins;\n    }\n    BB.Save.save();');

// Use the correct soundtrack and stop reporting unpersisted failure rewards.
patch('js/engine2.js', 'try { BB.Music.play("blitz"); } catch (e) {}', 'try { BB.Music.play("sling"); } catch (e) {}');
patch('js/engine2.js',
  '    coins: (puzzleTotalBalloons - unpopped) * 2,\n    xp: (puzzleTotalBalloons - unpopped) * 3,',
  '    coins: 0,\n    xp: 0,');
patch('js/engine2.js',
  '    coins: (slingshotTotalBalloons - unpopped) * 2,\n    xp: (slingshotTotalBalloons - unpopped) * 3,',
  '    coins: 0,\n    xp: 0,');
patch('js/engine2.js',
  'var lastT = performance.now();',
  'var lastHudSecond = -1;\nvar lastT = performance.now();');
patch('js/engine2.js',
  '    } else updateHud();\n  }\n  requestAnimationFrame(loop);',
  '    } else {\n      var hudSecond = Math.ceil(timeLeft);\n      if (hudSecond !== lastHudSecond) { lastHudSecond = hudSecond; updateHud(); }\n    }\n  }\n  requestAnimationFrame(loop);');

// Restore visible Survival entry and remove the hidden compatibility control.
patch('index.html',
  '      <!-- Hidden button to keep survival event listener valid -->\n      <button id="btnPlayInfinite" style="display:none"></button>',
  `      <button class="hh-mode mode-survival" id="btnPlayInfinite" type="button">
        <span class="hh-mico">♾️</span>
        <span class="hh-mode-content">
          <span class="hh-mtitle">SURVIVAL</span>
          <span class="hh-mmeta" id="survivalMeta">3 lives • Endless waves</span>
        </span>
        <span class="hh-marrow" aria-hidden="true">›</span>
      </button>`);

// Make mode cards keyboard-operable without a risky markup-wide rewrite.
patch('js/ui.js',
  '  function bind() {\n    $("btnPlayPrimary")',
  `  function bind() {
    document.querySelectorAll(".hh-mode").forEach(function (el) {
      if (el.tagName !== "BUTTON") {
        el.setAttribute("role", "button"); el.setAttribute("tabindex", "0");
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
        });
      }
    });
    $("btnPlayPrimary")`);
patch('js/ui.js',
  '    $("mobileBottomHud").style.display = "none";',
  '    $("mobileBottomHud").style.display = playing ? "flex" : "none";');
patch('js/ui.js',
  '      else if (st.mode === "PUZZLE") BB.Engine.startPuzzle(st.puzzle);\n      else startLevel(currentLevelId);',
  '      else if (st.mode === "PUZZLE") BB.Engine.startPuzzle(st.puzzle);\n      else if (st.mode === "SLING") BB.Engine.startSlingshot(st.slingshot);\n      else startLevel(currentLevelId);');
patch('js/ui.js', '    $("mDashStars").innerText = stars + " / 30";', '    $("mDashStars").innerText = stars + " / 1605";');
patch('js/ui.js', '    setT("homeStars", stars + "⭐");', '    setT("homeStars", stars);');

// Allow the restored bottom gameplay HUD to render.
patch('css/app.css',
  '#mobileObjBanner, #mobileBottomHud { display: none !important; }',
  '#mobileObjBanner { display: none !important; }\n#mobileBottomHud {\n  position: fixed; left: 12px; right: 12px; bottom: calc(12px + var(--sab));\n  z-index: 15; align-items: center; gap: 12px; pointer-events: none;\n}');
patch('css/app.css', '.mode-blitz .hh-mico { background: #FFEBC4; }', '.mode-blitz .hh-mico { background: #FFEBC4; }\n.mode-survival .hh-mico { background: #E7E2F5; }');

// Restore browser zoom for accessibility.
patch('index.html',
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
  'width=device-width, initial-scale=1.0, viewport-fit=cover');

// Align install chrome with the current light sky theme.
const manifest = JSON.parse(read('manifest.json'));
manifest.name = 'Balloon Blitz V3 — Sky Realms';
manifest.short_name = 'Blitz V3';
manifest.start_url = './';
manifest.id = './';
manifest.display = 'standalone';
manifest.orientation = 'portrait-primary';
manifest.background_color = '#BCE7FF';
manifest.theme_color = '#8FD3FF';
write('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

// Atomic required-shell caching and controlled offline fallbacks.
write('sw.js', `const CACHE = "balloon-blitz-v3-1";
const CORE = ["./", "./index.html", "./manifest.json", "./css/app.css", "./data/content.js",
  "./js/save.js", "./js/audio.js", "./js/player.js", "./js/economy.js", "./js/achievements.js",
  "./js/rewards.js", "./js/leaderboard.js", "./js/music.js", "./js/sky.js", "./js/ads.js",
  "./js/engine.js", "./js/engine2.js", "./js/ui.js", "./js/main.js", "./js/fix.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put("./index.html", response.clone()));
      return response;
    }).catch(() => caches.match("./index.html").then(hit => hit || new Response("Offline", { status: 503 }))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => new Response("Offline", { status: 503 }))));
});
`);

write('package.json', JSON.stringify({
  name: 'balloon-blitz-v3', private: true, version: '3.0.0', type: 'module',
  scripts: { test: 'node tests/static-check.mjs' }
}, null, 2) + '\n');

write('tests/static-check.mjs', `import fs from "node:fs";
import vm from "node:vm";
const required = ["index.html", "manifest.json", "sw.js", "css/app.css", "data/content.js",
  "js/save.js", "js/audio.js", "js/player.js", "js/engine.js", "js/engine2.js", "js/ui.js"];
for (const file of required) if (!fs.existsSync(file)) throw new Error("Missing required file: " + file);
for (const file of fs.readdirSync("js").filter(f => f.endsWith(".js"))) {
  new vm.Script(fs.readFileSync("js/" + file, "utf8"), { filename: file });
}
const html = fs.readFileSync("index.html", "utf8");
for (const id of ["btnPlayInfinite", "mobileBottomHud", "gameCanvas"]) if (!html.includes('id="' + id + '"')) throw new Error("Missing UI contract: " + id);
const audio = fs.readFileSync("js/audio.js", "utf8");
if (!audio.includes("prototype.laser")) throw new Error("Audio contract incomplete");
const ui = fs.readFileSync("js/ui.js", "utf8");
if (!ui.includes('st.mode === "SLING"')) throw new Error("Slingshot restart contract incomplete");
console.log("Balloon Blitz V3 static verification passed");
`);

write('.github/workflows/ci.yml', `name: V3 CI
on:
  push:
    branches: [main, production-v3]
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm test
`);

write('README.md', `# Balloon Blitz V3

Production-hardening rewrite line for Balloon Blitz. V2 remains untouched.

## Included modes
- Campaign: 500 generated stages across 20 worlds
- Blitz: 60-second score attack
- Survival: endless waves with three lives
- Tactical Puzzle: 10 chain-reaction puzzles
- Slingshot: 25 physics stages

## V3 hardening
- Missing boss/shield audio contract fixed
- Survival restored to the main menu
- Fever and weapon HUD restored
- Campaign, puzzle and slingshot rewards persisted consistently
- Slingshot restart and soundtrack routing fixed
- Save writes debounced with a backup copy
- HUD timer DOM updates throttled
- Browser zoom restored
- Service-worker installation made atomic
- Retired CSS layers removed
- Automated static verification and CI added

## Development
Serve the repository over HTTP and open index.html. Run checks with:

\`\`\`bash
npm test
\`\`\`

## Architecture direction
V3 currently preserves the stable V2 gameplay baseline while critical defects are removed. The next refactor boundary is to replace shared globals and runtime monkey patches with ES modules and an explicit game-state machine.
`);

console.log('V3 hardening patches applied');
