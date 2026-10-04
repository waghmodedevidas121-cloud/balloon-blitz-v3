export function createCanvasRenderer({ canvas, getViewport, getPalette, getEffect }) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  const palette = getPalette;
  const spriteCache = new Map();

  function slingAnchor() { return { x: width * 0.5, y: height * 0.82 }; }

  function rgb(hex) {
    const value = hex.replace('#', '').padEnd(6, '0');
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }
  function mix(hex, target, amount) {
    const source = rgb(hex);
    const channel = index => Math.round(source[index] + (target[index] - source[index]) * amount);
    return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
  }
  function balloonOutline(color, kind) {
    if (kind === 'bomb') return '#161928';
    if (kind === 'gift') return '#2e0854';
    if (kind === 'freeze') return '#043c4a';
    const [red, green, blue] = rgb(color);
    return `rgb(${Math.max(10, Math.round(red * .32))},${Math.max(10, Math.round(green * .32))},${Math.max(10, Math.round(blue * .32))})`;
  }
  function createBalloonSprite(colorKey, color, kind, radius) {
    const r = Math.max(1, Math.round(radius));
    const spriteKey = [colorKey, color, kind, r].join('|');
    if (spriteCache.has(spriteKey)) return spriteCache.get(spriteKey);

    const scale = 2;
    const size = Math.ceil(r * 2 * 1.5 + 14);
    const sprite = canvas.ownerDocument.createElement('canvas');
    sprite.width = sprite.height = size * scale;
    const art = sprite.getContext('2d');
    art.scale(scale, scale);
    const cx = size / 2;
    const cy = size * .46;
    const outline = balloonOutline(color, kind);
    const silhouette = () => {
      art.beginPath();
      art.moveTo(cx - r * .14, cy + r * 1.05);
      art.bezierCurveTo(cx - r * .96, cy + r * .82, cx - r * 1.08, cy - r * .25, cx - r * .98, cy - r * .42);
      art.bezierCurveTo(cx - r * .86, cy - r * 1.08, cx - r * .36, cy - r * 1.24, cx, cy - r * 1.24);
      art.bezierCurveTo(cx + r * .36, cy - r * 1.24, cx + r * .86, cy - r * 1.08, cx + r * .98, cy - r * .42);
      art.bezierCurveTo(cx + r * 1.08, cy - r * .25, cx + r * .96, cy + r * .82, cx + r * .14, cy + r * 1.05);
      art.closePath();
    };

    // V2's balloon body: a plump silhouette, one crisp shadow shape and a warm rim.
    silhouette();
    if (kind === 'bomb' || kind === 'gift' || kind === 'freeze') {
      const specialBase = kind === 'bomb' ? '#2a2f45' : kind === 'gift' ? '#8b3ddf' : '#4dd7ee';
      const specialShadow = kind === 'bomb' ? '#1a1d2e' : kind === 'gift' ? '#5e20a8' : '#1e9cb5';
      art.fillStyle = specialBase;
      art.fill();
      art.save(); silhouette(); art.clip();
      art.fillStyle = specialShadow;
      art.beginPath(); art.ellipse(cx + r * .2, cy + r * .26, r, r * 1.04, 0, 0, Math.PI * 2); art.fill();
      art.globalCompositeOperation = 'destination-out';
      art.beginPath(); art.ellipse(cx - r * .07, cy - r * .12, r * .86, r * .92, 0, 0, Math.PI * 2); art.fill();
      art.restore();
      art.save(); silhouette(); art.clip();
      art.strokeStyle = kind === 'freeze' ? 'rgba(255,255,255,.62)' : kind === 'gift' ? 'rgba(255,235,160,.48)' : 'rgba(255,160,90,.42)';
      art.lineWidth = Math.max(2.5, r * .1); art.lineCap = 'round';
      art.beginPath(); art.arc(cx - r * .16, cy - r * .2, r * .88, Math.PI * .8, Math.PI * 1.44); art.stroke();
      art.restore();
    } else {
      art.fillStyle = color;
      art.fill();
      art.save(); silhouette(); art.clip();
      art.fillStyle = mix(color, [42, 28, 22], .36);
      art.beginPath(); art.ellipse(cx + r * .22, cy + r * .3, r * 1.06, r * 1.12, 0, 0, Math.PI * 2); art.fill();
      art.globalCompositeOperation = 'destination-out';
      art.beginPath(); art.ellipse(cx - r * .06, cy - r * .1, r * .88, r * .94, 0, 0, Math.PI * 2); art.fill();
      art.restore();
      art.save(); silhouette(); art.clip();
      art.strokeStyle = 'rgba(255,252,232,.62)'; art.lineWidth = Math.max(2.2, r * .085); art.lineCap = 'round';
      art.beginPath(); art.arc(cx - r * .14, cy - r * .18, r * .92, Math.PI * .78, Math.PI * 1.4); art.stroke();
      // A few deterministic brush strokes keep the storybook texture stable across frames.
      art.globalAlpha = .07; art.fillStyle = 'rgba(59,46,42,.55)';
      for (let i = 0; i < 3; i++) art.fillRect(cx + ((i * 17 + r * 3) % Math.max(1, r)) - r * .5, cy + ((i * 11 + r) % Math.max(1, r)) - r * .5, r * .55, 1.1);
      art.restore();
    }

    // Familiar V2 character marks, fitted to V3's existing color keys and special kinds.
    const dark = '#1e1e2f';
    if (colorKey === 'RED') {
      const ex = r * .3, ey = -r * .04;
      art.fillStyle = '#fff'; art.beginPath(); art.ellipse(cx - ex, cy + ey, r * .26, r * .34, -.06, 0, Math.PI * 2); art.fill();
      art.fillStyle = dark; art.beginPath(); art.arc(cx - ex + r * .04, cy + ey, r * .16, 0, Math.PI * 2); art.fill();
      art.fillStyle = '#fff'; art.beginPath(); art.arc(cx - ex + r * .02, cy + ey - r * .06, r * .065, 0, Math.PI * 2); art.fill();
      art.strokeStyle = dark; art.lineWidth = Math.max(3.2, r * .12); art.lineCap = 'round';
      art.beginPath(); art.arc(cx + ex, cy + ey + r * .04, r * .2, Math.PI * 1.15, Math.PI * 1.85); art.stroke();
      art.lineWidth = Math.max(2.6, r * .09); art.beginPath(); art.arc(cx, cy + r * .2, r * .22, Math.PI * .15, Math.PI * .85); art.stroke();
      art.fillStyle = 'rgba(255,70,110,.55)'; art.beginPath(); art.ellipse(cx - ex - r * .04, cy + r * .26, r * .14, r * .08, 0, 0, Math.PI * 2); art.fill();
      art.beginPath(); art.ellipse(cx + ex + r * .04, cy + r * .26, r * .14, r * .08, 0, 0, Math.PI * 2); art.fill();
    } else if (colorKey === 'PINK') {
      const ex = r * .3, ey = -r * .04;
      for (const side of [-1, 1]) {
        const pos = side * ex;
        art.fillStyle = '#fff'; art.beginPath(); art.ellipse(cx + pos, cy + ey, r * .26, r * .34, side * .06, 0, Math.PI * 2); art.fill();
        art.fillStyle = dark; art.beginPath(); art.arc(cx + pos - side * r * .03, cy + ey, r * .16, 0, Math.PI * 2); art.fill();
        art.fillStyle = '#fff'; art.beginPath(); art.arc(cx + pos - side * r * .02, cy + ey - r * .06, r * .065, 0, Math.PI * 2); art.fill();
      }
      art.strokeStyle = dark; art.lineWidth = Math.max(2.6, r * .09); art.lineCap = 'round';
      art.beginPath(); art.arc(cx, cy + r * .2, r * .22, Math.PI * .15, Math.PI * .85); art.stroke();
      art.fillStyle = 'rgba(255,40,90,.45)'; art.beginPath(); art.ellipse(cx - ex - r * .04, cy + r * .26, r * .14, r * .08, 0, 0, Math.PI * 2); art.fill();
      art.beginPath(); art.ellipse(cx + ex + r * .04, cy + r * .26, r * .14, r * .08, 0, 0, Math.PI * 2); art.fill();
    } else if (colorKey === 'GREEN') {
      art.font = `900 ${Math.floor(r * 1.1)}px Arial Rounded MT Bold, "Comic Sans MS", sans-serif`;
      art.textAlign = 'center'; art.textBaseline = 'middle'; art.lineJoin = 'round'; art.strokeStyle = '#2b0d52'; art.lineWidth = Math.max(4, r * .18);
      art.strokeText('A', cx, cy + r * .04); art.fillStyle = '#a855f7'; art.fillText('A', cx, cy + r * .04);
    } else if (colorKey === 'BLUE') {
      const heart = r * .44, hy = cy + r * .06;
      art.beginPath(); art.moveTo(cx, hy + heart * .85);
      art.bezierCurveTo(cx - heart * 1.35, hy + heart * .15, cx - heart * 1.15, hy - heart * .95, cx, hy - heart * .45);
      art.bezierCurveTo(cx + heart * 1.15, hy - heart * .95, cx + heart * 1.35, hy + heart * .15, cx, hy + heart * .85);
      art.closePath(); art.strokeStyle = '#082c44'; art.lineWidth = Math.max(3.5, r * .14); art.lineJoin = 'round'; art.stroke(); art.fillStyle = '#ff9ec4'; art.fill();
    } else if (colorKey === 'GOLD' || kind === 'gold') {
      art.font = `900 ${Math.floor(r * 1.1)}px Arial Rounded MT Bold, "Comic Sans MS", sans-serif`;
      art.textAlign = 'center'; art.textBaseline = 'middle'; art.lineJoin = 'round'; art.strokeStyle = '#52082b'; art.lineWidth = Math.max(4, r * .18);
      art.strokeText('2', cx, cy + r * .04); art.fillStyle = '#ff4785'; art.fillText('2', cx, cy + r * .04);
    }

    if (kind === 'bomb') {
      art.fillStyle = '#ff3344'; art.beginPath(); art.arc(cx, cy + r * .08, r * .38, 0, Math.PI * 2); art.fill();
      art.fillStyle = '#fff'; art.font = `900 ${Math.floor(r * .5)}px Arial Rounded MT Bold, sans-serif`; art.textAlign = 'center'; art.textBaseline = 'middle'; art.fillText('!', cx, cy + r * .1);
    } else if (kind === 'freeze') {
      art.strokeStyle = 'rgba(255,255,255,.95)'; art.lineWidth = Math.max(2.5, r * .09); art.lineCap = 'round';
      const arm = r * .52;
      for (let i = 0; i < 3; i++) { const angle = i * Math.PI / 3 + Math.PI / 6; const dx = Math.cos(angle) * arm, dy = Math.sin(angle) * arm; art.beginPath(); art.moveTo(cx - dx, cy - dy); art.lineTo(cx + dx, cy + dy); art.stroke(); }
    } else if (kind === 'gift') {
      const boxW = r * .6, boxH = r * .5, boxY = cy + r * .06;
      art.fillStyle = 'rgba(255,255,255,.95)'; art.fillRect(cx - boxW / 2, boxY - boxH / 2, boxW, boxH);
      art.fillStyle = '#f59e0b'; art.fillRect(cx - r * .07, boxY - boxH / 2, r * .14, boxH); art.fillRect(cx - boxW / 2, boxY - r * .07, boxW, r * .14);
    } else if (kind === 'shield') {
      art.beginPath(); art.moveTo(cx, cy - r * .34); art.lineTo(cx + r * .29, cy - r * .2); art.lineTo(cx + r * .24, cy + r * .16); art.lineTo(cx, cy + r * .35); art.lineTo(cx - r * .24, cy + r * .16); art.lineTo(cx - r * .29, cy - r * .2); art.closePath();
      art.fillStyle = '#78dce7'; art.strokeStyle = '#1c7181'; art.lineWidth = Math.max(2, r * .08); art.fill(); art.stroke();
    }

    // Soft painterly crescent, consistent ink outline, and the characteristic flared knot.
    art.save(); silhouette(); art.clip();
    art.strokeStyle = 'rgba(255,252,232,.58)'; art.lineWidth = Math.max(1.8, r * .11); art.lineCap = 'round';
    art.beginPath(); art.arc(cx - r * .14, cy - r * .16, r * .72, Math.PI * .86, Math.PI * 1.32); art.stroke();
    art.fillStyle = 'rgba(255,255,255,.72)'; art.beginPath(); art.arc(cx - r * .2, cy - r * .72, r * .055, 0, Math.PI * 2); art.fill();
    art.restore();
    silhouette(); art.strokeStyle = outline; art.lineWidth = Math.max(2, r * .095); art.lineJoin = 'round'; art.stroke();
    if (r > 28) { art.save(); silhouette(); art.clip(); art.strokeStyle = 'rgba(59,46,42,.12)'; art.lineWidth = 1; art.stroke(); art.restore(); }
    art.beginPath(); art.moveTo(cx - r * .14, cy + r * 1.05); art.lineTo(cx - r * .22, cy + r * 1.28);
    art.quadraticCurveTo(cx, cy + r * 1.34, cx + r * .22, cy + r * 1.28); art.lineTo(cx + r * .14, cy + r * 1.05); art.closePath();
    art.fillStyle = kind === 'bomb' ? '#1e2233' : mix(color, [10, 10, 20], .28); art.fill(); art.strokeStyle = outline; art.lineWidth = Math.max(2.4, r * .08); art.stroke();

    const result = { canvas: sprite, size };
    spriteCache.set(spriteKey, result);
    return result;
  }

  function drawBalloonArt(x, y, radius, colorKey, color, kind, phase = 0) {
    const wobble = phase || 0;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + radius * 1.15);
    ctx.bezierCurveTo(x + Math.sin(wobble) * radius * .09, y + radius * 1.5, x - Math.sin(wobble) * radius * .11, y + radius * 1.8, x + Math.sin(wobble * .7) * radius * .22, y + radius * 2.15); ctx.stroke();
    if (kind === 'gold') {
      ctx.save(); ctx.globalAlpha = .35; ctx.strokeStyle = `hsla(${(wobble * 40) % 360},85%,62%,1)`; ctx.lineWidth = Math.max(3, radius * .14);
      ctx.beginPath(); ctx.arc(x, y, radius * 1.12, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    const r = Math.max(1, Math.round(radius));
    const sprite = createBalloonSprite(colorKey, color, kind, r);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sprite.canvas, x - sprite.size / 2, y - sprite.size / 2 * .94, sprite.size, sprite.size);
    ctx.restore();
  }

  function drawEscort(escortBalloon) {
    if (!escortBalloon) return;
    const { x, y, r, hp } = escortBalloon;
    drawBalloonArt(x, y, r, 'PINK', '#ff70ae', 'normal', y / 40);
    ctx.save(); ctx.fillStyle = '#352923'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('❤️'.repeat(Math.max(0, hp)), x, y - r - 15); ctx.restore();
  }

  function drawBalloon(balloon) {
    if (balloon.popped) return;
    const x = balloon.x + Math.sin(balloon.phase) * 7;
    const y = balloon.y;
    const radius = balloon.r;
    const colorKey = balloon.colorKey || 'RED';
    drawBalloonArt(x, y, radius, colorKey, balloon.color, balloon.kind, balloon.phase);

    if (balloon.kind === 'hazard') {
      ctx.save(); ctx.strokeStyle = '#ff2a5f'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * radius * .95, y + Math.sin(angle) * radius * .95);
        ctx.lineTo(x + Math.cos(angle) * radius * 1.35, y + Math.sin(angle) * radius * 1.35); ctx.stroke();
      }
      ctx.restore();
    }
    if (balloon.shield > 0) {
      ctx.beginPath(); ctx.ellipse(x, y, radius * 1.12, radius * 1.25, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#24cdbf'; ctx.lineWidth = 3; ctx.stroke();
    }
    if (balloon.kind === 'boss') {
      ctx.fillStyle = '#fff7d6'; ctx.font = 'bold 19px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♛', x, y - radius * .2);
      ctx.fillStyle = '#6c4736'; ctx.fillRect(x - radius, y + radius + 12, radius * 2, 6);
      ctx.fillStyle = '#e34e45'; ctx.fillRect(x - radius, y + radius + 12, radius * 2 * Math.max(0, balloon.hp / balloon.maxHp), 6);
    }
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
