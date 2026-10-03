export const SAVE_KEY = 'balloon_blitz_v3';

export const DEFAULT_SAVE = {
  version: 3, best: 0, bestByMode: { blitz: 0, survival: 0, campaign: 0, puzzle: 0, slingshot: 0 },
  totalPops: 0, coins: 0, gems: 0, xp: 0, level: 1, maxCombo: 1,
  campaign: 1, campaignClears: {}, puzzleNext: 1, puzzleClears: {}, slingshotNext: 1, slingshotClears: {},
  inventory: { skins: ['classic'], effects: ['spark'] }, equipped: { skin: 'classic', effect: 'spark' },
  profile: { name: 'POPPER', avatar: '🎈' }, achievements: {},
  daily: { lastClaim: '', streak: 0, missionDate: '', missions: { pops: 0, score: 0, campaign: 0 }, claimed: {} },
  settings: { sound: true, haptics: true, reduced: false }
};

const clone = value => structuredClone(value);
const MODES = ['blitz', 'survival', 'campaign', 'puzzle', 'slingshot'];
const POSITIVE_COUNTERS = ['level', 'campaign', 'puzzleNext', 'slingshotNext', 'maxCombo'];
const COUNTERS = ['best', 'totalPops', 'coins', 'gems', 'xp', 'level', 'maxCombo', 'campaign', 'puzzleNext', 'slingshotNext'];

export function normalizeSave(input, { cleanName = value => String(value || 'POPPER'), isAvatar = () => true } = {}) {
  const next = clone(DEFAULT_SAVE);
  if (!input || typeof input !== 'object') return next;

  for (const key of COUNTERS) {
    const number = Number(input[key]);
    if (Number.isFinite(number)) next[key] = Math.max(POSITIVE_COUNTERS.includes(key) ? 1 : 0, Math.floor(number));
  }
  next.campaign = Math.min(600, next.campaign);
  next.puzzleNext = Math.min(50, next.puzzleNext);
  next.slingshotNext = Math.min(50, next.slingshotNext);
  next.bestByMode = { ...next.bestByMode, ...(input.bestByMode || {}) };
  for (const mode of MODES) next.bestByMode[mode] = Math.max(0, Number(next.bestByMode[mode]) || 0);

  for (const key of ['campaignClears', 'puzzleClears', 'slingshotClears', 'achievements']) {
    if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) next[key] = { ...input[key] };
  }
  if (input.inventory && typeof input.inventory === 'object') {
    next.inventory = {
      skins: Array.isArray(input.inventory.skins) ? input.inventory.skins.filter(item => typeof item === 'string') : ['classic'],
      effects: Array.isArray(input.inventory.effects) ? input.inventory.effects.filter(item => typeof item === 'string') : ['spark']
    };
  }
  if (input.equipped && typeof input.equipped === 'object') {
    next.equipped = { skin: String(input.equipped.skin || 'classic'), effect: String(input.equipped.effect || 'spark') };
  }
  if (input.profile && typeof input.profile === 'object') {
    next.profile = {
      name: cleanName(input.profile.name),
      avatar: isAvatar(input.profile.avatar) ? input.profile.avatar : '🎈'
    };
  }
  if (input.daily && typeof input.daily === 'object') {
    next.daily = {
      ...next.daily,
      ...input.daily,
      missions: { ...next.daily.missions, ...(input.daily.missions || {}) },
      claimed: { ...(input.daily.claimed || {}) }
    };
  }
  next.settings = { ...next.settings, ...(input.settings || {}) };
  next.settings.sound = next.settings.sound !== false;
  next.settings.haptics = next.settings.haptics !== false;
  next.settings.reduced = next.settings.reduced === true;
  return next;
}

export function createSaveStore({
  storage = globalThis.localStorage,
  cleanName,
  isAvatar,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  onError = (message, error) => console.error(message, error),
  onSaveFailure = () => {},
  delay = 250
} = {}) {
  let data = clone(DEFAULT_SAVE);
  let timer = 0;
  const normalize = input => normalizeSave(input, { cleanName, isAvatar });

  function load() {
    try {
      data = normalize(JSON.parse(storage.getItem(SAVE_KEY) || 'null'));
    } catch (error) {
      onError('Save recovery', error);
      data = clone(DEFAULT_SAVE);
    }
    return data;
  }

  function flush() {
    clearTimeout(timer);
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      onError('Save failed', error);
      onSaveFailure('Progress could not be saved');
      return false;
    }
  }

  function save() {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  function reset() {
    data = clone(DEFAULT_SAVE);
    flush();
  }

  windowTarget?.addEventListener?.('pagehide', flush);
  documentTarget?.addEventListener?.('visibilitychange', () => {
    if (documentTarget.hidden) flush();
  });

  return { load, save, flush, reset, get data() { return data; } };
}
