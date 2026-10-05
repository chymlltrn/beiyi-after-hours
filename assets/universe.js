const TAU = Math.PI * 2;
const C = { ink: '#10191f', white: '#edf2df', lime: '#d7fc70', purple: '#b6a2f5', pink: '#ff91bc', blue: '#83d7f1', gold: '#ffc97b' };
const TOOLS = { lab: ['hammer', 'gravity', 'rainbow'], mentor: ['shred', 'mute', 'reply'], earth: ['meteor', 'laser', 'blackhole'], mice: ['disco', 'bubbles', 'snacks'] };
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

/** Four local arcade worlds. The application owns input, sound and counters. */
export class Universe {
  constructor(canvas, { reducedMotion = false, onComplete } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reducedMotion = reducedMotion;
    this.onComplete = onComplete;
    this.mode = 'lab';
    this.tool = 'hammer';
    this.intensity = 2;
    this.time = 0;
    this.lastTime = null;
    this.raf = 0;
    this.paused = false;
    this.disposed = false;
    this.hidden = document.hidden;
    this.aim = { x: 0.5, y: 0.5 };
    this.gesture = null;
    this.dragTarget = null;
    this.stars = Array.from({ length: 82 }, (_, i) => ({ x: (Math.sin(i * 113.7 + 3) + 1) / 2, y: (Math.sin(i * 217.3 + 9) + 1) / 2, r: i % 9 ? 0.9 : 2, phase: i * 1.8 }));
    this.tick = this.tick.bind(this);
    this.resize = this.resize.bind(this);
    this.onVisibility = () => {
      this.hidden = document.hidden;
      this.lastTime = null;
      if (this.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; }
      else this.wake();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.observer = new ResizeObserver(this.resize);
    this.resetState();
    this.observer.observe(canvas);
    this.resize();
    this.wake();
  }

  resetState() {
    this.particles = [];
    this.effects = [];
    this.flights = [];
    this.rings = [];
    this.splashes = [];
    this.cracks = [];
    this.replies = [];
    this.equipment = ['microscope', 'monitor', 'centrifuge', 'tubes', 'flask', 'gel'].map((kind, i) => ({ kind, id: i, gone: false }));
    this.cards = ['再补一组实验', '周末来一下', '这个很简单', '明天给我初稿', '顺便做个机制'].map((text, i) => ({ text, id: i, gone: false }));
    this.guests = 4;
    this.hits = 0;
    this.shake = 0;
    this.charge = 0;
    this.bursting = false;
    this.burstAge = 0;
    this.ended = false;
    this.gesture = null;
    this.dragTarget = null;
  }

  resize() {
    if (this.disposed) return;
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, box.width);
    this.height = Math.max(1, box.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.mobile = this.width / this.height < 1.3;
    // Keep the game camera at its authored aspect ratio on wide desktop stages.
    // The ambient universe fills the gutters; gameplay and pointer math share this camera.
    this.scale = this.mobile ? this.width / 800 : Math.min(this.width / 800, this.height / 460);
    this.H = this.mobile ? this.height / this.scale : 460;
    this.viewW = this.width / this.scale;
    this.viewH = this.height / this.scale;
    this.offsetX = (this.viewW - 800) / 2;
    this.offsetY = (this.viewH - this.H) / 2;
    this.layout();
    this.draw();
  }

  layout() {
    const h = this.H || 460;
    if (this.mobile) {
      this.equipment.forEach((item, i) => { item.x = 244 + (i % 2) * 310; item.y = 235 + Math.floor(i / 2) * Math.min(176, (h - 285) / 3); });
      const positionsCards = [[211, 123], [589, 123], [211, h * 0.66], [589, h * 0.66], [400, h - 90]];
      this.cards.forEach((card, i) => { [card.x, card.y] = positionsCards[i]; });
      this.core = { x: 400, y: h * 0.43, r: 65 };
      this.globe = { x: 400, y: h * 0.46, r: 205 };
    } else {
      const positions = [[203, 245], [381, 245], [592, 240], [506, 319], [287, 332], [654, 316]];
      this.equipment.forEach((item, i) => { [item.x, item.y] = positions[i]; });
      const positionsCards = [[153, 143], [650, 132], [147, 311], [654, 316], [400, 84]];
      this.cards.forEach((card, i) => { [card.x, card.y] = positionsCards[i]; });
      this.core = { x: 400, y: h * 0.48, r: 74 };
      this.globe = { x: 400, y: h * 0.5, r: Math.min(142, h * 0.33) };
    }
  }

  setMode(mode) {
    if (!TOOLS[mode]) return;
    this.mode = mode;
    this.tool = TOOLS[mode][0];
    this.reset();
  }

  setTool(tool) { if (TOOLS[this.mode].includes(tool)) { this.tool = tool; this.draw(); } }
  setIntensity(n) { this.intensity = Math.round(clamp(n, 1, 3)); }
  setCharge(progress) { this.charge = clamp(progress); this.draw(); this.wake(); }
  pointer(x, y) { this.aim = { x: clamp(x), y: clamp(y) }; if (this.reducedMotion) this.draw(); }

  setGesture(gesture) {
    if (gesture?.active) {
      if (!this.gesture?.active) {
        const point = this.point(gesture.startX ?? gesture.x, gesture.startY ?? gesture.y);
        this.dragTarget = this.closest(this.mode === 'lab' ? this.equipment : this.cards, point.x, point.y);
      }
      this.gesture = { ...gesture, active: true };
      this.charge = clamp(gesture.charge ?? this.charge);
    } else this.gesture = null;
    this.draw(); this.wake();
  }

  point(x, y) { return { x: clamp(x) * this.viewW - this.offsetX, y: clamp(y) * this.viewH - this.offsetY }; }
  fontSize(size, minimumPx) { return Math.max(size, minimumPx / this.scale); }

  closest(items, x, y) {
    return items.filter(item => !item.gone).reduce((best, item) => {
      const distance = Math.hypot(item.x - x, item.y - y);
      return !best || distance < best.distance ? { ...item, distance } : best;
    }, null);
  }

  hit(x = 0.5, y = 0.5, options = {}) {
    if (this.disposed || this.paused || this.bursting) return;
    if (options.tool) this.setTool(options.tool);
    const point = this.point(x, y);
    this.aim = { x: clamp(x), y: clamp(y) };
    this.hits++;
    this.ended = false;
    this.shake = this.reducedMotion ? 0 : 0.13 + this.intensity * 0.025;
    if (this.mode === 'lab') this.hitLab(point, options);
    if (this.mode === 'mentor') this.hitMentor(point, options);
    if (this.mode === 'earth') this.hitEarth(point, options);
    if (this.mode === 'mice') this.hitMice(point, options);
    this.dragTarget = null;
    this.gesture = null;
    this.trim();
    this.draw();
    this.wake();
  }

  hitLab(point, options) {
    const target = this.dragTarget && !this.equipment[this.dragTarget.id]?.gone ? this.equipment[this.dragTarget.id] : this.closest(this.equipment, point.x, point.y);
    if (!target) { this.ring(point.x, point.y, C.lime); this.emit(point.x, point.y, 16, 'spark'); return; }
    const item = this.equipment[target.id];
    const releasedAt = Number.isFinite(options.endX) && Number.isFinite(options.endY) ? this.point(options.endX, options.endY) : item;
    item.gone = true;
    this.ring(releasedAt.x, releasedAt.y - 30, this.tool === 'rainbow' ? C.pink : C.lime);
    this.emit(releasedAt.x, releasedAt.y - 30, 28 + this.intensity * 12, this.tool === 'rainbow' ? 'paint' : 'metal');
    if (this.tool === 'gravity') {
      this.effects.push({ kind: 'gravity', x: releasedAt.x, y: releasedAt.y - 35, age: 0, life: 0.8 });
      this.flights.push({ kind: 'equipment', item: { ...item }, x: releasedAt.x, y: releasedAt.y, vx: 0, vy: 0, age: 0, life: 0.7, sink: true, rotation: 0 });
    } else if (this.tool === 'rainbow') {
      this.splashes.push({ x: releasedAt.x, y: releasedAt.y + 5, color: [C.pink, C.lime, C.blue, C.purple][item.id % 4] });
      this.effects.push({ kind: 'rainbow', x: releasedAt.x, y: releasedAt.y - 60, age: 0, life: 0.7 });
    } else {
      const fling = options.fling;
      const vx = fling ? clamp(fling.dx, -2, 2) * this.viewW : (item.x < 400 ? -1 : 1) * (160 + this.intensity * 65);
      const vy = fling ? clamp(fling.dy, -2, 2) * this.viewH - 110 : -220;
      this.flights.push({ kind: 'equipment', item: { ...item }, x: releasedAt.x, y: releasedAt.y, vx, vy, age: 0, life: 1.45, rotation: 0 });
      this.effects.push({ kind: 'hammer', x: releasedAt.x, y: releasedAt.y - 45, age: 0, life: 0.38 });
    }
    if (this.splashes.length > 8) this.splashes.shift();
  }

  hitMentor(point, options) {
    const selected = this.dragTarget && !this.cards[this.dragTarget.id]?.gone ? this.cards[this.dragTarget.id] : this.closest(this.cards, point.x, point.y);
    if (!selected) { this.emit(this.core.x, this.core.y, 18, 'letter', '已下班'); return; }
    const card = this.cards[selected.id];
    const releasedAt = Number.isFinite(options.endX) && Number.isFinite(options.endY) ? this.point(options.endX, options.endY) : card;
    card.gone = true;
    const replies = ['收到，我先下班。', '周末电量不足。', '这次不顺便了。', '初稿明天见。', '请给鼠鼠放假。'];
    this.replies.push({ text: replies[card.id], id: card.id });
    this.ring(releasedAt.x, releasedAt.y, this.tool === 'mute' ? C.blue : C.purple);
    this.flights.push({ kind: this.tool === 'reply' ? 'plane' : 'card', item: { ...card }, x: releasedAt.x, y: releasedAt.y, originX: releasedAt.x, originY: releasedAt.y, age: 0, life: this.reducedMotion ? 0.25 : 1.0, rotation: 0, muted: this.tool === 'mute' });
    if (this.tool === 'mute') this.effects.push({ kind: 'mute', x: releasedAt.x, y: releasedAt.y, age: 0, life: 1.0 });
    else this.emit(releasedAt.x, releasedAt.y, 25 + this.intensity * 9, 'letter', card.text);
  }

  hitEarth(point, options) {
    const globe = this.globe;
    let dx = point.x - globe.x, dy = point.y - globe.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance > globe.r * 0.88) { dx *= globe.r * 0.88 / distance; dy *= globe.r * 0.88 / distance; }
    const x = globe.x + dx, y = globe.y + dy;
    const power = 1 + clamp(options.charge ?? this.charge) * 2 + this.intensity * 0.2;
    this.cracks.push({ x: dx / globe.r, y: dy / globe.r, angle: Math.atan2(dy, dx), power });
    if (this.cracks.length > 16) this.cracks.shift();
    this.effects.push({ kind: this.tool, x, y, age: 0, life: this.reducedMotion ? 0.3 : 0.75, power });
    this.emit(x, y, 22 + Math.round(power * 15), this.tool === 'blackhole' ? 'void' : 'earth');
    this.ring(x, y, this.tool === 'blackhole' ? C.purple : C.gold);
    this.charge = 0;
  }

  hitMice(point, options) {
    this.guests = Math.min(10, this.guests + 1);
    this.effects.push({ kind: this.tool, x: point.x, y: point.y, age: 0, life: this.reducedMotion ? 0.3 : 1.4, combo: options.combo || 1 });
    this.ring(point.x, point.y, this.tool === 'bubbles' ? C.blue : C.pink);
    this.emit(point.x, point.y, 18 + this.intensity * 9, this.tool === 'bubbles' ? 'bubble' : 'confetti');
  }

  burst(options = {}) {
    if (this.disposed || this.paused || this.bursting) return;
    if (options.tool) this.setTool(options.tool);
    this.bursting = true;
    this.burstAge = 0;
    this.ended = false;
    this.charge = 0;
    this.shake = this.reducedMotion ? 0 : 0.28;
    if (this.mode === 'lab') {
      this.equipment.forEach((item, i) => {
        item.gone = true;
        this.flights.push({ kind: 'equipment', item: { ...item }, x: item.x, y: item.y, vx: (item.x - 400) * (1.7 + this.intensity * 0.35), vy: -240 - i * 36, age: 0, life: 2.2, rotation: 0 });
        this.emit(item.x, item.y - 20, 26, 'metal');
      });
      this.ring(400, this.mobile ? this.H * 0.5 : 270, C.lime, true);
    } else if (this.mode === 'mentor') {
      this.cards.forEach(card => { if (!card.gone) { card.gone = true; this.flights.push({ kind: 'card', item: { ...card }, x: card.x, y: card.y, originX: card.x, originY: card.y, age: 0, life: 1.3, rotation: 0 }); } });
      this.replies = [{ text: '自动回复：我已下班，宇宙请自便。', id: 0 }];
      this.emit(this.core.x, this.core.y, 150, 'letter', '下班快乐');
      this.ring(this.core.x, this.core.y, C.purple, true);
    } else if (this.mode === 'earth') {
      this.emit(this.globe.x, this.globe.y, 200, 'earth', '', true);
      this.ring(this.globe.x, this.globe.y, C.blue, true);
    } else {
      this.guests = 10;
      this.emit(400, this.H * 0.42, 230, 'confetti', '', true);
      this.effects.push({ kind: 'festival', x: 400, y: this.H * 0.42, age: 0, life: 2.1 });
      this.ring(400, this.H * 0.5, C.pink, true);
    }
    this.trim(); this.draw(); this.wake();
  }

  reset() { this.resetState(); this.layout(); this.draw(); this.wake(); }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.lastTime = null;
    if (this.paused) { cancelAnimationFrame(this.raf); this.raf = 0; }
    else this.wake();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.particles.length = 0;
    this.effects.length = 0;
    this.flights.length = 0;
  }

  wake() {
    if (!this.raf && !this.paused && !this.hidden && !this.disposed) {
      this.lastTime = null;
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  tick(now) {
    this.raf = 0;
    if (this.paused || this.hidden || this.disposed) return;
    const elapsed = this.lastTime !== null && Number.isFinite(now) ? Math.max(0, (now - this.lastTime) / 1000) : 1 / 60;
    const dt = Math.min(elapsed, 0.04);
    this.lastTime = Number.isFinite(now) ? now : null;
    this.time += dt;
    this.shake = Math.max(0, this.shake - elapsed);
    this.particles = this.particles.filter(p => {
      p.age += elapsed;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt;
      p.rotation += p.spin * dt;
      return p.age < p.life;
    });
    this.effects = this.effects.filter(effect => { effect.age += elapsed; return effect.age < effect.life; });
    this.rings = this.rings.filter(ring => { ring.age += elapsed; return ring.age < ring.life; });
    this.flights = this.flights.filter(flight => {
      flight.age += elapsed;
      if (flight.kind === 'equipment') { flight.x += flight.vx * dt; flight.y += flight.vy * dt; flight.vy += 110 * dt; flight.rotation += dt * 2.2; }
      return flight.age < flight.life;
    });
    if (this.bursting) {
      this.burstAge += elapsed;
      if (this.burstAge > (this.reducedMotion ? 0.45 : 2.15)) {
        this.bursting = false;
        this.ended = true;
        this.onComplete?.();
      }
    }
    this.draw();
    if (!this.paused && !this.hidden && (!this.reducedMotion || this.particles.length || this.effects.length || this.flights.length || this.bursting)) this.raf = requestAnimationFrame(this.tick);
  }

  ring(x, y, color, big = false) { this.rings.push({ x, y, color, age: 0, life: this.reducedMotion ? 0.25 : big ? 1.1 : 0.45, big }); }

  emit(x, y, count, kind, text = '', big = false) {
    const colors = [C.lime, C.purple, C.pink, C.blue, C.gold, C.white];
    const amount = this.reducedMotion ? Math.min(count, 18) : count;
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * TAU;
      const speed = this.reducedMotion ? 12 : (big ? 170 : 75) + Math.random() * (big ? 390 : 210) * this.intensity / 2;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (kind === 'bubble' ? 80 : 50), gravity: this.reducedMotion ? 0 : kind === 'bubble' ? -20 : 130, age: 0, life: this.reducedMotion ? 0.3 : 0.7 + Math.random() * (big ? 2.2 : 1.0), size: kind === 'earth' ? 5 + Math.random() * 15 : 3 + Math.random() * 6, rotation: angle, spin: this.reducedMotion ? 0 : (Math.random() - 0.5) * 7, color: kind === 'earth' ? [C.blue, '#90ab71', '#476c79'][i % 3] : colors[i % colors.length], kind, text: text[i % Math.max(1, text.length)] || '·' });
    }
    this.trim();
  }

  trim() {
    if (this.particles.length > 360) this.particles.splice(0, this.particles.length - 360);
    if (this.effects.length > 16) this.effects.splice(0, this.effects.length - 16);
    if (this.rings.length > 12) this.rings.splice(0, this.rings.length - 12);
    if (this.flights.length > 16) this.flights.splice(0, this.flights.length - 16);
  }

  path(points, fill, stroke = C.ink, width = 2) {
    const c = this.ctx; c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }

  line(points, color, width = 2) {
    const c = this.ctx; c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }

  ellipse(x, y, rx, ry, fill, stroke, width = 2, rotation = 0) {
    if (![x, y, rx, ry, rotation].every(Number.isFinite)) return;
    const c = this.ctx; c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rotation, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = Math.max(0.1, width); c.stroke(); }
  }

  rect(x, y, w, h, r, fill, stroke = C.ink, width = 2) {
    if (![x, y, w, h, r].every(Number.isFinite)) return;
    const c = this.ctx; c.beginPath(); c.roundRect(x, y, w, h, Math.max(0, r));
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }

  glow(x, y, r, color) {
    if (!Number.isFinite(r) || r <= 0) return;
    const c = this.ctx; const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  label(text, x, y, size, color = C.white, align = 'center', weight = 600) {
    const c = this.ctx; c.font = `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    c.fillStyle = color; c.textAlign = align; c.fillText(text, x, y);
  }

  draw() {
    if (!this.ctx || !this.width || this.disposed) return;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.width, this.height);
    c.save(); c.scale(this.scale, this.scale); c.translate(this.offsetX, this.offsetY); c.lineCap = 'round'; c.lineJoin = 'round';
    this.background();
    c.save();
    if (this.shake && !this.reducedMotion) c.translate(Math.sin(this.time * 130) * this.shake * 30, Math.cos(this.time * 110) * this.shake * 16);
    if (this.mode === 'lab') this.lab();
    if (this.mode === 'mentor') this.mentor();
    if (this.mode === 'earth') this.earth();
    if (this.mode === 'mice') this.mice();
    this.drawFlights(); this.drawEffects(); this.drawParticles(); this.drawCharge();
    c.restore();
    this.sceneLabels();
    c.restore();
  }

  background() {
    const c = this.ctx; const h = this.H;
    const g = c.createLinearGradient(0, 0, 800, h);
    g.addColorStop(0, '#111c27'); g.addColorStop(0.58, '#111720'); g.addColorStop(1, '#20212c');
    c.fillStyle = g; c.fillRect(-this.offsetX, -this.offsetY, this.viewW, this.viewH);
    this.glow(400, h * 0.55, 370, this.mode === 'mice' ? '#d53e8a19' : this.mode === 'mentor' ? '#ad7de824' : '#99f26b10');
    this.stars.forEach(star => { c.globalAlpha = this.reducedMotion ? 0.4 : 0.28 + (Math.sin(this.time * 0.8 + star.phase) + 1) * 0.18; this.ellipse(star.x * this.viewW - this.offsetX, star.y * this.viewH - this.offsetY, star.r, star.r, '#d7e7dd'); });
    c.globalAlpha = 1;
    c.save(); c.setLineDash([2, 8]); this.ellipse(400, h * 0.53, 368, Math.min(173, h * 0.27), null, '#849dba18', 1); c.restore();
    [[65, 70], [730, h - 103], [697, 62]].forEach(([x, y]) => { this.line([[x - 4, y], [x + 4, y]], '#b6a2f580', 1); this.line([[x, y - 4], [x, y + 4]], '#b6a2f580', 1); });
    if (this.offsetX > 90) {
      this.ellipse(-this.offsetX + 97, h * 0.29, 34, 34, '#72648b', '#b6a2f56b', 1);
      this.ellipse(-this.offsetX + 97, h * 0.29, 61, 15, null, '#b6a2f559', 3, -0.25);
      this.ellipse(800 + this.offsetX - 88, h * 0.72, 24, 24, '#355063', '#83d7f15a', 1);
      this.ellipse(800 + this.offsetX - 93, h * 0.70, 7, 5, '#608093');
    }
  }

  sceneLabels() {
    const size = this.fontSize(this.mobile ? 26 : 13, 14);
    const tag = { lab: '6 件设备 · 想砸哪件就砸哪件', mentor: '把消息拖向黑洞 · 退订精神内耗', earth: '按住蓄力 · 松开送走所有 DDL', mice: '敲出节拍 · 鼠鼠只加快乐' }[this.mode];
    this.label(tag, 400, this.mobile ? 49 : 33, size, '#b2c5c8', 'center', 500);
    if (this.ended) {
      const messages = { lab: '实验室已清空。鼠鼠安全下班。', mentor: '已开启免打扰。宇宙请自便。', earth: '所有 DDL 已离线。一颗新世界正在发芽。', mice: '今天，全员带薪快乐。' };
      const w = this.mobile ? 660 : 390;
      this.rect(400 - w / 2, this.H - (this.mobile ? 87 : 60), w, this.mobile ? 55 : 35, 18, '#183135e8', '#d7fc7048', 1);
      this.label(messages[this.mode], 400, this.H - (this.mobile ? 52 : 38), this.fontSize(this.mobile ? 26 : 14, 12), C.lime);
    }
  }

  lab() {
    const c = this.ctx;
    if (this.mobile) {
      this.equipment.forEach(item => {
        this.platform(item.x, item.y + 21, 194, 49);
        this.drawLabItem(item);
      });
      this.mouse(401, this.H - 127, 1.2, 'scientist');
    } else {
      this.platform(409, 326, 700, 138);
      this.equipment.forEach(item => this.drawLabItem(item));
      this.mouse(105, 321, 0.93, 'scientist');
    }
    this.splashes.forEach(splash => { this.ellipse(splash.x, splash.y + 10, 45, 10, `${splash.color}85`); for (let i = 0; i < 4; i++) this.ellipse(splash.x + i * 13 - 20, splash.y + Math.sin(i) * 9, 4, 3, splash.color); });
    if (this.bursting || this.ended) {
      const p = this.reducedMotion || this.ended ? 1 : clamp(this.burstAge / 1.9);
      const x = this.mobile ? 401 : 109;
      const y = this.mobile ? this.H - 150 - p * (this.H - 300) : 340 - p * 203;
      this.rocket(x, y, this.mobile ? 1.3 : 1, true);
      if (!this.reducedMotion && this.bursting) this.glow(x, y + 80, 70, '#d7fc7045');
    }
  }

  platform(x, y, width, depth) {
    const left = x - width / 2, right = x + width / 2, d = depth / 2;
    this.ellipse(x, y + 57, width * 0.43, 22, '#05090f60');
    this.path([[left, y - d], [right - 65, y - d - 20], [right, y + d - 20], [left + 65, y + d]], '#344653', '#718492', 1.5);
    this.path([[left + 65, y + d], [right, y + d - 20], [right, y + d], [left + 65, y + d + 20]], '#202f3b', '#63778a', 1.5);
    this.path([[left, y - d], [left + 65, y + d], [left + 65, y + d + 20], [left, y - d + 20]], '#263340', '#63778a', 1.5);
    this.line([[left + 73, y + d + 13], [right - 8, y + d - 7]], '#b6a2f582', 2);
    for (let i = 1; i < 5; i++) this.line([[left + width * i / 5, y - d - i * 3], [left + width * i / 5 + 65, y + d - i * 3]], '#7e92a026', 1);
  }

  drawLabItem(item) {
    const dragging = this.gesture?.active && this.dragTarget?.id === item.id;
    if (item.gone) {
      this.ellipse(item.x, item.y + 13, 36, 9, '#080f1890', '#60738045', 1);
      for (let i = 0; i < 6; i++) this.path([[item.x - 30 + i * 12, item.y + 8], [item.x - 24 + i * 12, item.y + 4 + i % 3], [item.x - 19 + i * 12, item.y + 13]], i % 2 ? '#7299aa' : '#d7fc70aa', null);
      return;
    }
    if (!dragging) this.instrument(item.kind, item.x, item.y, this.mobile ? 1.25 : 1);
    else {
      const point = this.point(this.gesture.x, this.gesture.y);
      this.ellipse(item.x, item.y + 12, 42, 10, '#d7fc7015', '#d7fc7099', 1.5);
      this.ctx.save(); this.ctx.setLineDash([4, 5]); this.line([[item.x, item.y], [point.x, point.y]], '#d7fc7088', 2); this.ctx.restore();
      this.instrument(item.kind, point.x, point.y, this.mobile ? 1.35 : 1.13, Math.sin(this.time * 6) * 0.045);
    }
    const names = ['显微镜', '结果电脑', '离心机', '试管架', '培养瓶', '跑胶仪'];
    this.label(names[item.id], item.x, item.y + (this.mobile ? 50 : item.id === 1 ? 44 : 30), this.fontSize(this.mobile ? 26 : 13, 12), '#b8c9c9');
    const aim = this.point(this.aim.x, this.aim.y);
    const hovered = this.closest(this.equipment, aim.x, aim.y)?.id === item.id;
    if (hovered && !this.gesture) this.ellipse(item.x, item.y + 9, 49, 12, null, '#d7fc7090', 1.5);
  }

  instrument(kind, x, y, scale = 1, rotation = 0) {
    const c = this.ctx; c.save(); c.translate(x, y); c.rotate(rotation); c.scale(scale, scale);
    this.ellipse(0, 10, 45, 11, '#060d1360');
    if (kind === 'microscope') {
      this.rect(-33, -1, 65, 14, 7, '#b8d1c7', C.ink, 2.5);
      c.beginPath(); c.moveTo(1, 0); c.bezierCurveTo(36, -28, 22, -79, 2, -84); c.lineTo(-6, -66); c.bezierCurveTo(10, -50, 12, -25, -9, 0); c.closePath(); c.fillStyle = '#8eb3b0'; c.fill(); c.strokeStyle = C.ink; c.lineWidth = 3; c.stroke();
      c.save(); c.translate(-12, -78); c.rotate(-0.36); this.rect(-11, -20, 22, 52, 5, '#e4edda', C.ink, 2.5); this.rect(-12, -24, 24, 10, 3, C.purple, C.ink, 2); this.rect(-6, 30, 12, 12, 2, '#547983', C.ink, 2); c.restore();
      this.rect(-31, -24, 43, 8, 3, '#5b8185', C.ink, 2); this.rect(-14, -27, 17, 3, 1, C.blue, null); this.ellipse(18, -41, 9, 9, C.purple, C.ink, 2); this.ellipse(18, -41, 3, 3, C.white);
    } else if (kind === 'monitor') {
      this.rect(-52, -104, 104, 76, 8, '#7494a4', '#adc6d2', 2);
      this.rect(-44, -96, 88, 57, 4, '#122d36', C.ink, 2);
      this.label('P > 0.05', 0, -77, 12, C.purple);
      this.line([[-33, -53], [-23, -53], [-17, -65], [-8, -48], [0, -55], [8, -51], [16, -68], [25, -56], [34, -58]], C.lime, 2);
      this.rect(-7, -27, 14, 31, 2, '#6f8e96'); this.ellipse(0, 7, 25, 7, '#8faba4', C.ink, 2);
      this.path([[-35, 16], [22, 14], [38, 24], [-22, 27]], '#bccfc5', C.ink, 1.5);
    } else if (kind === 'centrifuge') {
      this.path([[-48, -53], [29, -59], [49, -38], [-30, -30]], '#b2c8d2');
      this.path([[-48, -53], [-30, -30], [-30, 10], [-48, -12]], '#658297');
      this.path([[-30, -30], [49, -38], [49, 3], [-30, 10]], '#8eafbb');
      this.ellipse(-2, -48, 28, 11, '#263d52', '#7398b1', 3);
      this.ellipse(-2, -49, 22, 7, '#55788b', C.ink, 1.5);
      this.rect(-18, -16, 32, 12, 3, '#203d44', C.ink, 1); this.label('8000', -2, -7, 8, C.lime); this.ellipse(30, -13, 4, 4, C.pink);
    } else if (kind === 'tubes') {
      this.path([[-46, -14], [29, -19], [46, -4], [-29, 1]], '#7599a2');
      this.line([[-35, -7], [-34, 13]], '#8badb4', 4); this.line([[35, -9], [36, 9]], '#8badb4', 4);
      this.path([[-36, 9], [36, 5], [42, 12], [-30, 17]], '#506e83', C.ink, 1.5);
      [C.purple, C.lime, C.pink, C.blue].forEach((color, i) => { const xx = -27 + i * 18; this.rect(xx - 5, -63 - i % 2 * 9, 10, 56 + i % 2 * 9, 5, '#a3c7dd38', '#c0e1dc', 1.5); this.rect(xx - 3.5, -36, 7, 27, 3, color, null); this.rect(xx - 7, -67 - i % 2 * 9, 14, 6, 2, color, C.ink, 1.5); this.line([[xx - 2, -51], [xx - 2, -41]], '#eaf6e5aa', 1); });
    } else if (kind === 'flask') {
      const g = c.createLinearGradient(-26, -73, 29, 0); g.addColorStop(0, '#91cde563'); g.addColorStop(1, '#7ba9c221');
      c.beginPath(); c.moveTo(-12, -75); c.lineTo(-12, -40); c.lineTo(-37, 1); c.quadraticCurveTo(-38, 12, -25, 12); c.lineTo(25, 12); c.quadraticCurveTo(38, 12, 37, 1); c.lineTo(12, -40); c.lineTo(12, -75); c.closePath(); c.fillStyle = g; c.fill(); c.strokeStyle = '#bad6d9'; c.lineWidth = 2.5; c.stroke();
      this.path([[-26, -14], [26, -14], [34, 2], [25, 9], [-25, 9], [-34, 2]], '#b6a2f5c9', null); this.rect(-15, -81, 30, 9, 3, C.purple, C.ink, 1.5); this.ellipse(-6, -2, 3, 3, '#f1e7ffaa'); this.ellipse(9, -8, 2, 2, '#f1e7ffaa'); this.line([[-10, -62], [-10, -43]], '#effbeb70', 2);
    } else {
      this.path([[-45, -43], [27, -47], [46, -27], [-27, -22]], '#6e8a9c');
      this.path([[-27, -22], [46, -27], [46, 7], [-27, 12]], '#354e67');
      this.path([[-45, -43], [-27, -22], [-27, 12], [-45, -9]], '#253c51');
      this.path([[-31, -39], [20, -42], [31, -30], [-20, -27]], '#b6a2f536', '#b6a2f5', 1.5);
      for (let i = 0; i < 5; i++) this.line([[-20 + i * 10, -34], [-17 + i * 10, -31]], i % 2 ? C.purple : C.lime, 2.5);
      this.ellipse(32, -7, 3, 3, C.lime); this.rect(-13, -12, 27, 12, 3, '#142b38', null); this.label('RUN', 0, -3, 8, C.blue);
    }
    c.restore();
  }

  mentor() {
    const c = this.ctx, core = this.core;
    this.glow(core.x, core.y, 205, '#b6a2f51f');
    const shut = this.ended ? 0.55 : 1;
    c.save(); c.translate(core.x, core.y); c.rotate(this.reducedMotion ? -0.18 : this.time * 0.12 - 0.18); c.scale(shut, shut);
    this.ellipse(0, 0, 113, 49, null, '#b6a2f510', 24);
    this.ellipse(0, 0, 110, 45, null, '#b6a2f585', 5);
    this.ellipse(0, 0, 90, 39, null, '#ffc97ba5', 2);
    this.ellipse(0, 0, core.r, core.r, '#05060c', '#8c6bdb', 2);
    this.ellipse(0, 0, core.r - 8, core.r - 8, '#080811', '#b6a2f521', 8);
    c.restore();
    this.label(this.ended ? '免打扰已生效' : '内耗回收黑洞', core.x, core.y + 7, this.mobile ? 19 : 14, this.ended ? C.lime : '#e6d7ff');
    this.cards.forEach(card => {
      if (card.gone) return;
      if (this.gesture?.active && this.dragTarget?.id === card.id) {
        const point = this.point(this.gesture.x, this.gesture.y);
        c.save(); c.setLineDash([4, 6]); this.line([[point.x, point.y], [core.x, core.y]], '#b6a2f57a', 2); c.restore();
        this.chat(card.text, point.x, point.y, card.id, true);
      } else this.chat(card.text, card.x, card.y + (this.reducedMotion ? 0 : Math.sin(this.time * 1.5 + card.id) * 3), card.id);
    });
    this.replies.forEach(reply => {
      const slot = this.ended || this.bursting ? { x: 400, y: core.y + (this.mobile ? 150 : 138) } : this.cards[reply.id];
      const w = this.ended || this.bursting ? (this.mobile ? 680 : 410) : (this.mobile ? 340 : 222);
      const hh = this.mobile ? 78 : 54;
      this.rect(slot.x - w / 2, slot.y - hh / 2, w, hh, 16, '#243b30', '#d7fc7066', 1.5);
      this.label(reply.text, slot.x, slot.y + 8, this.fontSize(this.mobile ? 28 : 14, 13), C.lime);
    });
    if (this.ended) {
      this.paperPlane(core.x - 128, core.y - 125, 1, -0.22, C.lime);
      this.paperPlane(core.x + 136, core.y - 88, 0.8, 0.3, C.blue);
    }
  }

  chat(text, x, y, id, dragging = false, scale = 1) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale); c.rotate(dragging ? -0.055 : (id % 2 ? 0.025 : -0.025));
    const w = this.mobile ? 340 : 214, h = this.mobile ? 108 : 79;
    this.rect(-w / 2 + 5, -h / 2 + 8, w, h, 16, '#05070d60', null);
    const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); g.addColorStop(0, '#f0eadf'); g.addColorStop(1, '#cfd9d8');
    this.rect(-w / 2, -h / 2, w, h, 16, g, dragging ? C.lime : '#728795', dragging ? 2.5 : 1.5);
    this.ellipse(-w / 2 + 25, -h / 2 + 21, 9, 9, id % 2 ? '#9382ad' : '#678e98');
    this.label('导师  ·  刚刚', -w / 2 + 42, -h / 2 + 25, this.fontSize(this.mobile ? 22 : 11, 11), '#64747d', 'left');
    this.label(text, 0, 17, this.fontSize(this.mobile ? 30 : 17, 14), '#26363b');
    this.path([[w / 2 - 30, h / 2 - 1], [w / 2 - 15, h / 2 + 10], [w / 2 - 13, h / 2 - 1]], '#cfd9d8', '#728795', 1.2);
    c.restore();
  }

  earth() {
    const c = this.ctx, g = this.globe;
    this.glow(g.x, g.y, g.r * 1.8, '#5cabd525');
    this.orbits();
    if (this.bursting || this.ended) {
      const p = this.ended || this.reducedMotion ? 1 : clamp(this.burstAge / 1.5);
      if (p < 1) {
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * TAU, spread = p * 190;
          c.save(); c.translate(g.x + Math.cos(a) * spread, g.y + Math.sin(a) * spread); c.rotate(a + p * 0.3);
          this.path([[0, 0], [g.r * 0.72, -g.r * 0.23], [g.r * 0.96, g.r * 0.12], [g.r * 0.61, g.r * 0.38]], i % 3 ? '#497d94' : '#9cba79', '#97d1ed', 1.5); c.restore();
        }
      }
      if (p > 0.4) {
        const growth = this.reducedMotion ? 1 : clamp((p - 0.4) / 0.6);
        c.save(); c.globalAlpha = growth;
        this.ellipse(g.x, g.y + 54, 89 + growth * 33, 29, null, '#83d7f15a', 2);
        this.ellipse(g.x, g.y + 56, 72, 20, '#192d30', '#45666d', 2);
        this.line([[g.x, g.y + 55], [g.x, g.y - 15 * growth]], C.lime, 6);
        this.ellipse(g.x - 17, g.y + 18, 22, 9, C.lime, null, 1, 0.45);
        this.ellipse(g.x + 17, g.y + 7, 22, 9, '#9bce77', null, 1, -0.45);
        for (let i = 0; i < 6; i++) this.ellipse(g.x + Math.cos(i * TAU / 6) * 17, g.y - 29 + Math.sin(i * TAU / 6) * 17, 13, 15, C.purple, '#cfc0f7', 1);
        this.ellipse(g.x, g.y - 29, 11, 11, C.gold, C.ink, 1.5);
        this.label('新世界加载中', g.x, g.y + 112, this.mobile ? 25 : 17, C.blue);
        c.restore();
      }
    } else {
      this.globeSurface(g.x, g.y, g.r);
      c.save(); c.translate(g.x, g.y); c.beginPath(); c.arc(0, 0, g.r, 0, TAU); c.clip();
      this.cracks.forEach((crack, i) => {
        const x = crack.x * g.r, y = crack.y * g.r, length = (35 + crack.power * 12) * g.r / 142;
        c.save(); c.translate(x, y); c.rotate(crack.angle + i * 0.6);
        this.glow(0, 0, length * 0.7, '#ffc97b35');
        this.line([[-length * 0.7, -10], [-length * 0.28, 4], [0, 0], [length * 0.23, 16], [length * 0.66, 7], [length, 30]], '#ffcd82', 2.4);
        this.line([[0, 0], [6, -length * 0.3], [24, -length * 0.57]], '#ffe0a3', 1.3);
        this.ellipse(0, 0, 8 + crack.power * 2, 6, '#243c49', '#efb66b', 1); c.restore();
      }); c.restore();
    }
  }

  globeSurface(x, y, r) {
    const c = this.ctx; c.save(); c.translate(x, y);
    this.ellipse(0, 0, r + 10, r + 10, null, '#83d7f119', 13);
    this.ellipse(0, 0, r + 4, r + 4, null, '#83d7f164', 2);
    const sea = c.createLinearGradient(-r, -r, r, r); sea.addColorStop(0, '#8accdf'); sea.addColorStop(0.4, '#468ca9'); sea.addColorStop(1, '#163647');
    this.ellipse(0, 0, r, r, sea, '#b4e4ec', 1.7);
    c.save(); c.beginPath(); c.arc(0, 0, r - 1, 0, TAU); c.clip(); c.scale(r / 100, r / 100); c.rotate(this.reducedMotion ? -0.15 : Math.sin(this.time * 0.16) * 0.22 - 0.15);
    this.path([[-85, -33], [-69, -60], [-35, -77], [-5, -68], [1, -49], [-18, -32], [-27, -39], [-33, -14], [-46, -6], [-61, -22]], '#b2c88b', null);
    this.path([[-41, -2], [-19, 6], [-2, 24], [-11, 42], [-23, 81], [-38, 64], [-40, 40], [-54, 18]], '#9dc17f', null);
    this.path([[5, -78], [49, -68], [80, -43], [105, -8], [69, -14], [54, 3], [37, -3], [21, -31], [4, -33], [-4, -49]], '#c6d293', null);
    this.path([[22, -14], [49, -2], [53, 28], [32, 57], [17, 38], [10, 4]], '#a5bd79', null);
    this.path([[67, 52], [89, 58], [91, 76], [64, 71], [54, 61]], '#c6d293', null);
    this.path([[-41, -88], [-23, -94], [6, -92], [22, -84], [-3, -78]], '#e0ece0', null);
    this.ellipse(-12, -22, 92, 9, null, '#eef6e540', 4, -0.18);
    this.ellipse(17, 38, 87, 7, null, '#eef6e533', 5, -0.18);
    this.ellipse(-6, -63, 70, 5, null, '#eef6e522', 4, -0.18);
    const shade = c.createLinearGradient(-87, -69, 94, 63); shade.addColorStop(0, '#d7f5fa05'); shade.addColorStop(0.5, '#142a3a00'); shade.addColorStop(1, '#071721b8');
    this.ellipse(0, 0, 100, 100, shade); c.restore(); c.restore();
  }

  orbits() {
    if (this.ended) return;
    const c = this.ctx, g = this.globe, rx = this.mobile ? 308 : 278, ry = this.mobile ? 252 : 155;
    c.save(); c.setLineDash([3, 6]); this.ellipse(g.x, g.y, rx, ry, null, '#83d7f13a', 1, -0.16); c.restore();
    ['DDL', '组会', '返修'].forEach((text, i) => {
      const a = i * TAU / 3 + (this.reducedMotion ? 0.4 : this.time * 0.11 + 0.4);
      const escape = this.bursting ? this.burstAge * 230 : 0;
      const x = g.x + Math.cos(a) * (rx + escape), y = g.y + Math.sin(a) * (ry + escape);
      c.save(); c.translate(x, y); c.rotate(-0.16);
      this.rect(-19, -11, 38, 22, 5, '#a6b7c8', C.ink, 1.5);
      this.rect(-45, -12, 22, 24, 2, '#426892', '#88b4d2', 1); this.rect(23, -12, 22, 24, 2, '#426892', '#88b4d2', 1);
      for (let j = 0; j < 2; j++) { this.line([[-42, -5 + j * 9], [-26, -5 + j * 9]], '#a1cdeb70', 1); this.line([[26, -5 + j * 9], [42, -5 + j * 9]], '#a1cdeb70', 1); }
      this.label(text, 0, 4, 10, '#213641'); c.restore();
    });
  }

  mice() {
    const c = this.ctx, h = this.H;
    const stageY = this.mobile ? h * 0.73 : h * 0.74;
    this.platform(400, stageY, 724, this.mobile ? 260 : 108);
    c.save(); c.globalAlpha = this.reducedMotion ? 0.14 : 0.16 + Math.sin(this.time * 3) * 0.025;
    [[128, C.purple, 343], [665, C.pink, 445], [400, C.lime, 605]].forEach(([x, color, end]) => this.path([[x, 78], [end - 92, stageY + 38], [end + 92, stageY + 38]], color, null)); c.restore();
    this.speaker(this.mobile ? 89 : 108, stageY - 35, this.mobile ? 1.13 : 1);
    this.speaker(this.mobile ? 711 : 692, stageY - 35, this.mobile ? 1.13 : 1);
    const djY = this.mobile ? h * 0.44 : 201;
    this.mouse(400, djY, this.mobile ? 1.56 : 1.05, 'dj', 0);
    this.path([[312, djY + 37], [466, djY + 31], [490, djY + 58], [333, djY + 65]], '#50526d', '#9b8fce', 2);
    this.ellipse(357, djY + 49, 28, 9, '#172332', '#ad9cf3', 2); this.ellipse(435, djY + 45, 28, 9, '#172332', '#ad9cf3', 2);
    this.ellipse(357, djY + 49, 7, 3, C.pink); this.ellipse(435, djY + 45, 7, 3, C.lime);
    const colors = [C.pink, C.blue, C.lime, C.purple];
    for (let i = 0; i < 16; i++) {
      const x = 173 + i % 8 * 66, y = stageY + Math.floor(i / 8) * 25;
      const alpha = this.reducedMotion ? '50' : Math.sin(this.time * 4 + i) > 0 ? '75' : '28';
      this.path([[x, y], [x + 47, y - 2], [x + 64, y + 15], [x + 15, y + 18]], `${colors[i % 4]}${alpha}`, null);
    }
    const spots = this.mobile ? [[205, h * 0.59], [595, h * 0.60], [315, h * 0.74], [495, h * 0.74], [185, h * 0.82], [615, h * 0.82], [310, h * 0.86], [490, h * 0.86], [400, h * 0.62]] : [[220, 306], [578, 292], [326, 326], [467, 317], [159, 255], [644, 250], [283, 239], [519, 239], [400, 355]];
    spots.slice(0, this.guests - 1).forEach(([x, y], i) => this.mouse(x, Math.min(y, h - 120), this.mobile ? 1.30 : 0.75, ['party', 'vacation', 'scientist'][i % 3], i + 1));
    if (this.ended || this.bursting) {
      const yy = this.mobile ? h - 174 : h - 96;
      this.rect(265, yy - 3, 270, 48, 14, '#9d81c3', '#ddc3ff', 2);
      this.ellipse(309, yy + 44, 15, 15, '#20303a', '#9fb7c4', 3); this.ellipse(493, yy + 44, 15, 15, '#20303a', '#9fb7c4', 3);
      this.label('带 薪 休 假 号', 400, yy + 26, this.mobile ? 23 : 18, C.white);
      this.line([[531, yy + 6], [558, yy - 61]], C.lime, 2);
      this.path([[553, yy - 61], [641, yy - 57], [620, yy - 29], [541, yy - 35]], C.lime, '#31472d', 1.5); this.label('鼠鼠篡位', 592, yy - 41, 14, '#29412c');
    }
    this.discoBall(400, this.mobile ? 97 : 65);
  }

  speaker(x, y, scale) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    this.rect(-29, -100, 58, 102, 9, '#273244', '#77749d', 2);
    this.ellipse(0, -70, 17, 17, '#111b29', '#a38ce1', 2); this.ellipse(0, -27, 22, 22, '#111b29', '#a38ce1', 2);
    this.ellipse(0, -70, 7, 7, '#635683'); this.ellipse(0, -27, 9, 9, C.purple);
    c.restore();
  }

  discoBall(x, y) {
    this.line([[x, 0], [x, y - 20]], '#71859a', 1.5);
    this.ellipse(x, y, 23, 23, '#aea0d8', '#e3d5ff', 2);
    for (let i = -1; i <= 1; i++) { this.line([[x - 20, y + i * 10], [x + 20, y + i * 10]], '#736588', 1.2); this.line([[x + i * 11, y - 20], [x + i * 11, y + 20]], '#736588', 1.2); }
    this.ellipse(x - 8, y - 8, 3, 3, C.white);
  }

  mouse(x, y, scale, outfit = 'scientist', id = 0) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    const party = this.mode === 'mice', dance = party && !this.reducedMotion ? Math.sin(this.time * (5.2 + this.hits * 0.12) + id * 1.2) : 0;
    c.translate(0, -Math.abs(dance) * 10); c.rotate(dance * 0.09);
    this.ellipse(0, 41, 37, 10, '#06101d50');
    c.beginPath(); c.moveTo(23, 10); c.bezierCurveTo(68, 30, 54, 47, 33, 44); c.strokeStyle = '#ceb3ba'; c.lineWidth = 4; c.stroke();
    this.ellipse(-17, 34, 15, 7, '#b4c4bb', C.ink, 2); this.ellipse(17, 34, 15, 7, '#b4c4bb', C.ink, 2);
    const color = outfit === 'scientist' ? '#dce8dc' : outfit === 'vacation' ? C.gold : outfit === 'dj' ? '#a794d5' : [C.pink, C.blue, C.lime][id % 3];
    this.path([[-26, -4], [-20, 30], [20, 31], [26, -4], [8, -15], [-8, -15]], color, C.ink, 2.5);
    if (outfit === 'scientist') { this.path([[-12, -9], [0, 3], [-8, 12], [-18, -9]], '#adc3b7', C.ink, 1); this.path([[12, -9], [0, 3], [8, 12], [18, -9]], '#adc3b7', C.ink, 1); this.line([[0, 4], [0, 29]], '#749589', 1); this.rect(12, 12, 9, 8, 1, '#a3b7a6', null); }
    if (outfit === 'vacation') for (let i = 0; i < 3; i++) this.line([[-19, 4 + i * 8], [20, 4 + i * 8]], '#e9a184', 3);
    c.save(); c.translate(-25, -3); c.rotate(party ? -0.6 - dance * 0.5 : -0.1); this.rect(-8, 0, 13, 26, 6, color, C.ink, 2); this.ellipse(-1, 26, 6, 5, '#dce4d7', C.ink, 1.5); c.restore();
    c.save(); c.translate(25, -3); c.rotate(party ? 0.6 + dance * 0.5 : -0.45); this.rect(-5, 0, 13, 25, 6, color, C.ink, 2); this.ellipse(2, 26, 6, 5, '#dce4d7', C.ink, 1.5); c.restore();
    this.ellipse(-26, -57, 20, 22, '#d7e0d3', C.ink, 2.5, -0.25); this.ellipse(26, -57, 20, 22, '#d7e0d3', C.ink, 2.5, 0.25);
    this.ellipse(-26, -57, 12, 14, '#cfacbe', null, 2, -0.25); this.ellipse(26, -57, 12, 14, '#cfacbe', null, 2, 0.25);
    const head = c.createLinearGradient(-26, -64, 32, -7); head.addColorStop(0, '#f0f3df'); head.addColorStop(1, '#b1c7bd');
    this.ellipse(0, -33, 36, 34, head, C.ink, 2.5); this.ellipse(-23, -20, 7, 4, '#db91ae60'); this.ellipse(23, -20, 7, 4, '#db91ae60');
    if (outfit === 'dj') { this.line([[-36, -37], [-36, -55], [-25, -72], [25, -72], [36, -55], [36, -37]], '#423c5d', 7); this.rect(-43, -46, 11, 22, 5, C.pink, C.ink, 2); this.rect(32, -46, 11, 22, 5, C.pink, C.ink, 2); }
    if (outfit === 'scientist') { this.line([[-33, -39], [33, -39]], '#546a81', 4); this.rect(-29, -46, 25, 22, 8, '#b6a2f526', '#536b83', 3); this.rect(4, -46, 25, 22, 8, '#b6a2f526', '#536b83', 3); this.line([[-4, -37], [4, -37]], '#536b83', 3); this.line([[-21, -42], [-12, -42]], '#f8fced90', 2); this.line([[10, -42], [19, -42]], '#f8fced90', 2); }
    if (party) { this.line([[-22, -33], [-17, -37], [-12, -33]], C.ink, 2); this.line([[12, -33], [17, -37], [22, -33]], C.ink, 2); }
    else { this.ellipse(-17, -34, 3, 4, C.ink); this.ellipse(17, -34, 3, 4, C.ink); this.ellipse(-16, -35, 1, 1, C.white); this.ellipse(18, -35, 1, 1, C.white); }
    this.ellipse(0, -18, 4, 3, '#bb809e', C.ink, 1); this.line([[0, -15], [0, -10], [-5, -7]], C.ink, 1.3); this.line([[0, -10], [5, -7]], C.ink, 1.3);
    this.line([[-23, -14], [-42, -19]], '#62796e', 1); this.line([[-23, -10], [-41, -7]], '#62796e', 1); this.line([[23, -14], [42, -19]], '#62796e', 1); this.line([[23, -10], [41, -7]], '#62796e', 1);
    if (outfit === 'party') { this.path([[-14, -67], [0, -95], [14, -67]], id % 2 ? C.lime : C.purple, C.ink, 1.5); this.ellipse(0, -96, 4, 4, C.pink); }
    if (outfit === 'vacation') { this.ellipse(0, -65, 37, 7, C.gold, C.ink, 1.5); this.rect(-20, -79, 40, 14, 4, C.gold, C.ink, 1.5); this.line([[-20, -68], [20, -68]], C.purple, 3); }
    c.restore();
  }

  rocket(x, y, scale, mouse = false) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    this.glow(0, 42, 65, '#b6a2f522');
    this.path([[-24, 14], [-43, 43], [-26, 49], [-15, 29]], C.purple, C.ink, 2);
    this.path([[24, 14], [43, 43], [26, 49], [15, 29]], C.purple, C.ink, 2);
    c.beginPath(); c.moveTo(-23, 36); c.bezierCurveTo(-35, -5, -20, -48, 0, -61); c.bezierCurveTo(20, -48, 35, -5, 23, 36); c.closePath(); c.fillStyle = '#dce8dc'; c.fill(); c.strokeStyle = C.ink; c.lineWidth = 2.5; c.stroke();
    this.ellipse(0, -9, 19, 20, '#6e9db4', '#384f60', 3);
    if (mouse) { this.ellipse(-9, -17, 6, 7, '#d6ddd2'); this.ellipse(9, -17, 6, 7, '#d6ddd2'); this.ellipse(0, -8, 12, 11, '#edf2df'); this.line([[-7, -10], [-4, -12], [-1, -10]], C.ink, 1); this.line([[1, -10], [4, -12], [7, -10]], C.ink, 1); this.ellipse(0, -3, 2, 1.5, C.pink); }
    const flicker = this.reducedMotion ? 0 : Math.sin(this.time * 15) * 8;
    this.path([[-14, 41], [0, 81 + flicker], [14, 41]], C.lime, null); this.path([[-6, 41], [0, 65 + flicker * 0.5], [6, 41]], C.white, null);
    c.restore();
  }

  paperPlane(x, y, scale = 1, rotation = 0, color = C.white) {
    const c = this.ctx; c.save(); c.translate(x, y); c.rotate(rotation); c.scale(scale, scale);
    this.path([[-36, -17], [42, -5], [-12, 27], [-7, 0]], color, C.ink, 1.5);
    this.path([[-36, -17], [-7, 0], [42, -5]], '#a8c4cf', C.ink, 1.2);
    this.line([[-7, 0], [-12, 27]], '#6c8392', 1); c.restore();
  }

  drawFlights() {
    const c = this.ctx;
    this.flights.forEach(flight => {
      const p = clamp(flight.age / flight.life);
      if (this.reducedMotion) return;
      if (flight.kind === 'equipment') {
        const shrink = flight.sink ? 1 - p : 1;
        c.save(); c.globalAlpha = flight.sink ? 1 - p : Math.min(1, (1 - p) * 3);
        this.instrument(flight.item.kind, flight.x, flight.y, shrink * (this.mobile ? 1.2 : 1), flight.rotation + (flight.sink ? p * 3 : 0)); c.restore();
      } else if (flight.kind === 'plane') {
        const x = flight.originX + p * 680, y = flight.originY - Math.sin(p * Math.PI) * 140 - p * 200;
        this.line([[x - 100, y + 20], [x - 47, y + 8]], '#d7fc7080', 2);
        this.paperPlane(x, y, this.mobile ? 1.4 : 0.9, -0.28, C.lime);
      } else if (flight.muted) {
        const x = flight.originX, y = flight.originY - p * 65;
        c.save(); c.globalAlpha = 1 - p;
        this.ellipse(x, y, 64 + p * 10, 47 + p * 10, '#83d7f121', '#a1e8f1', 2);
        this.label('已静音', x, y + 7, this.mobile ? 25 : 18, C.blue);
        c.restore();
      } else {
        const ease = p * p, x = flight.originX + (this.core.x - flight.originX) * ease, y = flight.originY + (this.core.y - flight.originY) * ease;
        c.save(); c.globalAlpha = 1 - p * 0.8; c.translate(x, y); c.rotate(p * p * 2.5);
        this.chat(flight.item.text, 0, 0, flight.item.id, false, 1 - p * 0.9); c.restore();
      }
    });
  }

  drawEffects() {
    const c = this.ctx;
    this.rings.forEach(ring => { const p = clamp(ring.age / ring.life); c.save(); c.globalAlpha = (1 - p) * 0.75; const r = 12 + p * (ring.big ? 295 : 98); this.ellipse(ring.x, ring.y, r, r, null, ring.color, ring.big ? 4 : 2); c.restore(); });
    this.effects.forEach(effect => {
      const p = clamp(effect.age / effect.life), x = effect.x, y = effect.y;
      c.save(); c.globalAlpha = this.reducedMotion ? 0.65 : Math.min(1, (1 - p) * 3);
      if (effect.kind === 'hammer') {
        c.translate(x + 50, y - 57); c.rotate(this.reducedMotion ? -0.5 : -1.35 + p * 2.05);
        this.rect(-5, -5, 11, 81, 5, '#d7b49a', C.ink, 2); this.rect(-40, -21, 80, 31, 7, '#8eacd0', '#e0edf4', 2); this.line([[-32, -14], [29, -14]], '#d6f2fa', 3);
      } else if (effect.kind === 'gravity' || effect.kind === 'blackhole') {
        this.glow(x, y, 100, '#b6a2f544');
        for (let i = 0; i < 3; i++) this.ellipse(x, y, 20 + i * 17 + p * 20, 8 + i * 10 + p * 10, null, [C.purple, C.pink, C.blue][i], 2.5, this.reducedMotion ? -0.4 : p * 3 + i);
        this.ellipse(x, y, 20 + p * 12, 20 + p * 12, '#060910', C.purple, 2);
      } else if (effect.kind === 'rainbow') {
        for (let i = 0; i < 4; i++) this.line([[x - 96, y - 80 + i * 6], [x - 33, y - 27 + i * 6], [x + 9, y + 22 + i * 6]], [C.pink, C.gold, C.lime, C.blue][i], 7);
      } else if (effect.kind === 'mute') {
        this.ellipse(x, y, 52 + p * 22, 45 + p * 15, '#83d7f135', '#83d7f1a0', 2);
        this.label('Z z z', x, y + 7, 25, C.blue); this.label('已静音', x, y + 30, 13, C.white);
      } else if (effect.kind === 'meteor') {
        const t = this.reducedMotion ? 1 : Math.min(1, p * 2.6), mx = x - (1 - t) * 195, my = y - (1 - t) * 220;
        this.line([[mx - 113, my - 122], [mx - 50, my - 54], [mx, my]], '#ffc97b55', 20); this.line([[mx - 75, my - 82], [mx, my]], C.gold, 6);
        this.ellipse(mx, my, 17, 14, '#866d7b', C.gold, 2); this.ellipse(mx - 4, my - 3, 4, 3, '#b3a2a4');
      } else if (effect.kind === 'laser') {
        this.line([[71, 93], [x, y]], '#ff91bc28', 19); this.line([[71, 93], [x, y]], '#ff91bcaa', 6); this.line([[71, 93], [x, y]], '#fff1eb', 2);
        this.glow(x, y, 65, '#ff91bc77'); this.rect(39, 77, 51, 27, 7, '#7587a0', C.ink, 2); this.ellipse(x, y, 11, 11, C.white);
      } else if (effect.kind === 'bubbles') {
        for (let i = 0; i < 7; i++) { const xx = x + Math.sin(i * 1.9) * 75, yy = y - p * 112 - i * 13; this.ellipse(xx, yy, 12 + i % 3 * 5, 12 + i % 3 * 5, '#83d7f112', '#a2eaf39a', 2); this.ellipse(xx - 4, yy - 5, 3, 2, '#e6fcffb0'); }
      } else if (effect.kind === 'snacks') {
        this.ellipse(x, y + 12, 50, 16, '#d8e1dd', C.ink, 2); this.ellipse(x - 16, y, 16, 12, C.gold, '#ac749a', 2); this.ellipse(x - 16, y, 6, 4, '#263141', null); this.rect(x + 13, y - 38, 21, 43, 5, '#83d7f170', '#b4eff2', 2); this.line([[x + 21, y - 46], [x + 26, y - 3]], C.pink, 3); this.label('带薪补给', x, y + 50, this.mobile ? 24 : 17, C.lime);
      } else if (effect.kind === 'disco' || effect.kind === 'festival') {
        const texts = ['鼠鼠不卷了', '带薪蹦迪', '导师请排队', '下班万岁'];
        this.label(texts[(this.hits - 1 + 4) % 4], x, y - 43 - p * 25, this.mobile ? 29 : 23, C.lime);
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; this.line([[x + Math.cos(a) * 25, y + Math.sin(a) * 25], [x + Math.cos(a) * (68 + p * 45), y + Math.sin(a) * (68 + p * 45)]], [C.pink, C.blue, C.lime][i % 3], 3); }
      }
      c.restore();
    });
  }

  drawParticles() {
    const c = this.ctx;
    this.particles.forEach(particle => {
      c.save(); c.translate(particle.x, particle.y); c.rotate(particle.rotation); c.globalAlpha = clamp((particle.life - particle.age) * 2);
      const s = particle.size;
      if (particle.kind === 'letter') this.label(particle.text, 0, 0, 16 + s, particle.color);
      else if (particle.kind === 'bubble') { this.ellipse(0, 0, s * 1.7, s * 1.7, '#83d7f112', '#a2eaf3a0', 1.4); this.ellipse(-s / 2, -s / 2, 2, 2, C.white); }
      else if (particle.kind === 'earth' || particle.kind === 'metal') this.path([[-s, -s * 0.35], [-s * 0.3, -s], [s, 0], [s * 0.5, s * 0.8]], particle.color, C.ink, 0.8);
      else if (particle.kind === 'confetti') this.rect(-s * 0.4, -s, s * 0.8, s * 2, 1, particle.color, null);
      else this.ellipse(0, 0, s, particle.kind === 'paint' ? s * 0.65 : s, particle.color);
      c.restore();
    });
  }

  drawCharge() {
    if (this.charge <= 0) return;
    const c = this.ctx, g = this.mode === 'earth' ? this.globe : this.point(this.aim.x, this.aim.y);
    const r = this.mode === 'earth' ? g.r + 21 : 38;
    this.ellipse(g.x, g.y, r, r, null, '#d7fc7025', 4);
    c.beginPath(); c.arc(g.x, g.y, r, -Math.PI / 2, -Math.PI / 2 + this.charge * TAU); c.strokeStyle = this.charge > 0.8 ? C.gold : C.lime; c.lineWidth = 6; c.stroke();
    if (this.mode === 'earth') { this.glow(g.x, g.y, g.r * 1.7, `rgba(255,201,123,${this.charge * 0.16})`); this.label(`${Math.round(this.charge * 100)}%`, g.x, g.y + 9, this.mobile ? 43 : 29, C.white); }
  }
}
