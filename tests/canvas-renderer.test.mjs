import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasRenderer } from '../js/ui/canvas-renderer.js';

function canvasHarness() {
  const spriteCanvases = [];
  const ownerDocument = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const context = recordingContext();
      const sprite = { width: 0, height: 0, getContext: kind => kind === '2d' ? context : null };
      spriteCanvases.push({ canvas: sprite, context });
      return sprite;
    }
  };
  function recordingContext() {
    const calls = [];
    const target = {
      calls,
      drawImage(...args) { calls.push(['drawImage', ...args]); },
      clearRect(...args) { calls.push(['clearRect', ...args]); },
      setTransform(...args) { calls.push(['setTransform', ...args]); },
      createRadialGradient(...args) {
        calls.push(['createRadialGradient', ...args]);
        return { addColorStop(...stop) { calls.push(['addColorStop', ...stop]); } };
      }
    };
    return new Proxy(target, {
      get(object, property) {
        if (property in object) return object[property];
        return (...args) => calls.push([String(property), ...args]);
      }
    });
  }
  const context = recordingContext();
  const canvas = { ownerDocument, getContext: kind => kind === '2d' ? context : null };
  return { canvas, context, spriteCanvases };
}

function balloon(colorKey, color, kind = 'normal') {
  return { x: 40, y: 80, r: 25, colorKey, color, kind, phase: .5, popped: false, shield: kind === 'shield' ? 1 : 0, hp: 3, maxHp: 3 };
}

test('canvas renderer draws cached V2-style balloon characters and keeps V3 special-kind cues', () => {
  const { canvas, context, spriteCanvases } = canvasHarness();
  const renderer = createCanvasRenderer({ canvas, getViewport: () => ({ width: 320, height: 640 }), getPalette: () => ({}), getEffect: () => 'spark' });
  renderer.resize(1);
  const balloons = [
    balloon('RED', '#ed625a'), balloon('PINK', '#ff8fc7'), balloon('BLUE', '#75d2ff'), balloon('GREEN', '#75d99a'),
    balloon('GOLD', '#ffd76c', 'gold'), balloon('RED', '#ed625a', 'bomb'), balloon('PINK', '#ff8fc7', 'gift'),
    balloon('BLUE', '#75d2ff', 'freeze'), balloon('GREEN', '#75d99a', 'shield'), balloon('GOLD', '#ffd76c', 'boss')
  ];
  const frame = { mode: 'blitz', balloons, drops: [], particles: [] };
  renderer.drawFrame(frame, 0);

  assert.equal(spriteCanvases.length, balloons.length);
  assert.equal(context.calls.filter(call => call[0] === 'drawImage').length, balloons.length);
  const artCalls = spriteCanvases.flatMap(item => item.context.calls.map(call => call[0]));
  assert.ok(artCalls.includes('bezierCurveTo'), "balloon body uses V2's plump hand-drawn silhouette");
  assert.ok(artCalls.includes('quadraticCurveTo'), 'balloon body has the characteristic knot tail');
  assert.ok(artCalls.includes('strokeText'), 'character color marks are drawn into the sprite artwork');
  assert.ok(artCalls.includes('fillText'), 'special balloons retain their identifying marks');
  assert.ok(!context.calls.some(call => call[0] === 'createRadialGradient'), "gameplay balloon sprites no longer use V3's generic glossy oval gradient");

  const initialCacheSize = spriteCanvases.length;
  renderer.drawFrame({ ...frame, balloons: [balloons[0]] }, 0);
  assert.equal(spriteCanvases.length, initialCacheSize, 're-rendering reuses the cached character sprite');
  assert.equal(context.calls.filter(call => call[0] === 'drawImage').length, balloons.length + 1);
});
