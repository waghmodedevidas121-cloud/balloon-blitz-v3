export const DAILY_REWARDS = [
  { coins: 50 }, { coins: 100 }, { coins: 150 }, { gems: 2 },
  { coins: 250 }, { coins: 400 }, { coins: 800, gems: 5 }
];

export function clearedCount(map) {
  return Object.values(map || {}).filter(value => Number(value) > 0).length;
}

export function maxUnlocked(map, fallback = 1, length = 50) {
  let highest = Math.max(1, Math.min(length, Number(fallback) || 1));
  while (highest < length && Number(map?.[highest]) > 0) highest++;
  return highest;
}

export function rankFor(level) {
  if (level >= 12) return 'SKY LEGEND';
  if (level >= 8) return 'MASTER';
  if (level >= 5) return 'ACE POPPER';
  if (level >= 3) return 'SKILLED';
  return 'ROOKIE';
}

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function previousDate(key) {
  if (!key) return '';
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

export function dailyRewardFor(streak) {
  return DAILY_REWARDS[(Math.max(1, streak) - 1) % DAILY_REWARDS.length];
}

export function campaignProgressAfterPop(objective, balloon, progress, sequenceIndex) {
  let nextProgress = progress;
  let nextSequenceIndex = sequenceIndex;
  if (objective.kind === 'pop') nextProgress++;
  else if (objective.kind === 'color' && balloon.colorKey === objective.color) nextProgress++;
  else if (objective.kind === 'gold' && balloon.kind === 'gold') nextProgress++;
  else if (objective.kind === 'bomb' && balloon.kind === 'bomb') nextProgress++;
  else if (objective.kind === 'freeze' && balloon.kind === 'freeze') nextProgress++;
  else if (objective.kind === 'sequence' && objective.sequence.length && balloon.colorKey === objective.sequence[sequenceIndex % objective.sequence.length]) {
    nextSequenceIndex++;
    nextProgress++;
  }
  return { progress: nextProgress, sequenceIndex: nextSequenceIndex };
}

export function campaignStars(movesTotal, movesRemaining, hazardsHit) {
  return movesRemaining >= Math.max(2, Math.ceil(movesTotal * 0.25)) && hazardsHit === 0
    ? 3
    : movesRemaining > 0 ? 2 : 1;
}

export function precisionModeStars(remainingAttempts) {
  return remainingAttempts >= 1 ? 3 : 2;
}

export function runPayout({ score, popped, cleared, mode }) {
  const stageClearBonus = cleared && ['campaign', 'puzzle', 'slingshot'].includes(mode);
  return {
    coins: Math.floor(score / 120) + Math.ceil(popped / 3) + (stageClearBonus ? 18 : 0),
    xp: Math.floor(score / 25) + popped * 2 + (stageClearBonus ? 12 : 0)
  };
}

export function levelForXp(xp) {
  return 1 + Math.floor(Math.sqrt(xp / 150));
}
