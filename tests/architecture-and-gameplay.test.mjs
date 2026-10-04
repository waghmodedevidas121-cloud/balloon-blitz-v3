import test from 'node:test';
import assert from 'node:assert/strict';
import {
  campaignProgressAfterPop, campaignStars, clearedCount, dailyRewardFor, dateKey,
  levelForXp, maxUnlocked, previousDate, precisionModeStars, rankFor, runPayout
} from '../js/core/progression.js';
import { createSaveStore, DEFAULT_SAVE, normalizeSave, SAVE_KEY } from '../js/persistence/save-store.js';
import { bindGameInput } from '../js/input/game-input.js';

class EventTargetFake {
  listeners = new Map();
  addEventListener(type, callback, options) {
    const entries = this.listeners.get(type) || [];
    entries.push({ callback, options });
    this.listeners.set(type, entries);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.callback !== callback));
  }
  dispatch(type, event = {}) {
    for (const { callback } of this.listeners.get(type) || []) callback({ type, target: this, ...event });
  }
}

function mockStorage(initial = null, { failRead = null, failWrite = null } = {}) {
  let value = initial;
  return {
    getItem(key) { assert.equal(key, SAVE_KEY); if (failRead) throw failRead; return value; },
    setItem(key, next) { assert.equal(key, SAVE_KEY); if (failWrite) throw failWrite; value = next; },
    read() { return value; }
  };
}

test('save normalization preserves a safe V3 profile while clamping progress and validating owned items', () => {
  const save = normalizeSave({
    campaign: 999, puzzleNext: -4, level: 0, coins: -10, bestByMode: { blitz: 80, unknown: 9 },
    inventory: { skins: ['classic', 4], effects: ['spark'] }, equipped: { skin: 'missing' },
    profile: { name: '  <pilot>   one  ', avatar: 'not-an-avatar' },
    settings: { sound: 0, haptics: false, reduced: 1 }
  }, { cleanName: value => String(value).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14), isAvatar: avatar => avatar === '🎈' });
  assert.equal(save.campaign, 600);
  assert.equal(save.puzzleNext, 1);
  assert.equal(save.level, 1);
  assert.equal(save.coins, 0);
  assert.equal(save.bestByMode.blitz, 80);
  assert.deepEqual(save.inventory.skins, ['classic']);
  assert.equal(save.equipped.skin, 'missing');
  assert.equal(save.profile.name, 'pilot one');
  assert.equal(save.profile.avatar, '🎈');
  assert.equal(save.settings.sound, true);
  assert.equal(save.settings.haptics, false);
  assert.equal(save.settings.reduced, false);
});

test('save-store loads, flushes and resets only through its injected local persistence adapter', () => {
  const storage = mockStorage(JSON.stringify({ coins: 45, campaign: 3 }));
  const windowTarget = new EventTargetFake();
  const documentTarget = new EventTargetFake();
  const store = createSaveStore({ storage, windowTarget, documentTarget, delay: 1 });
  assert.equal(store.load().coins, 45);
  store.data.coins += 5;
  assert.equal(store.flush(), true);
  assert.equal(JSON.parse(storage.read()).coins, 50);
  store.reset();
  assert.deepEqual(JSON.parse(storage.read()), DEFAULT_SAVE);
  assert.equal(windowTarget.listeners.get('pagehide').length, 1);
  assert.equal(documentTarget.listeners.get('visibilitychange').length, 1);
});

test('save-store recovers from malformed local JSON without losing the default state', () => {
  const errors = [];
  const storage = mockStorage('{');
  const store = createSaveStore({ storage, windowTarget: new EventTargetFake(), documentTarget: new EventTargetFake(), onError: message => errors.push(message) });
  assert.deepEqual(store.load(), DEFAULT_SAVE);
  assert.deepEqual(errors, ['Save recovery']);
});

test('save-store survives blocked localStorage access at startup and reports failed writes', () => {
  const errors = [];
  const failures = [];
  const blocked = new Error('storage access denied');
  const store = createSaveStore({
    storageProvider: () => { throw blocked; },
    windowTarget: new EventTargetFake(),
    documentTarget: new EventTargetFake(),
    onError: message => errors.push(message),
    onSaveFailure: message => failures.push(message)
  });
  assert.doesNotThrow(() => store.load());
  assert.deepEqual(store.data, DEFAULT_SAVE);
  assert.equal(store.flush(), false);
  assert.deepEqual(errors, ['Save recovery', 'Save failed']);
  assert.deepEqual(failures, ['Progress could not be saved']);
});

test('save-store catches quota/write errors and keeps the current in-memory progression intact', () => {
  const errors = [];
  const failures = [];
  const storage = mockStorage(null, { failWrite: new Error('quota exceeded') });
  const store = createSaveStore({ storage, windowTarget: new EventTargetFake(), documentTarget: new EventTargetFake(), onError: message => errors.push(message), onSaveFailure: message => failures.push(message) });
  store.load();
  store.data.coins = 123;
  assert.equal(store.flush(), false);
  assert.equal(store.data.coins, 123);
  assert.deepEqual(errors, ['Save failed']);
  assert.deepEqual(failures, ['Progress could not be saved']);
});

test('progression helpers preserve stage unlocks, streak dates, ranks, and seven-day rewards', () => {
  assert.equal(clearedCount({ 1: 3, 2: 0, 3: 1 }), 2);
  assert.equal(maxUnlocked({ 1: 3, 2: 2 }, 1, 10), 3);
  assert.equal(maxUnlocked({}, 4, 10), 4);
  assert.equal(rankFor(1), 'ROOKIE');
  assert.equal(rankFor(5), 'ACE POPPER');
  assert.equal(rankFor(12), 'SKY LEGEND');
  assert.equal(dateKey(new Date(2026, 9, 3)), '2026-10-03');
  assert.equal(previousDate('2026-10-03'), '2026-10-02');
  assert.deepEqual(dailyRewardFor(7), { coins: 800, gems: 5 });
  assert.deepEqual(dailyRewardFor(8), { coins: 50 });
});

test('campaign progress counts only matching objective pops and advances ordered sequences', () => {
  const pop = campaignProgressAfterPop({ kind: 'pop', sequence: [] }, { kind: 'normal' }, 2, 0);
  assert.deepEqual(pop, { progress: 3, sequenceIndex: 0 });
  const colorMiss = campaignProgressAfterPop({ kind: 'color', color: 'RED', sequence: [] }, { colorKey: 'BLUE' }, 2, 0);
  assert.deepEqual(colorMiss, { progress: 2, sequenceIndex: 0 });
  const sequence = ['RED', 'GOLD'];
  const first = campaignProgressAfterPop({ kind: 'sequence', sequence }, { colorKey: 'RED' }, 0, 0);
  assert.deepEqual(first, { progress: 1, sequenceIndex: 1 });
  const wrong = campaignProgressAfterPop({ kind: 'sequence', sequence }, { colorKey: 'BLUE' }, 1, 1);
  assert.deepEqual(wrong, { progress: 1, sequenceIndex: 1 });
  const second = campaignProgressAfterPop({ kind: 'sequence', sequence }, { colorKey: 'GOLD' }, 1, 1);
  assert.deepEqual(second, { progress: 2, sequenceIndex: 2 });
});

test('stage stars, run payouts, and XP levels preserve the existing reward economy', () => {
  assert.equal(campaignStars(16, 4, 0), 3);
  assert.equal(campaignStars(16, 2, 0), 2);
  assert.equal(campaignStars(16, 0, 0), 1);
  assert.equal(campaignStars(16, 7, 1), 2);
  assert.equal(precisionModeStars(1), 3);
  assert.equal(precisionModeStars(0), 2);
  assert.deepEqual(runPayout({ score: 120, popped: 3, cleared: true, mode: 'campaign' }), { coins: 20, xp: 22 });
  assert.deepEqual(runPayout({ score: 0, popped: 0, cleared: false, mode: 'blitz' }), { coins: 0, xp: 0 });
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(600), 3);
});

test('input adapter isolates overlay and secondary pointers, supports drag and puzzles, and cancels slingshot aim safely', () => {
  const canvas = new EventTargetFake();
  canvas.setPointerCapture = () => {};
  const windowTarget = new EventTargetFake();
  const documentTarget = new EventTargetFake();
  const taps = [];
  const shots = [];
  let state = 'playing';
  let mode = 'blitz';
  let pauses = 0;
  const input = bindGameInput({ canvas, windowTarget, documentTarget, getState: () => state, getMode: () => mode, onTap: (...args) => taps.push(args), onFireArrow: shot => shots.push(shot), onPause: () => pauses++ });

  canvas.dispatch('pointerdown', { target: {}, clientX: 3, clientY: 4, pointerId: 9, preventDefault() {} });
  canvas.dispatch('pointerdown', { target: canvas, clientX: 3, clientY: 4, pointerId: 9, button: 2, preventDefault() {} });
  assert.equal(taps.length, 0);
  canvas.dispatch('pointerdown', { target: canvas, clientX: 10, clientY: 20, pointerId: 1, preventDefault() {} });
  canvas.dispatch('pointermove', { target: canvas, clientX: 90, clientY: 90, pointerId: 2, buttons: 1, isPrimary: false });
  canvas.dispatch('pointermove', { target: canvas, clientX: 12, clientY: 22, pointerId: 1, buttons: 1 });
  assert.deepEqual(taps, [[10, 20, false], [12, 22, true]]);
  canvas.dispatch('pointerup', { target: canvas, clientX: 12, clientY: 22, pointerId: 1 });

  mode = 'puzzle';
  canvas.dispatch('pointerdown', { target: canvas, clientX: 12, clientY: 22, pointerId: 4, preventDefault() {} });
  canvas.dispatch('pointermove', { target: canvas, clientX: 13, clientY: 23, pointerId: 4, buttons: 1 });
  assert.equal(taps.length, 3);
  canvas.dispatch('pointerup', { target: canvas, pointerId: 4 });

  mode = 'slingshot';
  canvas.dispatch('pointerdown', { target: canvas, clientX: 30, clientY: 40, pointerId: 2, preventDefault() {} });
  canvas.dispatch('pointerdown', { target: canvas, clientX: 80, clientY: 90, pointerId: 3, isPrimary: false, preventDefault() {} });
  canvas.dispatch('pointermove', { target: canvas, clientX: 80, clientY: 90, pointerId: 3, buttons: 1, isPrimary: false });
  canvas.dispatch('pointerup', { target: canvas, clientX: 80, clientY: 90, pointerId: 3, isPrimary: false });
  assert.deepEqual(input.getAimPointer(), { x: 30, y: 40 });
  canvas.dispatch('pointermove', { target: canvas, clientX: 35, clientY: 45, pointerId: 2, buttons: 1 });
  canvas.dispatch('pointerup', { target: canvas, clientX: 37, clientY: 47, pointerId: 2 });
  assert.deepEqual(shots, [{ x: 37, y: 47 }]);
  assert.equal(input.getAimPointer(), null);

  canvas.dispatch('pointerdown', { target: canvas, clientX: 50, clientY: 60, pointerId: 5, preventDefault() {} });
  canvas.dispatch('pointercancel', { target: canvas, pointerId: 5 });
  canvas.dispatch('pointerup', { target: canvas, clientX: 60, clientY: 70, pointerId: 5 });
  assert.equal(input.getAimPointer(), null);
  assert.equal(shots.length, 1);

  windowTarget.dispatch('keydown', { key: 'Escape' });
  assert.equal(pauses, 1);
  state = 'paused';
  windowTarget.dispatch('keydown', { key: 'Escape' });
  assert.equal(pauses, 1);
  state = 'playing';
  canvas.dispatch('pointerdown', { target: canvas, clientX: 60, clientY: 70, pointerId: 6, preventDefault() {} });
  documentTarget.hidden = true;
  documentTarget.dispatch('visibilitychange');
  assert.equal(pauses, 2);
  assert.equal(input.getAimPointer(), null);
  input.destroy();
  assert.equal(canvas.listeners.get('pointerdown').length, 0);
});
