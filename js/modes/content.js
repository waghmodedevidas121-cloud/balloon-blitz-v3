import { WORLDS as WORLD_CATALOG, CAMPAIGN_LEVELS, PUZZLE_CATALOG, SLINGSHOT_CATALOG } from './catalog.js';

export const CAMPAIGN_LENGTH = CAMPAIGN_LEVELS.length;
export const PUZZLE_LENGTH = PUZZLE_CATALOG.length;
export const SLINGSHOT_LENGTH = SLINGSHOT_CATALOG.length;
export const WORLDS = WORLD_CATALOG.map(world => ({ ...world }));

const COLORS = {
  RED: '#ed625a', BLUE: '#448fce', GREEN: '#59a966', GOLD: '#f2bb3f',
  PINK: '#ee77ad', VIOLET: '#9276b7'
};

export function campaignStage(stage) {
  const id = Math.max(1, Math.min(CAMPAIGN_LENGTH, Math.floor(Number(stage) || 1)));
  const source = CAMPAIGN_LEVELS[id - 1];
  const world = WORLDS[(source.world || 1) - 1] || WORLDS[0];
  return {
    id,
    world: source.worldName || world.name,
    worldId: source.world || world.id,
    stageInWorld: source.stageInWorld || ((id - 1) % 25) + 1,
    icon: world.icon,
    kind: source.type,
    target: source.target,
    moves: source.moves || 16,
    seconds: source.time || 40,
    color: source.targetColor || null,
    sequence: source.sequence ? [...source.sequence] : [],
    isBoss: Boolean(source.isBoss),
    isMidBoss: Boolean(source.isMidBoss),
    escort: Boolean(source.isEscort),
    hasHazards: Boolean(source.hasHazards),
    hasShields: Boolean(source.hasShields),
    hasWind: Boolean(source.hasWind),
    windSpeed: Number(source.windSpeed) || 0,
    speedMult: Number(source.speedMult) || 1,
    mission: source.desc
  };
}

export function goalForStage(stage) {
  return campaignStage(stage).target;
}

const DIR_GLYPHS = {
  RIGHT: '→', LEFT: '←', UP: '↑', DOWN: '↓', HORIZ: '↔', VERT: '↕', ALL: '✣'
};
const PUZZLE_DIRECTIONS = {
  RIGHT: [{ x: 1, y: 0 }],
  LEFT: [{ x: -1, y: 0 }],
  UP: [{ x: 0, y: -1 }],
  DOWN: [{ x: 0, y: 1 }],
  HORIZ: [{ x: 1, y: 0 }, { x: -1, y: 0 }],
  VERT: [{ x: 0, y: 1 }, { x: 0, y: -1 }],
  ALL: [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
};

export function puzzleStage(stage) {
  const id = Math.max(1, Math.min(PUZZLE_LENGTH, Math.floor(Number(stage) || 1)));
  const source = PUZZLE_CATALOG[id - 1];
  const nodes = source.balloons.map((balloon, index) => ({
    id: index,
    x: balloon.x,
    y: balloon.y,
    color: balloon.key === 'BOMB' ? 'RED' : balloon.key === 'FREEZE' ? 'BLUE' : balloon.key,
    dir: balloon.dir,
    glyph: DIR_GLYPHS[balloon.dir] || '•',
    kind: balloon.key === 'BOMB' ? 'bomb' : balloon.key === 'FREEZE' ? 'freeze' : 'balloon',
    popped: false
  }));
  // V2's Spiral Galaxy center blocker occluded the TNT ray. Nudge that
  // connector off the lead path so the advertised one-dart spiral is solvable.
  if (id === 26 && nodes.length > 8) { nodes[8].x = 0.38; nodes[8].y = 0.30; }
  if (id === 36 && nodes.length > 7) { nodes[4].x = 0.40; nodes[5].x = 0.60; nodes[7].y = 0.67; }
  if (id === 40 && nodes.length > 8) { nodes[7].x = 0.36; nodes[7].y = 0.50; nodes[8].x = 0.64; nodes[8].y = 0.50; }
  return {
    id, name: source.name, desc: source.desc, darts: source.darts,
    isBoss: Boolean(source.isBoss), isMidBoss: Boolean(source.isMidBoss), nodes
  };
}

export function findPuzzleTargets(nodes, sourceIndex) {
  const source = nodes[sourceIndex];
  if (!source) return [];
  const vectors = PUZZLE_DIRECTIONS[source.dir] || [];
  const targets = [];
  for (const vector of vectors) {
    let nearest = -1;
    let nearestProjection = Infinity;
    for (let index = 0; index < nodes.length; index++) {
      const candidate = nodes[index];
      if (index === sourceIndex || candidate.popped) continue;
      const dx = candidate.x - source.x;
      const dy = candidate.y - source.y;
      const projection = dx * vector.x + dy * vector.y;
      const cross = Math.abs(dx * vector.y - dy * vector.x);
      if (projection > 0.025 && cross < 0.075 && projection < nearestProjection) {
        nearest = index;
        nearestProjection = projection;
      }
    }
    if (nearest >= 0 && !targets.includes(nearest)) targets.push(nearest);
  }
  return targets;
}

export function findPuzzleTarget(nodes, sourceIndex) {
  return findPuzzleTargets(nodes, sourceIndex)[0] ?? -1;
}

export function tracePuzzlePath(stage, startIndex = 0) {
  const nodes = stage.nodes.map(node => ({ ...node }));
  const path = [];
  const pending = [startIndex];
  while (pending.length && path.length < nodes.length * 2) {
    const current = pending.shift();
    const node = nodes[current];
    if (!node || node.popped) continue;
    node.popped = true;
    path.push(current);
    if (node.kind === 'bomb') {
      for (let index = 0; index < nodes.length; index++) {
        const other = nodes[index];
        if (!other.popped && Math.hypot(other.x - node.x, other.y - node.y) < 0.23) pending.push(index);
      }
    }
    pending.push(...findPuzzleTargets(nodes, current));
  }
  return path;
}

export function slingshotStage(stage) {
  const id = Math.max(1, Math.min(SLINGSHOT_LENGTH, Math.floor(Number(stage) || 1)));
  const source = SLINGSHOT_CATALOG[id - 1];
  const targets = source.balloons.map((balloon, index) => ({
    id: index,
    x: balloon.x,
    y: balloon.y,
    kind: balloon.key === 'BOMB' ? 'bomb' : balloon.key === 'GOLD' ? 'gold' : 'balloon',
    popped: false
  }));
  if (source.bossHp) {
    targets.push({ id: targets.length, x: 0.5, y: 0.19, kind: 'boss', hp: source.bossHp, maxHp: source.bossHp, popped: false });
  }
  return {
    id,
    name: source.name,
    desc: source.desc,
    arrows: source.arrows,
    isBoss: Boolean(source.isBoss),
    isMidBoss: Boolean(source.isMidBoss),
    bossHp: source.bossHp || 0,
    targets
  };
}

export const COSMETICS = {
  skins: [
    { id: 'classic', name: 'Classic Pop', price: { coins: 0 }, colors: COLORS },
    { id: 'candy', name: 'Candy Pop', price: { coins: 300 }, colors: { RED: '#ff70ae', BLUE: '#75d2ff', GREEN: '#75d99a', GOLD: '#ffd76c', PINK: '#ff8fc7', VIOLET: '#c79cff' } },
    { id: 'magma', name: 'Magma Pop', price: { coins: 700 }, colors: { RED: '#ff4d26', BLUE: '#ff9d3b', GREEN: '#ffd343', GOLD: '#fff0a1', PINK: '#ff7861', VIOLET: '#fa6f7b' } },
    { id: 'royal', name: 'Royal Pop', price: { gems: 5 }, colors: { RED: '#b875ec', BLUE: '#668bff', GREEN: '#54d8b3', GOLD: '#ffe27d', PINK: '#f199d5', VIOLET: '#e689e2' } }
  ],
  effects: [
    { id: 'spark', name: 'Spark Shards', price: { coins: 0 } },
    { id: 'orbit', name: 'Orbit Pop', price: { coins: 250 } },
    { id: 'comet', name: 'Comet Pop', price: { gems: 3 } }
  ]
};

export const AVATARS = ['🎈', '🦄', '👾', '🦊', '🐱', '🐸', '🦋', '🌟', '🔥', '🎯', '👑', '🐧'];

export const ACHIEVEMENTS = [
  { id: 'first-pop', icon: '🎈', name: 'First Pop', description: 'Pop your first balloon.', coins: 25, test: data => data.totalPops >= 1 },
  { id: 'combo-12', icon: '⚡', name: 'Combo Keeper', description: 'Reach a 12× combo.', coins: 80, test: data => data.maxCombo >= 12 },
  { id: 'pop-100', icon: '👑', name: 'Sky Sweeper', description: 'Pop 100 balloons in total.', coins: 100, test: data => data.totalPops >= 100 },
  { id: 'campaign-1', icon: '🗺️', name: 'On the Map', description: 'Clear your first campaign stage.', coins: 60, test: data => Object.keys(data.campaignClears).length >= 1 },
  { id: 'puzzle-1', icon: '🧩', name: 'Chain Reaction', description: 'Solve a tactical puzzle.', coins: 60, test: data => Object.keys(data.puzzleClears).length >= 1 },
  { id: 'slingshot-1', icon: '🏹', name: 'Cloudshot', description: 'Clear a slingshot stage.', coins: 60, test: data => Object.keys(data.slingshotClears).length >= 1 }
];
