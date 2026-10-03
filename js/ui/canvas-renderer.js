export function createCanvasRenderer({ canvas, getViewport, getPalette, getEffect }) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  const palette = getPalette;

  function slingAnchor() { return { x: width * 0.5, y: height * 0.82 }; }

function drawEscort(escortBalloon) {
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
function drawPuzzle(puzzle) {
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
function drawSling(sling, aimPointer) {
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
function drawParticles(dt, particles) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const item = particles[i]; item.x += item.vx * dt; item.y += item.vy * dt; item.vy += 110 * dt; item.life -= dt * 1.45;
    if (item.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, item.life); ctx.fillStyle = item.color;
    if (getEffect() === 'orbit') { ctx.beginPath(); ctx.arc(item.x, item.y, item.size * .65, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(item.x, item.y, item.size, item.size);
  }
  ctx.globalAlpha = 1;
}

  function drawFrame(frame, dt) {
    ({ width, height } = getViewport());
    ctx.clearRect(0, 0, width, height);
    if (frame.mode === 'puzzle') drawPuzzle(frame.puzzle);
    else if (frame.mode === 'slingshot') drawSling(frame.sling, frame.aimPointer);
    else {
      for (const balloon of frame.balloons) drawBalloon(balloon);
      if (frame.mode === 'campaign') drawEscort(frame.escortBalloon);
    }
    for (const drop of frame.drops) drawDrop(drop);
    drawParticles(dt, frame.particles);
  }

  return {
    resize(dpr) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); },
    drawFrame
  };
}
