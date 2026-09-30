import {
  ACHIEVEMENTS, AVATARS, CAMPAIGN_LENGTH, COSMETICS, PUZZLE_LENGTH, SLINGSHOT_LENGTH, WORLDS,
  campaignStage, findPuzzleTarget, findPuzzleTargets, puzzleStage, slingshotStage
} from './content.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const clone = value => structuredClone(value);
const MODES = ['blitz', 'survival', 'campaign', 'puzzle', 'slingshot'];
const DEFAULT = {
  version: 3, best: 0, bestByMode: { blitz: 0, survival: 0, campaign: 0, puzzle: 0, slingshot: 0 },
  totalPops: 0, coins: 0, gems: 0, xp: 0, level: 1, maxCombo: 1,
  campaign: 1, campaignClears: {}, puzzleNext: 1, puzzleClears: {}, slingshotNext: 1, slingshotClears: {},
  inventory: { skins: ['classic'], effects: ['spark'] }, equipped: { skin: 'classic', effect: 'spark' },
  profile: { name: 'POPPER', avatar: '🎈' }, achievements: {},
  daily: { lastClaim: '', streak: 0, missionDate: '', missions: { pops: 0, score: 0, campaign: 0 }, claimed: {} },
  settings: { sound: true, haptics: true, reduced: false }
};

const Store = (() => {
  let data = clone(DEFAULT);
  let timer = 0;
  function normalize(input) {
    const next = clone(DEFAULT);
    if (!input || typeof input !== 'object') return next;
    for (const key of ['best', 'totalPops', 'coins', 'gems', 'xp', 'level', 'maxCombo', 'campaign', 'puzzleNext', 'slingshotNext']) {
      const n = Number(input[key]);
      if (Number.isFinite(n)) next[key] = Math.max(['level', 'campaign', 'puzzleNext', 'slingshotNext', 'maxCombo'].includes(key) ? 1 : 0, Math.floor(n));
    }
    next.campaign = Math.min(CAMPAIGN_LENGTH, next.campaign);
    next.puzzleNext = Math.min(PUZZLE_LENGTH, next.puzzleNext);
    next.slingshotNext = Math.min(SLINGSHOT_LENGTH, next.slingshotNext);
    next.bestByMode = { ...next.bestByMode, ...(input.bestByMode || {}) };
    for (const mode of MODES) next.bestByMode[mode] = Math.max(0, Number(next.bestByMode[mode]) || 0);
    for (const key of ['campaignClears', 'puzzleClears', 'slingshotClears', 'achievements']) {
      if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) next[key] = { ...input[key] };
    }
    if (input.inventory && typeof input.inventory === 'object') {
      next.inventory = { skins: Array.isArray(input.inventory.skins) ? input.inventory.skins.filter(x => typeof x === 'string') : ['classic'], effects: Array.isArray(input.inventory.effects) ? input.inventory.effects.filter(x => typeof x === 'string') : ['spark'] };
    }
    if (input.equipped && typeof input.equipped === 'object') next.equipped = { skin: String(input.equipped.skin || 'classic'), effect: String(input.equipped.effect || 'spark') };
    if (input.profile && typeof input.profile === 'object') {
      next.profile = { name: cleanName(input.profile.name), avatar: AVATARS.includes(input.profile.avatar) ? input.profile.avatar : '🎈' };
    }
    if (input.daily && typeof input.daily === 'object') {
      next.daily = { ...next.daily, ...input.daily, missions: { ...next.daily.missions, ...(input.daily.missions || {}) }, claimed: { ...(input.daily.claimed || {}) } };
    }
    next.settings = { ...next.settings, ...(input.settings || {}) };
    next.settings.sound = next.settings.sound !== false;
    next.settings.haptics = next.settings.haptics !== false;
    next.settings.reduced = next.settings.reduced === true;
    return next;
  }
  function load() {
    try { data = normalize(JSON.parse(localStorage.getItem('balloon_blitz_v3') || 'null')); }
    catch (error) { console.error('Save recovery', error); data = clone(DEFAULT); }
    return data;
  }
  function flush() {
    clearTimeout(timer);
    try { localStorage.setItem('balloon_blitz_v3', JSON.stringify(data)); return true; }
    catch (error) { console.error('Save failed', error); toast('Progress could not be saved'); return false; }
  }
  function save() { clearTimeout(timer); timer = setTimeout(flush, 250); }
  function reset() { data = clone(DEFAULT); flush(); }
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  return { load, save, flush, reset, get data() { return data; } };
})();

const Audio = (() => {
  let context;
  function init() {
    if (!Store.data.settings.sound) return null;
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)();
      if (context.state === 'suspended') context.resume();
      return context;
    } catch { return null; }
  }
  function tone(frequency = 460, duration = .08, wave = 'sine', volume = .1) {
    const audio = init();
    if (!audio) return;
    try {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * .6), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(now); oscillator.stop(now + duration + .01);
    } catch { /* sound is optional */ }
  }
  function pop(combo) { tone(360 + Math.min(combo, 12) * 34, .08); }
  function bad() { tone(145, .18, 'sawtooth', .12); }
  function win() { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, .18, 'triangle'), i * 65)); }
  return { init, pop, bad, win };
})();

let dpr = 1, width = 0, height = 0;
let state = 'home', mode = 'blitz', selected = 'blitz', mapMode = 'campaign', mapWorldIndex = 0;
let stageId = 1, selectedStage = { campaign: 1, puzzle: 1, slingshot: 1 };
let score = 0, combo = 1, bestCombo = 1, timeLeft = 60, lives = 3, popped = 0;
let campaignGoal = 14, objectiveProgress = 0, campaignObjective = null, campaignMovesLeft = 0, campaignSequenceIndex = 0, campaignHazardsHit = 0, escortBalloon = null, slowMoUntil = 0;
let balloons = [], particles = [], drops = [], puzzle = null, sling = null;
let raf = 0, lastTime = 0, hudSecond = -1, comboTimer = 0, feverCharge = 0, feverUntil = 0;
let currentWeapon = '', weaponUntil = 0, autoFireTimer = 0, aimPointer = null, runId = 0;

function cleanName(value) { return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'POPPER'; }
function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 1900);
}
function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize, { passive: true });
resize();

function setScreen(id) {
  for (const screenId of ['home', 'maps', 'shop', 'missions', 'profile', 'records', 'pause', 'result', 'settings']) {
    $(screenId).classList.toggle('hidden', screenId !== id);
  }
  const inGame = state === 'playing' || state === 'paused';
  $('hud').classList.toggle('hidden', !inGame);
  $('bottomNav').classList.toggle('hidden', inGame || ['pause', 'result', 'settings'].includes(id));
  canvas.style.display = inGame ? 'block' : 'none';
  document.body.classList.toggle('playing', state === 'playing');
  document.body.classList.toggle('fever-active', state === 'playing' && performance.now() < feverUntil);
  document.querySelectorAll('#bottomNav button').forEach(button => {
    const active = button.dataset.open === (id === 'settings' ? 'home' : id);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
}
function openScreen(id) {
  if (id === 'maps') renderMap();
  if (id === 'shop') renderShop();
  if (id === 'missions') renderRewards();
  if (id === 'profile') renderProfile();
  if (id === 'records') renderRecords();
  if (id === 'home') renderHome();
  state = 'home';
  setScreen(id);
}
function resizeProgressBar(element, value, max) {
  const pct = max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0;
  element.style.width = `${pct}%`;
}
function clearedCount(map) { return Object.values(map || {}).filter(value => Number(value) > 0).length; }
function maxUnlocked(map, fallback = 1, length = 50) {
  let highest = Math.max(1, Math.min(length, Number(fallback) || 1));
  while (highest < length && Number(map?.[highest]) > 0) highest++;
  return highest;
}
function rankFor(level) {
  if (level >= 12) return 'SKY LEGEND';
  if (level >= 8) return 'MASTER';
  if (level >= 5) return 'ACE POPPER';
  if (level >= 3) return 'SKILLED';
  return 'ROOKIE';
}
function dailyMissionState() {
  const today = dateKey(new Date());
  const daily = Store.data.daily;
  if (daily.missionDate !== today) {
    daily.missionDate = today;
    daily.missions = { pops: 0, score: 0, campaign: 0 };
    daily.claimed = {};
    Store.save();
  }
  return daily;
}
function renderHome() {
  const save = Store.data;
  $('best').textContent = save.best.toLocaleString();
  $('pops').textContent = save.totalPops.toLocaleString();
  $('coins').textContent = save.coins.toLocaleString();
  $('gems').textContent = save.gems.toLocaleString();
  $('headerName').textContent = save.profile.name;
  $('headerAvatar').textContent = save.profile.avatar;
  $('rank').textContent = `${rankFor(save.level)} · LV ${save.level}`;
  $('homeStars').textContent = (clearedCount(save.campaignClears) + clearedCount(save.puzzleClears) + clearedCount(save.slingshotClears)).toLocaleString();
  const campaign = campaignStage(save.campaign);
  $('campaignMeta').textContent = `Stage ${save.campaign} · ${campaign.mission}`;
  $('campaignProgressMeta').textContent = `${clearedCount(save.campaignClears)} / ${CAMPAIGN_LENGTH} cleared`;
  $('puzzleMeta').textContent = `${clearedCount(save.puzzleClears)} / ${PUZZLE_LENGTH} solved`;
  $('slingshotMeta').textContent = `${clearedCount(save.slingshotClears)} / ${SLINGSHOT_LENGTH} cleared`;
  $('blitzMeta').textContent = `Personal best · ${save.bestByMode.blitz.toLocaleString()}`;
  $('survivalMeta').textContent = `Personal best · ${save.bestByMode.survival.toLocaleString()}`;
  resizeProgressBar($('campaignFill'), clearedCount(save.campaignClears), CAMPAIGN_LENGTH);
  resizeProgressBar($('puzzleFill'), clearedCount(save.puzzleClears), PUZZLE_LENGTH);
  resizeProgressBar($('slingshotFill'), clearedCount(save.slingshotClears), SLINGSHOT_LENGTH);
  resizeProgressBar($('blitzFill'), save.bestByMode.blitz, 5000);
  resizeProgressBar($('survivalFill'), save.bestByMode.survival, 5000);
  const daily = dailyMissionState();
  $('dailyBadge').textContent = daily.lastClaim === dateKey(new Date()) ? 'DONE' : 'FREE';
}

function currentMapLength() {
  return mapMode === 'campaign' ? CAMPAIGN_LENGTH : mapMode === 'puzzle' ? PUZZLE_LENGTH : SLINGSHOT_LENGTH;
}
function currentMapProgress() {
  const save = Store.data;
  if (mapMode === 'campaign') return { map: save.campaignClears, next: save.campaign };
  if (mapMode === 'puzzle') return { map: save.puzzleClears, next: save.puzzleNext };
  return { map: save.slingshotClears, next: save.slingshotNext };
}
function selectStage(id) {
  selectedStage[mapMode] = id;
  if (mapMode === 'campaign') mapWorldIndex = Math.floor((id - 1) / 25);
  renderMap();
}
function pageCampaignWorld(direction) {
  mapWorldIndex = Math.max(0, Math.min(WORLDS.length - 1, mapWorldIndex + direction));
  const first = mapWorldIndex * 25 + 1;
  const next = currentMapProgress().next;
  selectedStage.campaign = Math.min(first + 24, Math.max(first, Math.min(next, first + 24)));
  renderMap();
}
function renderMap() {
  const length = currentMapLength();
  const { map, next } = currentMapProgress();
  const chosen = Math.max(1, Math.min(length, selectedStage[mapMode] || next || 1));
  selectedStage[mapMode] = chosen;
  const campaignMap = mapMode === 'campaign';
  if (campaignMap) mapWorldIndex = Math.floor((chosen - 1) / 25);
  const grid = $('stageGrid');
  grid.replaceChildren();
  const world = mapMode === 'campaign' ? campaignStage(chosen) : null;
  $('worldIcon').textContent = world?.icon || (mapMode === 'puzzle' ? '🧩' : '🏹');
  $('worldName').textContent = world?.world || (mapMode === 'puzzle' ? 'Arrow Circuit Workshop' : 'Cloudshot Range');
  $('worldPager').classList.toggle('hidden', !campaignMap);
  $('worldOrdinal').textContent = campaignMap ? `WORLD ${mapWorldIndex + 1} OF ${WORLDS.length} · STAGES ${mapWorldIndex * 25 + 1}–${Math.min(CAMPAIGN_LENGTH, (mapWorldIndex + 1) * 25)}` : '';
  $('worldPrev').disabled = !campaignMap || mapWorldIndex === 0;
  $('worldNext').disabled = !campaignMap || mapWorldIndex >= WORLDS.length - 1;
  $('mapProgress').textContent = `${clearedCount(map)} / ${length} cleared · ${Math.min(next, length)} next`;
  $('mapProgress').setAttribute('aria-live', 'polite');
  document.querySelectorAll('[data-map]').forEach(tab => {
    const active = tab.dataset.map === mapMode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  const firstStage = campaignMap ? mapWorldIndex * 25 + 1 : 1;
  const lastStage = campaignMap ? Math.min(length, firstStage + 24) : length;
  for (let id = firstStage; id <= lastStage; id++) {
    const unlocked = id <= next || Number(map[id]) > 0;
    const stage = campaignMap ? campaignStage(id) : null;
    const isBoss = Boolean(stage?.isBoss || stage?.isMidBoss);
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `stage-tile${id === chosen ? ' selected' : ''}${Number(map[id]) > 0 ? ' cleared' : ''}${isBoss ? ' boss' : ''}`;
    tile.disabled = !unlocked;
    tile.setAttribute('aria-label', `${stage?.isBoss ? 'boss ' : stage?.isMidBoss ? 'mid-boss ' : ''}${mapMode} stage ${id}${unlocked ? (map[id] ? `, ${map[id]} stars` : ', unlocked') : ', locked'}`);
    tile.innerHTML = `<span>${unlocked ? id : '🔒'}</span><small>${Number(map[id]) > 0 ? '★'.repeat(Math.min(3, Number(map[id]))) : (stage?.isBoss ? '👑 BOSS' : stage?.isMidBoss ? '💀 MINI-BOSS' : stage?.kind === 'escort' ? '🎈 ESCORT' : '')}</small>`;
    if (unlocked) tile.addEventListener('click', () => selectStage(id));
    grid.appendChild(tile);
  }
  const mission = mapMode === 'campaign' ? campaignStage(chosen) : mapMode === 'puzzle' ? puzzleStage(chosen) : slingshotStage(chosen);
  $('missionKicker').textContent = mapMode === 'campaign' ? `STAGE ${chosen} · CAMPAIGN` : mapMode === 'puzzle' ? `PUZZLE ${chosen} · ${mission.darts} DART${mission.darts === 1 ? '' : 'S'}` : `SLINGSHOT ${chosen} · ${mission.arrows} ARROWS`;
  $('missionTitle').textContent = mapMode === 'campaign' ? mission.mission : mission.name;
  $('missionDesc').textContent = mapMode === 'campaign'
    ? `${mission.icon} ${mission.world} · ${mission.moves} moves · Clear the objective to earn up to 3 stars.`
    : mission.desc;
  $('launchStage').textContent = `▶ ${mapMode === 'campaign' ? 'PLAY' : mapMode === 'puzzle' ? 'SOLVE' : 'SHOOT'} STAGE ${chosen}`;
  $('launchStage').disabled = !(chosen <= next || Number(map[chosen]) > 0);
}
function renderShop() {
  $('shopCoins').textContent = Store.data.coins.toLocaleString();
  $('shopGems').textContent = Store.data.gems.toLocaleString();
  for (const [type, hostId] of [['skins', 'skinList'], ['effects', 'effectList']]) {
    const host = $(hostId);
    host.replaceChildren();
    for (const item of COSMETICS[type]) {
      const owned = Store.data.inventory[type].includes(item.id);
      const equipped = Store.data.equipped[type === 'skins' ? 'skin' : 'effect'] === item.id;
      const price = item.price.coins ? `🪙 ${item.price.coins}` : item.price.gems ? `💎 ${item.price.gems}` : 'FREE';
      const row = document.createElement('article');
      row.className = 'shop-item';
      const swatch = document.createElement('div');
      swatch.className = 'shop-swatch';
      if (type === 'skins') {
        const color = Object.values(item.colors)[0];
        swatch.style.background = `radial-gradient(circle at 35% 30%, #fff 0 13%, ${color} 15% 72%, #6d563a 74%)`;
      } else swatch.textContent = item.id === 'orbit' ? '🫧' : item.id === 'comet' ? '☄️' : '✨';
      const info = document.createElement('div'); info.className = 'shop-info';
      const title = document.createElement('b'); title.textContent = item.name;
      const detail = document.createElement('small'); detail.textContent = type === 'skins' ? 'Changes your balloon palette' : 'Changes your pop burst style';
      info.append(title, detail);
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : price;
      button.classList.toggle('item-cost', !owned);
      button.addEventListener('click', () => purchaseItem(type, item));
      row.append(swatch, info, button); host.appendChild(row);
    }
  }
}
function purchaseItem(type, item) {
  const owned = Store.data.inventory[type].includes(item.id);
  const equipKey = type === 'skins' ? 'skin' : 'effect';
  if (!owned) {
    if ((Store.data.coins || 0) < (item.price.coins || 0) || (Store.data.gems || 0) < (item.price.gems || 0)) {
      toast('Earn a few more coins or daily gems first'); return;
    }
    Store.data.coins -= item.price.coins || 0;
    Store.data.gems -= item.price.gems || 0;
    Store.data.inventory[type].push(item.id);
  }
  Store.data.equipped[equipKey] = item.id;
  Store.flush(); renderShop(); renderHome(); toast(owned ? `${item.name} equipped` : `${item.name} unlocked`);
}

const DAILY_REWARDS = [
  { coins: 50 }, { coins: 100 }, { coins: 150 }, { gems: 2 },
  { coins: 250 }, { coins: 400 }, { coins: 800, gems: 5 }
];
const DAILY_MISSIONS = [
  { id: 'pops', icon: '🎈', title: 'Warm-up lap', description: 'Pop 25 balloons today.', target: 25, reward: 50, unit: 'pops' },
  { id: 'score', icon: '🏆', title: 'High flyer', description: 'Score 1,000 points in a run.', target: 1000, reward: 60, unit: 'points' },
  { id: 'campaign', icon: '🎯', title: 'Map maker', description: 'Clear a campaign stage.', target: 1, reward: 75, unit: 'stage' }
];
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function previousDate(key) {
  if (!key) return '';
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}
function dailyRewardFor(streak) { return DAILY_REWARDS[(Math.max(1, streak) - 1) % DAILY_REWARDS.length]; }
function rewardText(reward) { return `${reward.coins ? `🪙 ${reward.coins}` : ''}${reward.coins && reward.gems ? ' + ' : ''}${reward.gems ? `💎 ${reward.gems}` : ''}`; }
function renderRewards() {
  const daily = dailyMissionState();
  const today = dateKey(new Date());
  const available = daily.lastClaim !== today;
  const streak = available ? (daily.lastClaim === previousDate(today) ? Math.max(0, daily.streak) + 1 : 1) : Math.max(1, daily.streak);
  const reward = dailyRewardFor(streak);
  $('dailyTitle').textContent = available ? `Day ${streak} parcel` : 'Parcel collected!';
  $('dailyCopy').textContent = available ? `A ${rewardText(reward)} gift is ready. Keep your streak going by visiting tomorrow.` : `Day ${daily.streak} collected. Your next gift is waiting tomorrow.`;
  $('claimDaily').disabled = !available;
  $('claimDaily').textContent = available ? `🎁 CLAIM ${rewardText(reward)}` : '✓ CLAIMED TODAY';
  const calendar = $('rewardCalendar'); calendar.replaceChildren();
  for (let day = 1; day <= 7; day++) {
    const amount = dailyRewardFor(day);
    const cell = document.createElement('div');
    cell.className = `reward-day${day === streak && available ? ' ready' : ''}${!available && day <= daily.streak ? ' claimed' : ''}`;
    cell.innerHTML = `<b>DAY ${day}</b><small>${amount.gems ? `💎${amount.gems}` : `🪙${amount.coins}`}</small>`;
    calendar.appendChild(cell);
  }
  const missions = dailyMissionState();
  const list = $('missionList'); list.replaceChildren();
  for (const item of DAILY_MISSIONS) {
    const progress = Math.min(item.target, Number(missions.missions[item.id]) || 0);
    const claimed = missions.claimed[item.id] === true;
    const row = document.createElement('article'); row.className = 'mission-row';
    const icon = document.createElement('div'); icon.className = 'mission-icon'; icon.textContent = item.icon;
    const info = document.createElement('div'); info.className = 'mission-info';
    const title = document.createElement('b'); title.textContent = item.title;
    const detail = document.createElement('small'); detail.textContent = `${item.description} ${progress}/${item.target} · 🪙 ${item.reward}`;
    const bar = document.createElement('div'); bar.className = 'progress-track';
    const fill = document.createElement('span'); resizeProgressBar(fill, progress, item.target); bar.appendChild(fill);
    info.append(title, detail, bar);
    const button = document.createElement('button'); button.type = 'button'; button.textContent = claimed ? 'DONE' : progress >= item.target ? 'CLAIM' : 'IN FLIGHT';
    button.disabled = claimed || progress < item.target;
    button.addEventListener('click', () => claimMission(item));
    row.append(icon, info, button); list.appendChild(row);
  }
  const achievementList = $('achievementList'); achievementList.replaceChildren();
  for (const achievement of ACHIEVEMENTS) {
    const unlocked = Boolean(Store.data.achievements[achievement.id]);
    const row = document.createElement('article'); row.className = 'achievement-row';
    const icon = document.createElement('div'); icon.className = 'achievement-icon'; icon.textContent = achievement.icon;
    const info = document.createElement('div'); info.className = 'achievement-info';
    const title = document.createElement('b'); title.textContent = achievement.name;
    const detail = document.createElement('small'); detail.textContent = `${achievement.description}${unlocked ? ' · Reward collected' : ` · 🪙 ${achievement.coins}`}`;
    info.append(title, detail); row.append(icon, info); achievementList.appendChild(row);
  }
}
function claimDaily() {
  const daily = Store.data.daily;
  const today = dateKey(new Date());
  if (daily.lastClaim === today) return;
  daily.streak = daily.lastClaim === previousDate(today) ? (daily.streak % DAILY_REWARDS.length) + 1 : 1;
  daily.lastClaim = today;
  const reward = dailyRewardFor(daily.streak);
  Store.data.coins += reward.coins || 0;
  Store.data.gems += reward.gems || 0;
  Store.flush(); renderRewards(); renderHome(); toast(`Daily gift collected · ${rewardText(reward)}`);
}
function claimMission(item) {
  const daily = dailyMissionState();
  if (daily.claimed[item.id] || Number(daily.missions[item.id]) < item.target) return;
  daily.claimed[item.id] = true;
  Store.data.coins += item.reward;
  Store.flush(); renderRewards(); renderHome(); toast(`Mission complete · +${item.reward} coins`);
}
function renderProfile() {
  const profile = Store.data.profile;
  $('profileName').value = profile.name;
  $('profilePreview').textContent = profile.avatar;
  $('profileRank').textContent = rankFor(Store.data.level);
  const floor = Math.max(0, (Store.data.level - 1) ** 2 * 150);
  const ceiling = Store.data.level >= 12 ? Store.data.xp : Store.data.level ** 2 * 150;
  $('profileLevel').textContent = `LEVEL ${Store.data.level} · ${Store.data.xp.toLocaleString()} XP`;
  resizeProgressBar($('xpFill'), Store.data.xp - floor, Math.max(1, ceiling - floor));
  const grid = $('avatarGrid'); grid.replaceChildren();
  for (const avatar of AVATARS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `avatar-choice${avatar === profile.avatar ? ' selected' : ''}`;
    button.textContent = avatar; button.setAttribute('aria-label', `Choose ${avatar} avatar`);
    button.addEventListener('click', () => { Store.data.profile.avatar = avatar; $('profilePreview').textContent = avatar; grid.querySelectorAll('button').forEach(item => item.classList.toggle('selected', item === button)); });
    grid.appendChild(button);
  }
  const stats = $('profileStats'); stats.replaceChildren();
  const rows = [
    [Store.data.totalPops.toLocaleString(), 'Total pops'],
    [clearedCount(Store.data.campaignClears), 'Campaign cleared'],
    [clearedCount(Store.data.puzzleClears), 'Puzzles solved'],
    [clearedCount(Store.data.slingshotClears), 'Slingshot stages']
  ];
  for (const [value, label] of rows) { const tile = document.createElement('div'); tile.innerHTML = `<b>${value}</b><small>${label}</small>`; stats.appendChild(tile); }
}
function saveProfile() {
  Store.data.profile.name = cleanName($('profileName').value);
  $('profileName').value = Store.data.profile.name;
  Store.flush(); renderProfile(); renderHome(); toast('Profile saved');
}
function renderRecords() {
  const labels = [
    ['blitz', '⚡', 'Blitz'], ['survival', '♾️', 'Survival'], ['campaign', '🎯', 'Campaign'],
    ['puzzle', '🧩', 'Puzzle'], ['slingshot', '🏹', 'Slingshot']
  ];
  const host = $('recordList'); host.replaceChildren();
  for (const [id, icon, name] of labels) {
    const row = document.createElement('article'); row.className = 'record-row';
    const badge = document.createElement('span'); badge.className = 'record-icon'; badge.textContent = icon;
    const info = document.createElement('div'); info.className = 'record-info';
    const title = document.createElement('b'); title.textContent = name;
    const detail = document.createElement('small'); detail.textContent = id === 'blitz' ? 'Highest score in 60 seconds' : id === 'survival' ? 'Best score before your lives run out' : id === 'campaign' ? 'Best campaign run' : id === 'puzzle' ? 'Best puzzle run' : 'Best cloudshot run';
    const scoreNode = document.createElement('span'); scoreNode.className = 'record-score'; scoreNode.textContent = (Store.data.bestByMode[id] || 0).toLocaleString();
    info.append(title, detail); row.append(badge, info, scoreNode); host.appendChild(row);
  }
}

function palette() {
  return COSMETICS.skins.find(item => item.id === Store.data.equipped.skin)?.colors || COSMETICS.skins[0].colors;
}
function randomColor() {
  const keys = ['RED', 'BLUE', 'GREEN', 'PINK', 'GOLD', 'VIOLET'];
  return keys[Math.floor(Math.random() * keys.length)];
}
function makeBalloon(initial = false, kindOverride = null) {
  const objective = mode === 'campaign' ? campaignObjective : null;
  let kind = kindOverride || 'normal';
  let colorKey = randomColor();
  if (!kindOverride && objective) {
    if (objective.isBoss || objective.isMidBoss) kind = 'boss';
    else if (objective.kind === 'gold' && Math.random() < .36) kind = 'gold';
    else if (objective.kind === 'bomb' && Math.random() < .36) kind = 'bomb';
    else if (objective.kind === 'shield' && Math.random() < .62) kind = 'shield';
    else if (objective.kind === 'freeze' && Math.random() < .38) kind = 'freeze';
    else if (objective.kind === 'color') {
      colorKey = objective.color;
      if (colorKey === 'GOLD') kind = 'gold';
    } else if (objective.kind === 'sequence' && objective.sequence.length) {
      colorKey = Math.random() < .38 ? objective.sequence[campaignSequenceIndex % objective.sequence.length] : randomColor();
    } else if (objective.hasHazards && Math.random() < .065) kind = 'hazard';
  } else if (!kindOverride) {
    const roll = Math.random();
    if (roll < .075) kind = 'gold';
    else if (roll < .115) kind = 'bomb';
    else if (roll < .145) kind = 'gift';
  }
  if (objective?.isBoss || objective?.isMidBoss) kind = 'boss';
  if (kind === 'boss') colorKey = 'GOLD';
  const r = kind === 'boss' ? Math.min(62, Math.max(45, Math.min(width, height) * .095)) : 21 + Math.random() * 11;
  const maxX = Math.max(r + 2, width - r - 2);
  const hp = kind === 'boss' ? campaignGoal : 1;
  return {
    x: r + Math.random() * Math.max(1, maxX - r),
    y: initial ? r + Math.random() * Math.max(1, height - r * 2) : height + r + Math.random() * 55,
    r, speed: kind === 'boss' ? 20 + Math.random() * 12 : (50 + Math.random() * 70 + (mode === 'survival' ? popped * .08 : 0)) * (objective?.speedMult || 1),
    colorKey, color: kind === 'hazard' ? '#554d63' : palette()[colorKey] || '#ed625a', kind, phase: Math.random() * 6,
    hp, maxHp: hp, shield: kind === 'shield' || Boolean(objective?.hasShields) ? 1 : 0, popped: false
  };
}

function resetRun(nextMode, selectedId = 1) {
  cancelAnimationFrame(raf); runId++;
  mode = nextMode; selected = nextMode; stageId = selectedId;
  score = 0; combo = 1; bestCombo = 1; comboTimer = 0; popped = 0; lives = 3;
  feverCharge = 0; feverUntil = 0; currentWeapon = ''; weaponUntil = 0; autoFireTimer = 0;
  particles = []; drops = []; balloons = []; puzzle = null; sling = null; aimPointer = null;
  objectiveProgress = 0; hudSecond = -1; campaignObjective = null; campaignMovesLeft = 0; campaignSequenceIndex = 0; campaignHazardsHit = 0; escortBalloon = null; slowMoUntil = 0;
  if (mode === 'campaign') {
    campaignObjective = campaignStage(stageId); campaignGoal = campaignObjective.target; campaignMovesLeft = campaignObjective.moves; timeLeft = Infinity;
    if (campaignObjective.isBoss || campaignObjective.isMidBoss) balloons = [makeBalloon(true, 'boss')];
    else if (campaignObjective.escort) {
      campaignGoal = 1;
      escortBalloon = { x: width * .5, y: height * .86, startY: height * .86, endY: height * .17, r: 19, hp: 3 };
      balloons = Array.from({ length: Math.min(19, Math.max(12, Math.floor(width / 45))) }, () => makeBalloon(true));
    } else balloons = Array.from({ length: Math.min(20, Math.max(12, Math.floor(width / 45))) }, () => makeBalloon(true));
  } else if (mode === 'puzzle') {
    puzzle = puzzleStage(stageId); puzzle.dartsLeft = puzzle.darts;
    puzzle.nodes = puzzle.nodes.map(node => ({ ...node, popped: false })); timeLeft = 0;
  } else if (mode === 'slingshot') {
    sling = slingshotStage(stageId); sling.arrowsLeft = sling.arrows; sling.shots = [];
    sling.targets = sling.targets.map(target => ({ ...target, popped: false })); timeLeft = 0;
  } else {
    timeLeft = mode === 'blitz' ? 60 : Infinity;
    balloons = Array.from({ length: Math.min(22, Math.max(14, Math.floor(width / 43))) }, () => makeBalloon(true));
  }
  Audio.init(); updateHud(true); state = 'playing'; setScreen(null);
  lastTime = performance.now(); raf = requestAnimationFrame(loop);
}
function start(nextMode = selected, selectedId) {
  if (nextMode === 'campaign' || nextMode === 'puzzle' || nextMode === 'slingshot') {
    mapMode = nextMode; selectedStage[nextMode] = selectedId || maxUnlocked(currentMapProgressFor(nextMode).map, currentMapProgressFor(nextMode).next, nextMode === 'campaign' ? CAMPAIGN_LENGTH : 50);
    openScreen('maps'); return;
  }
  resetRun(nextMode, 1);
}
function currentMapProgressFor(targetMode) {
  const save = Store.data;
  if (targetMode === 'campaign') return { map: save.campaignClears, next: save.campaign };
  if (targetMode === 'puzzle') return { map: save.puzzleClears, next: save.puzzleNext };
  return { map: save.slingshotClears, next: save.slingshotNext };
}
function launchSelectedStage() { resetRun(mapMode, selectedStage[mapMode] || 1); }

function updateHud(force = false) {
  $('score').textContent = score.toLocaleString();
  $('combo').textContent = `×${combo}`;
  $('modeLabel').textContent = mode === 'campaign' ? `STAGE ${stageId}` : mode === 'puzzle' ? `PUZZLE ${stageId}` : mode === 'slingshot' ? `SLING ${stageId}` : mode.toUpperCase();
  if (mode === 'survival') { $('targetLabel').textContent = 'LIVES'; $('target').textContent = lives > 0 ? '❤️'.repeat(lives) : '💔'; }
  else if (mode === 'puzzle') { $('targetLabel').textContent = 'DARTS'; $('target').textContent = String(puzzle?.dartsLeft ?? 0); }
  else if (mode === 'slingshot') { $('targetLabel').textContent = 'ARROWS'; $('target').textContent = String(sling?.arrowsLeft ?? 0); }
  else if (mode === 'campaign') { $('targetLabel').textContent = 'MOVES'; $('target').textContent = String(campaignMovesLeft); }
  else { $('targetLabel').textContent = 'TIME'; $('target').textContent = String(Math.max(0, Math.ceil(timeLeft))); }
  const progress = $('campaignProgress');
  const showProgress = mode === 'campaign';
  progress.classList.toggle('hidden', !showProgress);
  if (showProgress) {
    const amount = Math.min(objectiveProgress, campaignGoal);
    $('campaignProgressLabel').textContent = `STAGE GOAL · ${campaignObjective.kind.toUpperCase()}`;
    $('campaignProgressText').textContent = campaignObjective.escort ? `${Math.floor(amount * 100)}% · ${'❤️'.repeat(escortBalloon?.hp || 0)}` : `${amount} / ${campaignGoal}`;
    progress.setAttribute('aria-valuemax', String(campaignGoal));
    progress.setAttribute('aria-valuenow', String(amount));
    progress.setAttribute('aria-valuetext', campaignObjective.escort ? `${Math.floor(amount * 100)} percent escort progress, ${escortBalloon?.hp || 0} hearts remaining` : `${amount} of ${campaignGoal} ${campaignObjective.mission.toLowerCase()}`);
    resizeProgressBar($('campaignFillHud'), amount, campaignGoal);
  }
  $('feverPercent').textContent = `${Math.floor(feverCharge)}%`;
  $('feverLabel').textContent = performance.now() < feverUntil ? '🔥 FEVER x2' : '🔥 FEVER';
  resizeProgressBar($('feverFill'), feverCharge, 100);
  const activeWeapon = performance.now() < weaponUntil ? currentWeapon : '';
  const weaponNames = { gatling: '⚡ Gatling burst', triple: '🎯 Triple pop', laser: '🔆 Sky laser' };
  $('weaponIcon').textContent = activeWeapon ? (activeWeapon === 'gatling' ? '⚡' : activeWeapon === 'triple' ? '🎯' : '🔆') : '👆';
  const sequenceNext = mode === 'campaign' && campaignObjective.kind === 'sequence' && campaignObjective.sequence.length ? ` · Next: ${campaignObjective.sequence[campaignSequenceIndex % campaignObjective.sequence.length]}` : '';
  $('gameHint').textContent = mode === 'puzzle' ? (puzzle?.desc || 'Follow the arrows') : mode === 'slingshot' ? 'Pull back to aim · release to shoot' : activeWeapon ? weaponNames[activeWeapon] : mode === 'campaign' ? `${campaignObjective.mission}${sequenceNext}${campaignObjective.escort ? ' · Protect the traveler' : ''}` : 'Tap or drag through balloons';
  $('dartCount').textContent = mode === 'puzzle' ? `🎯 ${puzzle?.dartsLeft ?? 0}` : mode === 'slingshot' ? `🏹 ${sling?.arrowsLeft ?? 0}` : '';
  if (force) hudSecond = Math.ceil(timeLeft);
}

function addParticles(x, y, color, count = 11) {
  const reduced = Store.data.settings.reduced;
  const total = reduced ? Math.min(4, count) : count;
  for (let i = 0; i < total; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 55 + Math.random() * 150;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, life: .65 + Math.random() * .45, size: 3 + Math.random() * 3 });
  }
  if (particles.length > 320) particles.splice(0, particles.length - 320);
}
function updateProgressForPop(balloon) {
  if (mode !== 'campaign') return;
  if (campaignObjective.kind === 'pop') objectiveProgress++;
  else if (campaignObjective.kind === 'color' && balloon.colorKey === campaignObjective.color) objectiveProgress++;
  else if (campaignObjective.kind === 'gold' && balloon.kind === 'gold') objectiveProgress++;
  else if (campaignObjective.kind === 'bomb' && balloon.kind === 'bomb') objectiveProgress++;
  else if (campaignObjective.kind === 'freeze' && balloon.kind === 'freeze') objectiveProgress++;
  else if (campaignObjective.kind === 'sequence' && campaignObjective.sequence.length && balloon.colorKey === campaignObjective.sequence[campaignSequenceIndex % campaignObjective.sequence.length]) {
    campaignSequenceIndex++; objectiveProgress++;
  }
}
function addScore(points) {
  score += Math.round(points * combo * (performance.now() < feverUntil ? 2 : 1));
}
function recordPop(balloon, x, y, allowBomb = true) {
  if (!balloon || balloon.popped || state !== 'playing') return;
  if (balloon.kind === 'boss') {
    balloon.hp--;
    if (mode === 'campaign' && (campaignObjective.isBoss || campaignObjective.isMidBoss)) objectiveProgress++;
    addScore(28); Audio.pop(combo);
    addParticles(x, y, '#f2bb3f', 8);
    combo++; bestCombo = Math.max(bestCombo, combo); comboTimer = 2.4;
    if (balloon.hp <= 0) { balloon.popped = true; popped++; }
    updateHud();
    if (mode === 'campaign' && objectiveProgress >= campaignGoal) finish(true);
    return;
  }
  balloon.popped = true; popped++;
  if (balloon.kind === 'freeze') { slowMoUntil = performance.now() + 4500; toast('SLOW-MO! · 4.5 seconds'); }
  updateProgressForPop(balloon);
  addScore(balloon.kind === 'gold' ? 100 : balloon.kind === 'bomb' ? 60 : balloon.kind === 'gift' ? 80 : 20);
  Audio.pop(combo);
  if (Store.data.settings.haptics && navigator.vibrate) navigator.vibrate(9);
  addParticles(x, y, balloon.color, balloon.kind === 'bomb' ? 22 : 12);
  combo++; bestCombo = Math.max(bestCombo, combo);
  feverCharge = Math.min(100, feverCharge + (balloon.kind === 'gold' ? 17 : balloon.kind === 'bomb' ? 13 : 8));
  if (feverCharge >= 100 && performance.now() >= feverUntil) {
    feverUntil = performance.now() + 8000;
    toast('FEVER! Double points for 8 seconds');
  }
  if (balloon.kind === 'gift') addDrop(x, y);
  if (balloon.kind === 'bomb' && allowBomb) {
    for (const neighbor of balloons) {
      if (!neighbor.popped && neighbor !== balloon && Math.hypot(neighbor.x - x, neighbor.y - y) < (mode === 'campaign' ? 180 : 125)) recordPop(neighbor, neighbor.x, neighbor.y, false);
    }
  }
  if (popped > 0 && popped % 12 === 0 && !['puzzle', 'slingshot'].includes(mode)) addDrop(x, y);
  comboTimer = 2.4;
  updateHud();
  if (mode === 'campaign' && objectiveProgress >= campaignGoal) { finish(true); return; }
}
function addDrop(x, y) {
  const pool = mode === 'survival' ? ['gatling', 'triple', 'laser', 'life'] : ['gatling', 'triple', 'laser', 'time'];
  drops.push({ x, y, y0: y, type: pool[Math.floor(Math.random() * pool.length)], r: 20, life: 8, phase: 0 });
}
function collectDrop(drop) {
  drop.life = 0;
  Audio.win();
  if (drop.type === 'time') { timeLeft += 12; toast('+12 seconds'); }
  else if (drop.type === 'life') { lives = Math.min(5, lives + 1); toast('+1 life'); }
  else { currentWeapon = drop.type; weaponUntil = performance.now() + 11000; toast(`${drop.type === 'triple' ? 'Triple pop' : drop.type === 'laser' ? 'Sky laser' : 'Gatling burst'} · 11s`); }
  updateHud();
}
function refillBalloons() {
  balloons = balloons.filter(balloon => !balloon.popped);
  const bossStage = mode === 'campaign' && (campaignObjective?.isBoss || campaignObjective?.isMidBoss);
  const max = bossStage ? 1 : Math.min(22, Math.max(14, Math.floor(width / 43)));
  while (balloons.length < max) balloons.push(makeBalloon(false));
}
function hitTestCircle(x, y, circle, pad = 9) { return Math.hypot(x - circle.x, y - circle.y) <= circle.r + pad; }
function handleTap(x, y, drag = false) {
  if (state !== 'playing') return;
  const drop = drops.find(item => item.life > 0 && Math.hypot(item.x - x, item.y - y) <= item.r + 12);
  if (drop) { collectDrop(drop); return; }
  if (mode === 'puzzle') { tapPuzzle(x, y); return; }
  if (mode === 'slingshot') return;
  let hit = null;
  for (let i = balloons.length - 1; i >= 0; i--) {
    if (!balloons[i].popped && hitTestCircle(x, y, { x: balloons[i].x + Math.sin(balloons[i].phase) * 7, y: balloons[i].y, r: balloons[i].r }, 9)) { hit = balloons[i]; break; }
  }
  if (!hit) { if (!drag) combo = 1; updateHud(); return; }
  if (mode === 'campaign' && hit.kind === 'hazard') {
    hit.popped = true; campaignMovesLeft = Math.max(0, campaignMovesLeft - 1); campaignHazardsHit++; combo = 1; Audio.bad();
    addParticles(hit.x, hit.y, '#554d63', 8); toast('Hazard! Move spent');
    if (campaignMovesLeft <= 0) { finish(false); return; }
    refillBalloons(); updateHud(); return;
  }
  if (mode === 'campaign') campaignMovesLeft = Math.max(0, campaignMovesLeft - 1);
  if (mode === 'campaign' && hit.shield > 0) {
    hit.shield = 0; addParticles(hit.x, hit.y, '#00cdbd', 16); Audio.pop(combo); toast('Shield broken!');
    if (campaignObjective.kind === 'shield') objectiveProgress++;
    updateHud();
    if (objectiveProgress >= campaignGoal) finish(true);
    else if (campaignMovesLeft <= 0) finish(false);
    return;
  }
  const weapon = performance.now() < weaponUntil ? currentWeapon : '';
  if (weapon === 'laser') {
    for (const balloon of balloons) if (!balloon.popped && Math.abs(balloon.x - x) < 24) recordPop(balloon, balloon.x, balloon.y);
  } else {
    recordPop(hit, x, y);
    if (weapon === 'triple' && state === 'playing') {
      for (const balloon of balloons) if (!balloon.popped && Math.hypot(balloon.x - hit.x, balloon.y - hit.y) < 82) recordPop(balloon, balloon.x, balloon.y);
    }
  }
  if (state !== 'playing') return;
  if (mode === 'campaign' && campaignMovesLeft <= 0) { finish(false); return; }
  refillBalloons();
  updateHud();
}
function tapPuzzle(x, y) {
  if (!puzzle || puzzle.dartsLeft <= 0) return;
  const radius = Math.max(22, Math.min(31, Math.min(width, height) * .052));
  const index = puzzle.nodes.findIndex(node => !node.popped && Math.hypot(node.x * width - x, node.y * height - y) <= radius + 9);
  if (index < 0) { combo = 1; updateHud(); return; }
  puzzle.dartsLeft--;
  const queue = [index];
  let guard = 0;
  while (queue.length && guard++ < puzzle.nodes.length * 3) {
    const current = queue.shift();
    const node = puzzle.nodes[current];
    if (!node || node.popped) continue;
    node.popped = true; popped++;
    const px = node.x * width, py = node.y * height;
    addScore(node.kind === 'bomb' ? 75 : 24);
    Audio.pop(combo); addParticles(px, py, palette()[node.color] || '#f2bb3f', 10);
    combo++; bestCombo = Math.max(bestCombo, combo);
    if (node.kind === 'bomb') {
      for (const other of puzzle.nodes) {
        if (!other.popped && Math.hypot(other.x - node.x, other.y - node.y) < .23) queue.push(other.id);
      }
    }
    queue.push(...findPuzzleTargets(puzzle.nodes, current));
  }
  if (puzzle.nodes.every(node => node.popped)) finish(true);
  else if (puzzle.dartsLeft <= 0) finish(false);
  else updateHud();
}
function segmentHits(x1, y1, x2, y2, circle, radius) {
  const dx = x2 - x1, dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((circle.x - x1) * dx + (circle.y - y1) * dy) / lengthSquared)) : 0;
  return Math.hypot(circle.x - (x1 + t * dx), circle.y - (y1 + t * dy)) <= radius;
}
function slingAnchor() { return { x: width * .5, y: height * .82 }; }
function fireArrow(pointer) {
  if (!sling || sling.arrowsLeft <= 0 || state !== 'playing') return;
  const anchor = slingAnchor();
  let vx = anchor.x - pointer.x, vy = anchor.y - pointer.y;
  const pull = Math.hypot(vx, vy);
  if (pull < 38) { vx = 0; vy = -1; }
  else { vx /= pull; vy /= pull; }
  const speed = Math.min(1150, 720 + Math.min(160, pull) * 2.2);
  sling.arrowsLeft--;
  sling.shots.push({ x: anchor.x, y: anchor.y, vx: vx * speed, vy: vy * speed, life: 5, bounces: 0 });
  Audio.init(); updateHud();
}
function popSlingTarget(target) {
  if (!target || target.popped) return;
  if (target.kind === 'boss') {
    target.hp--; score += 60; Audio.pop(combo); addParticles(target.x * width, target.y * height, '#f2bb3f', 9);
    if (target.hp <= 0) { target.popped = true; popped++; combo++; bestCombo = Math.max(bestCombo, combo); }
    updateHud(); return;
  }
  target.popped = true; popped++;
  score += target.kind === 'bomb' ? 100 : target.kind === 'gold' ? 80 : 40;
  combo++; bestCombo = Math.max(bestCombo, combo); comboTimer = 2.4; Audio.pop(combo);
  addParticles(target.x * width, target.y * height, target.kind === 'bomb' ? '#f7a928' : target.kind === 'gold' ? '#f2bb3f' : '#59a966', 14);
  if (target.kind === 'bomb') {
    for (const other of sling.targets) {
      if (!other.popped && Math.hypot((other.x - target.x) * width, (other.y - target.y) * height) < 155) {
        other.popped = true; popped++; score += 45; addParticles(other.x * width, other.y * height, '#f7a928', 8);
      }
    }
  }
}
function updateSling(dt) {
  if (!sling) return;
  const gravity = 360;
  for (let i = sling.shots.length - 1; i >= 0; i--) {
    const shot = sling.shots[i];
    const oldX = shot.x, oldY = shot.y;
    shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.vy += gravity * dt; shot.life -= dt;
    for (const target of sling.targets) {
      if (target.popped) continue;
      const circle = { x: target.x * width, y: target.y * height };
      if (segmentHits(oldX, oldY, shot.x, shot.y, circle, Math.max(21, Math.min(28, Math.min(width, height) * .047)))) popSlingTarget(target);
    }
    if (shot.x < 0 || shot.x > width) {
      if (stageId % 3 === 0 && shot.bounces < 1) { shot.vx *= -1; shot.bounces++; shot.x = Math.max(1, Math.min(width - 1, shot.x)); }
      else shot.life = 0;
    }
    if (shot.y < -30 || shot.y > height + 30 || shot.life <= 0) sling.shots.splice(i, 1);
  }
  if (sling.targets.every(target => target.popped)) { finish(true); return; }
  if (sling.arrowsLeft === 0 && sling.shots.length === 0) finish(false);
}
function pause() {
  if (state !== 'playing') return;
  state = 'paused'; cancelAnimationFrame(raf); setScreen('pause');
}
function resume() {
  if (state !== 'paused') return;
  state = 'playing'; lastTime = performance.now(); setScreen(null); raf = requestAnimationFrame(loop);
}
function finish(cleared = true) {
  if (state !== 'playing') return;
  state = 'result'; cancelAnimationFrame(raf);
  const save = Store.data;
  const isNewBest = score > save.best;
  save.totalPops += popped;
  save.best = Math.max(save.best, score);
  save.bestByMode[mode] = Math.max(save.bestByMode[mode] || 0, score);
  save.maxCombo = Math.max(save.maxCombo, bestCombo);
  const earned = Math.floor(score / 120) + Math.ceil(popped / 3) + (cleared && ['campaign', 'puzzle', 'slingshot'].includes(mode) ? 18 : 0);
  save.coins += earned;
  save.xp += Math.floor(score / 25) + popped * 2 + (cleared && ['campaign', 'puzzle', 'slingshot'].includes(mode) ? 12 : 0);
  save.level = 1 + Math.floor(Math.sqrt(save.xp / 150));
  const daily = dailyMissionState();
  daily.missions.pops = Math.min(25, (Number(daily.missions.pops) || 0) + popped);
  daily.missions.score = Math.max(Number(daily.missions.score) || 0, score);
  if (mode === 'campaign' && cleared) daily.missions.campaign = 1;
  let stars = 0;
  if (cleared && mode === 'campaign') {
    stars = campaignMovesLeft >= Math.max(2, Math.ceil(campaignObjective.moves * .25)) && campaignHazardsHit === 0 ? 3 : campaignMovesLeft > 0 ? 2 : 1;
    save.campaignClears[stageId] = Math.max(Number(save.campaignClears[stageId]) || 0, stars);
    save.campaign = Math.min(CAMPAIGN_LENGTH, Math.max(save.campaign, Math.min(CAMPAIGN_LENGTH, stageId + 1)));
  } else if (cleared && mode === 'puzzle') {
    stars = puzzle?.dartsLeft >= 1 ? 3 : 2;
    save.puzzleClears[stageId] = Math.max(Number(save.puzzleClears[stageId]) || 0, stars);
    save.puzzleNext = Math.min(PUZZLE_LENGTH, Math.max(save.puzzleNext, Math.min(PUZZLE_LENGTH, stageId + 1)));
  } else if (cleared && mode === 'slingshot') {
    stars = sling?.arrowsLeft >= 1 ? 3 : 2;
    save.slingshotClears[stageId] = Math.max(Number(save.slingshotClears[stageId]) || 0, stars);
    save.slingshotNext = Math.min(SLINGSHOT_LENGTH, Math.max(save.slingshotNext, Math.min(SLINGSHOT_LENGTH, stageId + 1)));
  }
  checkAchievements();
  Store.flush();
  $('resultKicker').textContent = mode === 'campaign' ? (cleared ? 'STAGE CLEARED' : 'OBJECTIVE MISSED') : mode === 'puzzle' ? (cleared ? 'PUZZLE SOLVED' : 'OUT OF DARTS') : mode === 'slingshot' ? (cleared ? 'TARGETS CLEARED' : 'OUT OF ARROWS') : mode === 'survival' ? 'SURVIVAL ENDED' : 'BLITZ COMPLETE';
  $('resultTitle').textContent = isNewBest ? 'New best!' : cleared ? (['campaign', 'puzzle', 'slingshot'].includes(mode) ? 'Lovely flight!' : 'Great run!') : 'Try another run';
  $('finalScore').textContent = score.toLocaleString();
  $('resultText').textContent = `${popped} pops · ×${bestCombo} combo · +${earned} coins${mode === 'campaign' ? ` · ${campaignObjective.mission}` : ''}`;
  $('resultStars').textContent = stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
  $('resultStars').setAttribute('aria-label', stars ? `${stars} stars` : 'No stage stars');
  $('againBtn').textContent = mode === 'campaign' ? 'Replay stage' : mode === 'puzzle' ? 'Try puzzle again' : mode === 'slingshot' ? 'Retry slingshot' : 'Play again';
  const hasNext = cleared && (mode === 'campaign' ? stageId < CAMPAIGN_LENGTH : mode === 'puzzle' ? stageId < PUZZLE_LENGTH : mode === 'slingshot' ? stageId < SLINGSHOT_LENGTH : false);
  $('nextStageBtn').classList.toggle('hidden', !hasNext);
  $('nextStageBtn').textContent = `Next ${mode === 'puzzle' ? 'puzzle' : mode === 'slingshot' ? 'stage' : 'stage'} →`;
  Audio.win(); renderHome(); setScreen('result');
}
function checkAchievements() {
  for (const achievement of ACHIEVEMENTS) {
    if (!Store.data.achievements[achievement.id] && achievement.test(Store.data)) {
      Store.data.achievements[achievement.id] = Date.now();
      Store.data.coins += achievement.coins;
      toast(`Achievement · ${achievement.name} · +${achievement.coins} coins`);
    }
  }
}
function updateBalloons(dt) {
  for (const balloon of balloons) {
    balloon.phase += dt * 2;
    if (mode === 'puzzle' || mode === 'slingshot') continue;
    const frozen = performance.now() < slowMoUntil;
    balloon.y -= balloon.speed * dt * (frozen ? .42 : performance.now() < feverUntil ? 1.18 : 1);
    if (mode === 'campaign' && campaignObjective.hasWind) {
      balloon.x += campaignObjective.windSpeed * dt;
      if (balloon.x < balloon.r || balloon.x > width - balloon.r) campaignObjective.windSpeed *= -1;
    }
    if (mode === 'campaign' && escortBalloon && balloon.kind === 'hazard' && !balloon.popped && Math.hypot(balloon.x - escortBalloon.x, balloon.y - escortBalloon.y) < balloon.r + escortBalloon.r) {
      balloon.popped = true; escortBalloon.hp--; campaignHazardsHit++;
      addParticles(escortBalloon.x, escortBalloon.y, '#554d63', 10);
      if (escortBalloon.hp <= 0) { finish(false); return; }
      updateHud();
    }
    if (balloon.y < -balloon.r - 5) {
      if (mode === 'survival' && balloon.kind !== 'gift' && balloon.kind !== 'bomb' && balloon.kind !== 'hazard') {
        lives--; Audio.bad();
        if (lives <= 0) { finish(false); return; }
      }
      balloon.x = balloon.r + Math.random() * Math.max(1, width - balloon.r * 2);
      balloon.y = height + balloon.r + Math.random() * 35;
      balloon.phase = Math.random() * 6;
      if (balloon.kind !== 'boss') {
        const fresh = makeBalloon(false);
        balloon.kind = fresh.kind; balloon.colorKey = fresh.colorKey; balloon.color = fresh.color; balloon.hp = fresh.hp; balloon.maxHp = fresh.maxHp; balloon.shield = fresh.shield;
      }
    }
  }
}
function updateEscort(dt) {
  if (mode !== 'campaign' || !escortBalloon || state !== 'playing') return;
  escortBalloon.y -= 44 * (campaignObjective.speedMult || 1) * dt;
  const distance = Math.max(1, escortBalloon.startY - escortBalloon.endY);
  objectiveProgress = Math.min(1, Math.max(0, (escortBalloon.startY - escortBalloon.y) / distance));
  if (escortBalloon.y <= escortBalloon.endY) finish(escortBalloon.hp > 0);
}
function drawEscort() {
  if (!escortBalloon) return;
  const { x, y, r, hp } = escortBalloon;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, 0, r * .83, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#342a27'; ctx.lineWidth = 2.5; ctx.fill(); ctx.stroke();
  ctx.font = `${Math.max(17, r * 1.15)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🎈', 0, 1);
  ctx.fillStyle = '#352923'; ctx.font = 'bold 14px system-ui'; ctx.fillText('❤️'.repeat(Math.max(0, hp)), 0, -r - 15);
  ctx.restore();
}
function drawBalloon(balloon) {
  if (balloon.popped) return;
  const x = balloon.x + Math.sin(balloon.phase) * 7;
  const y = balloon.y;
  const radius = balloon.r;
  ctx.save();
  ctx.translate(x, y);
  const gradient = ctx.createRadialGradient(-radius * .3, -radius * .4, radius * .08, 0, 0, radius);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.2, balloon.color); gradient.addColorStop(1, shade(balloon.color, -.3));
  ctx.fillStyle = gradient;
  ctx.strokeStyle = balloon.kind === 'gold' ? '#ad7617' : '#342a2788';
  ctx.lineWidth = balloon.kind === 'boss' ? 4 : 2.4;
  ctx.beginPath(); ctx.ellipse(0, 0, radius * .83, radius, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff9'; ctx.beginPath(); ctx.ellipse(-radius * .24, -radius * .33, radius * .12, radius * .22, -.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(balloon.color, -.45); ctx.beginPath(); ctx.moveTo(-5, radius - 1); ctx.lineTo(5, radius - 1); ctx.lineTo(0, radius + 8); ctx.fill();
  if (balloon.shield > 0) { ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.02, radius * 1.17, 0, 0, Math.PI * 2); ctx.strokeStyle = '#24cdbf'; ctx.lineWidth = 3; ctx.stroke(); }
  if (balloon.kind === 'gold') { ctx.fillStyle = '#fff4c9'; ctx.font = `bold ${Math.max(15, radius * .65)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', 0, 1); }
  if (balloon.kind === 'bomb') { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(15, radius * .65)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✹', 0, 1); }
  if (balloon.kind === 'gift') { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(13, radius * .56)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✚', 0, 1); }
  if (balloon.kind === 'shield' && balloon.shield > 0) { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(15, radius * .65)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🛡️', 0, 1); }
  if (balloon.kind === 'freeze') { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(15, radius * .65)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('❄️', 0, 1); }
  if (balloon.kind === 'hazard') { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(15, radius * .65)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✖', 0, 1); }
  if (balloon.kind === 'boss') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 19px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♛', 0, -2);
    ctx.fillStyle = '#6c4736'; ctx.fillRect(-radius, radius + 12, radius * 2, 6);
    ctx.fillStyle = '#e34e45'; ctx.fillRect(-radius, radius + 12, radius * 2 * Math.max(0, balloon.hp / balloon.maxHp), 6);
  }
  ctx.restore();
}
function shade(hex, amount) {
  const digits = hex.replace('#', '');
  const value = parseInt(digits, 16);
  const factor = 1 + amount;
  const red = Math.max(0, Math.min(255, Math.round(((value >> 16) & 255) * factor)));
  const green = Math.max(0, Math.min(255, Math.round(((value >> 8) & 255) * factor)));
  const blue = Math.max(0, Math.min(255, Math.round((value & 255) * factor)));
  return `rgb(${red},${green},${blue})`;
}
function drawPuzzle() {
  if (!puzzle) return;
  const radius = Math.max(22, Math.min(31, Math.min(width, height) * .052));
  for (const node of puzzle.nodes) {
    if (node.popped) continue;
    const x = node.x * width, y = node.y * height;
    const color = palette()[node.color] || '#448fce';
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.ellipse(0, 0, radius * .82, radius, 0, 0, Math.PI * 2);
    ctx.fillStyle = node.kind === 'bomb' ? '#e16b56' : node.kind === 'freeze' ? '#45b8d1' : color; ctx.strokeStyle = '#342a27aa'; ctx.lineWidth = 2.5; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${node.kind === 'bomb' || node.kind === 'freeze' ? 19 : 22}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(node.kind === 'bomb' ? '✹' : node.kind === 'freeze' ? '❄' : node.glyph, 0, 1); ctx.restore();
  }
  ctx.fillStyle = '#ffffffbb'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(`${puzzle.name} · tap a starting balloon`, width / 2, Math.min(height - 130, height * .73));
}
function drawSling() {
  if (!sling) return;
  const targetRadius = Math.max(21, Math.min(28, Math.min(width, height) * .047));
  for (const target of sling.targets) {
    if (target.popped) continue;
    const x = target.x * width, y = target.y * height;
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, targetRadius * .83, targetRadius, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(x - 7, y - 8, 2, x, y, targetRadius);
    const base = target.kind === 'bomb' ? '#ffb45d' : target.kind === 'boss' ? '#eb8a52' : target.kind === 'gold' ? '#ffd76c' : '#78d494';
    const dark = target.kind === 'bomb' ? '#df633f' : target.kind === 'boss' ? '#803b39' : target.kind === 'gold' ? '#d99f21' : '#3b8e5b';
    grad.addColorStop(0, '#fff'); grad.addColorStop(.25, base); grad.addColorStop(1, dark);
    ctx.fillStyle = grad; ctx.strokeStyle = '#342a27aa'; ctx.lineWidth = target.kind === 'boss' ? 4 : 2.5; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(target.kind === 'bomb' ? '✹' : target.kind === 'boss' ? '♛' : target.kind === 'gold' ? '★' : '🎈', x, y);
    if (target.kind === 'boss') { ctx.fillStyle = '#6c4736'; ctx.fillRect(x - targetRadius, y + targetRadius + 8, targetRadius * 2, 5); ctx.fillStyle = '#e34e45'; ctx.fillRect(x - targetRadius, y + targetRadius + 8, targetRadius * 2 * Math.max(0, target.hp / target.maxHp), 5); }
    ctx.restore();
  }
  const anchor = slingAnchor();
  ctx.save();
  ctx.lineCap = 'round'; ctx.strokeStyle = '#735035'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(anchor.x - 17, anchor.y + 23); ctx.lineTo(anchor.x, anchor.y - 6); ctx.lineTo(anchor.x + 17, anchor.y + 23); ctx.stroke();
  ctx.strokeStyle = '#a65e31'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(anchor.x - 9, anchor.y + 13); ctx.lineTo(anchor.x + 9, anchor.y + 13); ctx.stroke();
  if (aimPointer) {
    ctx.setLineDash([7, 7]); ctx.strokeStyle = '#fff9'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(anchor.x, anchor.y); ctx.lineTo(aimPointer.x, aimPointer.y); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = '#a65e31'; ctx.lineWidth = 3;
  }
  ctx.restore();
  for (const shot of sling.shots) {
    ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(Math.atan2(shot.vy, shot.vx));
    ctx.strokeStyle = '#8a572d'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(13, 0); ctx.stroke();
    ctx.fillStyle = '#e4b757'; ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(7, -6); ctx.lineTo(7, 6); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}
function drawDrop(drop) {
  if (drop.life <= 0) return;
  const icons = { gatling: '⚡', triple: '🎯', laser: '🔆', time: '⏱', life: '❤' };
  ctx.save(); ctx.globalAlpha = Math.min(1, drop.life); ctx.beginPath(); ctx.arc(drop.x, drop.y, drop.r + Math.sin(drop.phase) * 2, 0, Math.PI * 2);
  ctx.fillStyle = '#655294'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icons[drop.type], drop.x, drop.y + 1); ctx.restore();
}
function drawParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const item = particles[i]; item.x += item.vx * dt; item.y += item.vy * dt; item.vy += 110 * dt; item.life -= dt * 1.45;
    if (item.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, item.life); ctx.fillStyle = item.color;
    if (Store.data.equipped.effect === 'orbit') { ctx.beginPath(); ctx.arc(item.x, item.y, item.size * .65, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(item.x, item.y, item.size, item.size);
  }
  ctx.globalAlpha = 1;
}
function updateDrops(dt) {
  for (const drop of drops) { drop.phase += dt * 4; drop.y += 7 * dt; drop.life -= dt; }
  drops = drops.filter(drop => drop.life > 0);
}
function loop(now) {
  if (state !== 'playing') return;
  const dt = Math.min((now - lastTime) / 1000, .05); lastTime = now;
  comboTimer = Math.max(0, comboTimer - dt);
  if (comboTimer === 0 && combo > 1) { combo = 1; updateHud(); }
  if (mode === 'blitz') {
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; finish(true); return; }
  }
  if (feverUntil && now >= feverUntil) { feverUntil = 0; feverCharge = 0; document.body.classList.remove('fever-active'); updateHud(); }
  if (weaponUntil && now >= weaponUntil) { weaponUntil = 0; currentWeapon = ''; updateHud(); }
  if (currentWeapon === 'gatling' && now < weaponUntil && !['puzzle', 'slingshot'].includes(mode)) {
    autoFireTimer -= dt;
    if (autoFireTimer <= 0) {
      const target = balloons.filter(balloon => !balloon.popped).sort((a, b) => b.y - a.y)[0];
      if (target) {
        if (mode === 'campaign') campaignMovesLeft = Math.max(0, campaignMovesLeft - 1);
        recordPop(target, target.x, target.y);
        if (state === 'playing' && mode === 'campaign' && campaignMovesLeft <= 0) { finish(false); return; }
        if (state === 'playing') refillBalloons();
      }
      autoFireTimer = .72;
    }
  }
  updateBalloons(dt);
  if (state !== 'playing') return;
  updateEscort(dt);
  if (state !== 'playing') return;
  if (mode === 'slingshot') updateSling(dt);
  if (state !== 'playing') return;
  ctx.clearRect(0, 0, width, height);
  if (mode === 'puzzle') drawPuzzle();
  else if (mode === 'slingshot') drawSling();
  else { for (const balloon of balloons) drawBalloon(balloon); if (mode === 'campaign') drawEscort(); }
  updateDrops(dt);
  for (const drop of drops) drawDrop(drop);
  drawParticles(dt);
  const second = Math.ceil(timeLeft);
  if (mode === 'blitz') { if (second !== hudSecond) { hudSecond = second; updateHud(); } }
  else updateHud();
  raf = requestAnimationFrame(loop);
}

canvas.addEventListener('pointerdown', event => {
  if (event.target !== canvas || state !== 'playing') return;
  event.preventDefault();
  if (mode === 'slingshot') {
    aimPointer = { x: event.clientX, y: event.clientY };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* optional */ }
    updateHud(); return;
  }
  handleTap(event.clientX, event.clientY, false);
  try { canvas.setPointerCapture(event.pointerId); } catch { /* optional */ }
}, { passive: false });
canvas.addEventListener('pointermove', event => {
  if (event.target !== canvas || state !== 'playing') return;
  if (mode === 'slingshot' && aimPointer) { aimPointer = { x: event.clientX, y: event.clientY }; return; }
  if (mode !== 'puzzle' && event.buttons) handleTap(event.clientX, event.clientY, true);
});
canvas.addEventListener('pointerup', event => {
  if (mode === 'slingshot' && aimPointer && state === 'playing') {
    aimPointer = { x: event.clientX, y: event.clientY };
    fireArrow(aimPointer); aimPointer = null;
  }
});
canvas.addEventListener('pointercancel', () => { aimPointer = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });
addEventListener('keydown', event => { if (event.key === 'Escape' && state === 'playing') pause(); });

document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openScreen(button.dataset.open)));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  selected = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('selected', item === button));
  if (selected === 'blitz' || selected === 'survival') resetRun(selected, 1);
  else {
    mapMode = selected;
    const progress = currentMapProgressFor(selected);
    selectedStage[selected] = maxUnlocked(progress.map, progress.next, selected === 'campaign' ? CAMPAIGN_LENGTH : 50);
    openScreen('maps');
  }
}));
document.querySelectorAll('[data-map]').forEach(button => button.addEventListener('click', () => {
  mapMode = button.dataset.map;
  const progress = currentMapProgress();
  selectedStage[mapMode] = maxUnlocked(progress.map, progress.next, currentMapLength());
  if (mapMode === 'campaign') mapWorldIndex = Math.floor((selectedStage.campaign - 1) / 25);
  renderMap();
}));
$('worldPrev').addEventListener('click', () => pageCampaignWorld(-1));
$('worldNext').addEventListener('click', () => pageCampaignWorld(1));
$('playBtn').addEventListener('click', () => resetRun('blitz', 1));
$('launchStage').addEventListener('click', launchSelectedStage);
$('dailyOpen').addEventListener('click', () => openScreen('missions'));
$('profileOpen').addEventListener('click', () => openScreen('profile'));
$('claimDaily').addEventListener('click', claimDaily);
$('saveProfile').addEventListener('click', saveProfile);
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', resume);
$('restartBtn').addEventListener('click', () => resetRun(mode, stageId));
$('quitBtn').addEventListener('click', () => { cancelAnimationFrame(raf); state = 'home'; openScreen('home'); });
$('againBtn').addEventListener('click', () => resetRun(mode, stageId));
$('homeBtn').addEventListener('click', () => { state = 'home'; openScreen('home'); });
$('nextStageBtn').addEventListener('click', () => resetRun(mode, stageId + 1));
$('settingsBtn').addEventListener('click', () => {
  $('soundToggle').checked = Store.data.settings.sound;
  $('hapticToggle').checked = Store.data.settings.haptics;
  $('effectsToggle').checked = Store.data.settings.reduced;
  setScreen('settings');
});
$('closeSettingsBtn').addEventListener('click', () => {
  Store.data.settings.sound = $('soundToggle').checked;
  Store.data.settings.haptics = $('hapticToggle').checked;
  Store.data.settings.reduced = $('effectsToggle').checked;
  Store.flush(); renderHome(); setScreen('home');
});
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset all Balloon Blitz progress on this device?')) return;
  Store.reset(); renderHome(); setScreen('home'); toast('Progress reset');
});
$('profileName').addEventListener('keydown', event => { if (event.key === 'Enter') saveProfile(); });
window.addEventListener('error', event => { console.error('Balloon Blitz error', event.error || event.message); toast('Something went wrong — your progress is safe'); });

Store.load();
renderHome();
setScreen('home');
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
