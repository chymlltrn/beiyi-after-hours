const TAU = Math.PI * 2;
const C = { ink: '#293c46', white: '#f5f0e8', lime: '#bac8a1', purple: '#b3a9c6', pink: '#d4adb3', blue: '#a7c3cd', gold: '#d9c5a1' };
const TOOLS = { lab: ['hammer', 'gravity', 'rainbow'], mentor: ['shred', 'mute', 'reply'], earth: ['meteor', 'laser', 'blackhole'], mice: ['disco', 'bubbles', 'snacks'] };
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const LAB_KINDS = {
  phd: ['microscope', 'monitor', 'centrifuge', 'tubes', 'flask', 'gel'],
  doctor: ['clipboard', 'pager', 'clock', 'folders', 'cup', 'keyboard'],
  teacher: ['books', 'board', 'pencils', 'worksheets', 'cup', 'bell']
};
const LAB_NAMES = {
  phd: ['显微镜', '结果电脑', '离心机', '试管架', '培养瓶', '跑胶仪'],
  doctor: ['交班记录', '待办提醒', '值班时钟', '文书堆', '凉掉的咖啡', '录入键盘'],
  teacher: ['备课书', '板书', '铅笔筒', '作业堆', '保温杯', '上课铃']
};

/** Four local arcade worlds. The application owns input, sound and counters. */
export class Universe {
  constructor(canvas, { reducedMotion = false, onComplete } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reducedMotion = reducedMotion;
    this.onComplete = onComplete;
    this.mode = 'lab';
    this.persona = 'phd';
    this.scenes = null;
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
    this.splitFragments = [];
    this.explosions = [];
    this.worldTexture = null;
    this.replies = [];
    this.equipment = this.paintFor('lab').equipmentKinds.slice(0, 6).map((kind, i) => ({ kind, id: i, gone: false }));
    this.cards = this.paintFor('mentor').cards.slice(0, 5).map((text, i) => ({ text, id: i, gone: false }));
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

  setPersona(key, scenes) {
    this.persona = LAB_KINDS[key] ? key : 'phd';
    this.scenes = scenes && typeof scenes === 'object' ? scenes : null;
    this.reset();
  }

  get burstDuration() { return this.reducedMotion ? 0.45 : 2.6; }

  paintFor(scene = this.mode) {
    const fallback = {
      equipmentKinds: LAB_KINDS[this.persona], equipmentNames: LAB_NAMES[this.persona],
      cards: ['再补一组实验', '周末来一下', '这个很简单', '明天给我初稿', '再看一个机制'],
      speaker: this.persona === 'doctor' ? '工作消息' : this.persona === 'teacher' ? '工作群' : '导师',
      replies: ['收到，我先下班。', '周末需要休息。', '明天再继续。', '今天先到这里。', '这次就不顺便了。'],
      satellites: this.persona === 'doctor' ? ['夜班', '排班', '文书'] : this.persona === 'teacher' ? ['备课', '批改', '表格'] : ['DDL', '组会', '返修'],
      sceneTag: { lab: '抓住它，往外一甩', mentor: '把消息拖进这里，休息一会儿', earth: '按住，再松手', mice: '点一点，一起放松' }[scene],
      endingTag: { lab: '今天的工作先放下。', mentor: '已开启免打扰。', earth: '留一点时间，给自己。', mice: '今天辛苦了，一起歇一会儿。' }[scene],
      partyLabel: this.persona === 'doctor' ? '茶歇时间' : this.persona === 'teacher' ? '下课啦' : '下班派对'
    };
    const supplied = this.scenes?.[scene]?.paint || {};
    const merged = { ...fallback, ...supplied };
    for (const field of ['equipmentKinds', 'equipmentNames', 'cards', 'replies', 'satellites']) {
      if (!Array.isArray(merged[field]) || merged[field].length < fallback[field].length) merged[field] = fallback[field];
    }
    return merged;
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
    if (this.persona === 'doctor' || this.persona === 'teacher') {
      const doctor = this.persona === 'doctor';
      this.effects.push({ kind: doctor ? 'handoff' : item.kind === 'board' ? 'erase' : 'fold', x: releasedAt.x, y: releasedAt.y - 38, age: 0, life: doctor ? 0.95 : 0.8 });
      this.ring(releasedAt.x, releasedAt.y - 30, doctor ? C.gold : C.purple);
      this.splitEquipment(item, releasedAt, false, doctor ? 0.16 : 0.08);
      this.emit(releasedAt.x, releasedAt.y - 30, 12 + this.intensity * 5, doctor ? 'page' : item.kind === 'board' ? 'chalk' : 'crane');
      if (this.tool === 'gravity') this.effects.push({ kind: 'gravity', x: releasedAt.x, y: releasedAt.y - 35, age: 0, life: 0.7 });
      if (this.tool === 'rainbow') this.splashes.push({ x: releasedAt.x, y: releasedAt.y + 5, color: doctor ? C.blue : C.purple });
      return;
    }
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
      if (!fling) this.splitEquipment(item, releasedAt, false);
    }
    if (this.splashes.length > 8) this.splashes.shift();
  }

  hitMentor(point, options) {
    const selected = this.dragTarget && !this.cards[this.dragTarget.id]?.gone ? this.cards[this.dragTarget.id] : this.closest(this.cards, point.x, point.y);
    if (!selected) { this.emit(this.core.x, this.core.y, 18, 'letter', '已下班'); return; }
    const card = this.cards[selected.id];
    const releasedAt = Number.isFinite(options.endX) && Number.isFinite(options.endY) ? this.point(options.endX, options.endY) : card;
    card.gone = true;
    const replies = this.paintFor('mentor').replies;
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
    this.emit(x, y, 22 + Math.round(power * 15), this.tool === 'blackhole' ? 'void' : this.persona === 'teacher' ? 'page' : this.persona === 'doctor' ? 'clock' : 'earth');
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
    this.shake = this.reducedMotion ? 0 : 0.20 + this.intensity * 0.055;
    if (this.mode === 'lab') {
      this.equipment.forEach((item, i) => {
        item.gone = true;
        this.splitEquipment(item, item, true, this.persona === 'doctor' ? 0.16 + i * 0.025 : i * 0.025);
        this.emit(item.x, item.y - 20, this.persona === 'phd' ? 9 : 17, this.persona === 'doctor' ? 'page' : this.persona === 'teacher' ? 'crane' : 'metal', '', true);
      });
      this.ring(400, this.mobile ? this.H * 0.5 : 270, C.lime, true);
      if (this.persona === 'doctor') this.effects.push({ kind: 'handoff', x: 400, y: this.H * 0.48, age: 0, life: 1.1, large: true });
      if (this.persona === 'teacher') this.effects.push({ kind: 'fold', x: 400, y: this.H * 0.48, age: 0, life: 1.1, large: true });
    } else if (this.mode === 'mentor') {
      this.cards.forEach(card => { if (!card.gone) { card.gone = true; this.flights.push({ kind: 'card', item: { ...card }, x: card.x, y: card.y, originX: card.x, originY: card.y, age: 0, life: 1.3, rotation: 0 }); } });
      this.replies = [{ text: this.paintFor('mentor').replies[0], id: 0 }];
      this.emit(this.core.x, this.core.y, 90, 'letter', '今天先到这里');
      this.ring(this.core.x, this.core.y, C.purple, true);
    } else if (this.mode === 'earth') {
      this.splitWorld();
      this.emit(this.globe.x, this.globe.y, 55, this.persona === 'teacher' ? 'page' : this.persona === 'doctor' ? 'clock' : 'earth', '', true);
      this.ring(this.globe.x, this.globe.y, C.blue, true);
    } else {
      this.guests = 10;
      this.emit(400, this.H * 0.42, 230, 'confetti', '', true);
      this.effects.push({ kind: 'festival', x: 400, y: this.H * 0.42, age: 0, life: this.burstDuration });
      this.ring(400, this.H * 0.5, C.pink, true);
    }
    const center = this.mode === 'earth' ? this.globe : this.mode === 'mentor' ? this.core : { x: 400, y: this.H * 0.52 };
    this.explosions.push({ x: center.x, y: center.y, age: 0, life: this.burstDuration, power: this.intensity / 2, radius: this.mode === 'earth' ? this.globe.r : this.mobile ? 170 : 120 });
    this.trim(); this.draw(); this.wake();
  }

  reset() { this.resetState(); this.layout(); this.draw(); this.wake(); }

  captureTexture(width, height, drawTexture) {
    const surface = document.createElement('canvas');
    surface.width = Math.ceil(width * 2); surface.height = Math.ceil(height * 2);
    const textureContext = surface.getContext('2d');
    const previousContext = this.ctx;
    try {
      this.ctx = textureContext;
      textureContext.scale(2, 2);
      textureContext.lineCap = 'round'; textureContext.lineJoin = 'round';
      drawTexture();
    } finally { this.ctx = previousContext; }
    return surface;
  }

  splitEquipment(item, origin, big = false, delay = 0) {
    const texture = this.captureTexture(144, 150, () => this.instrument(item.kind, 72, 119));
    const force = (big ? 205 : 95) * (0.55 + this.intensity * 0.25);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const localX = col * 48 + 24 - 72, localY = row * 50 + 25 - 119;
      const angle = Math.atan2(localY - 15, localX || (col - 1) * 20) + (Math.random() - 0.5) * 0.4;
      this.splitFragments.push({ kind: 'material', texture, sourceX: col * 96, sourceY: row * 100, sourceW: 96, sourceH: 100,
        width: 48, height: 50, x: origin.x + localX, y: origin.y + localY, originX: origin.x + localX, originY: origin.y + localY,
        vx: Math.cos(angle) * force + (big ? (item.x - 400) * 0.55 : 0), vy: Math.sin(angle) * force - (big ? 105 : 45),
        age: 0, life: big ? 2.6 : 1.6, delay, rotation: 0, spin: (col - 1.2) * 1.8 + (row - 1) * 0.9, gravity: 100 });
    }
    this.trim();
  }

  splitWorld() {
    const g = this.globe, span = g.r + 16;
    this.worldTexture = this.captureTexture(span * 2, span * 2, () => this.worldSurface(span, span, g.r));
    const count = this.persona === 'teacher' ? 14 : 12;
    const speed = (185 + g.r * 0.32) * (0.55 + this.intensity * 0.3);
    for (let i = 0; i < count; i++) {
      const start = i * TAU / count - Math.PI / 2, end = (i + 1) * TAU / count - Math.PI / 2;
      const angle = (start + end) / 2;
      this.splitFragments.push({ kind: 'world', texture: this.worldTexture, span, radius: g.r, start, end, angle,
        x: g.x, y: g.y, originX: g.x, originY: g.y, vx: Math.cos(angle) * speed * (0.82 + i % 3 * 0.14), vy: Math.sin(angle) * speed,
        age: 0, life: this.burstDuration, rotation: 0, spin: (i % 2 ? 1 : -1) * (0.18 + i % 3 * 0.06), gravity: 0 });
    }
  }

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
    this.splitFragments.length = 0;
    this.explosions.length = 0;
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
      if (p.age >= (p.delay || 0)) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.rotation += p.spin * dt; }
      return p.age < p.life;
    });
    this.effects = this.effects.filter(effect => { effect.age += elapsed; return effect.age < effect.life; });
    this.explosions = this.explosions.filter(effect => { effect.age += elapsed; return effect.age < effect.life; });
    this.rings = this.rings.filter(ring => { ring.age += elapsed; return ring.age < ring.life; });
    this.splitFragments = this.splitFragments.filter(fragment => {
      fragment.age = Math.min(fragment.life, fragment.age + elapsed);
      if (fragment.age >= (fragment.delay || 0) && fragment.age < fragment.life && !this.reducedMotion) {
        fragment.x += fragment.vx * dt; fragment.y += fragment.vy * dt;
        fragment.vy += fragment.gravity * dt; fragment.rotation += fragment.spin * dt;
      }
      return fragment.kind === 'world' || fragment.age < fragment.life;
    });
    this.flights = this.flights.filter(flight => {
      flight.age += elapsed;
      if (flight.kind === 'equipment') { flight.x += flight.vx * dt; flight.y += flight.vy * dt; flight.vy += 110 * dt; flight.rotation += dt * 2.2; }
      return flight.age < flight.life;
    });
    if (this.bursting) {
      this.burstAge += elapsed;
      if (this.burstAge >= this.burstDuration) {
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
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (kind === 'bubble' ? 80 : 50), gravity: this.reducedMotion ? 0 : kind === 'bubble' ? -20 : kind === 'crane' ? 30 : 130, age: 0, delay: kind === 'page' && this.persona === 'doctor' && this.mode === 'lab' ? 0.16 : 0, life: this.reducedMotion ? 0.3 : 0.7 + Math.random() * (big ? 2.2 : 1.0), size: ['earth', 'page', 'crane', 'clock'].includes(kind) ? 8 + Math.random() * 14 : 3 + Math.random() * 6, rotation: angle, spin: this.reducedMotion ? 0 : (Math.random() - 0.5) * (kind === 'crane' ? 2 : 7), color: kind === 'earth' ? [C.blue, '#aab999', '#6d8c98'][i % 3] : colors[i % colors.length], kind, text: text[i % Math.max(1, text.length)] || '·' });
    }
    this.trim();
  }

  trim() {
    if (this.particles.length > 360) this.particles.splice(0, this.particles.length - 360);
    if (this.effects.length > 16) this.effects.splice(0, this.effects.length - 16);
    if (this.rings.length > 12) this.rings.splice(0, this.rings.length - 12);
    if (this.flights.length > 16) this.flights.splice(0, this.flights.length - 16);
    if (this.splitFragments.length > 96) this.splitFragments.splice(0, this.splitFragments.length - 96);
    if (this.explosions.length > 4) this.explosions.splice(0, this.explosions.length - 4);
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

  wrappedLabel(text, x, y, width, size, color, maxLines = 2, centered = false) {
    const c = this.ctx; c.font = `600 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    const rows = []; let row = '';
    for (const char of String(text || '')) {
      if (row && c.measureText(row + char).width > width) { rows.push(row); row = char; }
      else row += char;
    }
    if (row) rows.push(row);
    const visible = rows.slice(0, maxLines);
    if (rows.length > maxLines) visible[maxLines - 1] = `${visible[maxLines - 1].slice(0, -1)}…`;
    const lineHeight = size * 1.18, startY = centered ? y - (visible.length - 1) * lineHeight / 2 : y;
    visible.forEach((line, i) => this.label(line, x, startY + i * lineHeight, size, color));
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
    this.drawSplitFragments(); this.drawExplosions(); this.drawFlights(); this.drawEffects(); this.drawParticles(); this.drawCharge();
    c.restore();
    this.sceneLabels();
    c.restore();
  }

  background() {
    const c = this.ctx; const h = this.H;
    const g = c.createLinearGradient(0, 0, 800, h);
    g.addColorStop(0, '#354a56'); g.addColorStop(0.58, '#3d4c57'); g.addColorStop(1, '#4b505e');
    c.fillStyle = g; c.fillRect(-this.offsetX, -this.offsetY, this.viewW, this.viewH);
    this.glow(400, h * 0.55, 370, this.mode === 'mice' ? '#d4adb321' : this.mode === 'mentor' ? '#b3a9c628' : '#bac8a118');
    this.stars.forEach(star => { c.globalAlpha = this.reducedMotion ? 0.4 : 0.28 + (Math.sin(this.time * 0.8 + star.phase) + 1) * 0.18; this.ellipse(star.x * this.viewW - this.offsetX, star.y * this.viewH - this.offsetY, star.r, star.r, '#d7e7dd'); });
    c.globalAlpha = 1;
    c.save(); c.setLineDash([2, 8]); this.ellipse(400, h * 0.53, 368, Math.min(173, h * 0.27), null, '#849dba18', 1); c.restore();
    [[65, 70], [730, h - 103], [697, 62]].forEach(([x, y]) => { this.line([[x - 4, y], [x + 4, y]], '#b3a9c680', 1); this.line([[x, y - 4], [x, y + 4]], '#b3a9c680', 1); });
    if (this.offsetX > 90) {
      this.ellipse(-this.offsetX + 97, h * 0.29, 34, 34, '#72648b', '#b3a9c66b', 1);
      this.ellipse(-this.offsetX + 97, h * 0.29, 61, 15, null, '#b3a9c659', 3, -0.25);
      this.ellipse(800 + this.offsetX - 88, h * 0.72, 24, 24, '#355063', '#a7c3cd5a', 1);
      this.ellipse(800 + this.offsetX - 93, h * 0.70, 7, 5, '#608093');
    }
  }

  sceneLabels() {
    const size = this.fontSize(this.mobile ? 26 : 13, 14);
    const paint = this.paintFor();
    this.label(paint.sceneTag, 400, this.mobile ? 49 : 33, size, '#e1e5e3', 'center', 500);
    if (this.ended) {
      const w = this.mobile ? 660 : 390;
      this.rect(400 - w / 2, this.H - (this.mobile ? 87 : 60), w, this.mobile ? 55 : 35, 18, '#334c52e8', '#bac8a148', 1);
      this.wrappedLabel(paint.endingTag, 400, this.H - (this.mobile ? 52 : 38), w - 28, this.fontSize(this.mobile ? 26 : 14, 12), C.white, 1);
    }
  }

  lab() {
    const c = this.ctx;
    if (this.mobile) {
      this.equipment.forEach(item => {
        this.platform(item.x, item.y + 21, 194, 49);
        this.drawLabItem(item);
      });
      this.mouse(401, this.H - 127, 1.2, this.persona === 'teacher' ? 'teacher' : this.persona === 'doctor' ? 'doctor' : 'scientist');
    } else {
      this.platform(409, 326, 700, 138);
      this.equipment.forEach(item => this.drawLabItem(item));
      this.mouse(105, 321, 0.93, this.persona === 'teacher' ? 'teacher' : this.persona === 'doctor' ? 'doctor' : 'scientist');
    }
    this.splashes.forEach(splash => { this.ellipse(splash.x, splash.y + 10, 45, 10, `${splash.color}85`); for (let i = 0; i < 4; i++) this.ellipse(splash.x + i * 13 - 20, splash.y + Math.sin(i) * 9, 4, 3, splash.color); });
    if (this.bursting || this.ended) {
      const p = this.reducedMotion || this.ended ? 1 : clamp(this.burstAge / 1.9);
      const x = this.mobile ? 401 : 109;
      const y = this.mobile ? this.H - 150 - p * (this.H - 300) : 340 - p * 203;
      this.rocket(x, y, this.mobile ? 1.3 : 1, true);
      if (!this.reducedMotion && this.bursting) this.glow(x, y + 80, 70, '#bac8a145');
    }
  }

  platform(x, y, width, depth) {
    const left = x - width / 2, right = x + width / 2, d = depth / 2;
    this.ellipse(x, y + 57, width * 0.43, 22, '#26394345');
    this.path([[left, y - d], [right - 65, y - d - 20], [right, y + d - 20], [left + 65, y + d]], '#617781', '#9eacb0', 1.5);
    this.path([[left + 65, y + d], [right, y + d - 20], [right, y + d], [left + 65, y + d + 20]], '#4b626e', '#899ba4', 1.5);
    this.path([[left, y - d], [left + 65, y + d], [left + 65, y + d + 20], [left, y - d + 20]], '#546a75', '#899ba4', 1.5);
    this.line([[left + 73, y + d + 13], [right - 8, y + d - 7]], '#b3a9c682', 2);
    for (let i = 1; i < 5; i++) this.line([[left + width * i / 5, y - d - i * 3], [left + width * i / 5 + 65, y + d - i * 3]], '#7e92a026', 1);
  }

  drawLabItem(item) {
    const dragging = this.gesture?.active && this.dragTarget?.id === item.id;
    if (item.gone) {
      this.ellipse(item.x, item.y + 13, 36, 9, '#080f1890', '#60738045', 1);
      for (let i = 0; i < 6; i++) this.path([[item.x - 30 + i * 12, item.y + 8], [item.x - 24 + i * 12, item.y + 4 + i % 3], [item.x - 19 + i * 12, item.y + 13]], this.persona === 'phd' ? (i % 2 ? '#92aab2' : '#bac8a1aa') : '#dddccfa0', null);
      if (this.persona === 'teacher') this.paperCrane(item.x, item.y - 9, 0.36, -0.2, C.white);
      if (this.persona === 'doctor') { this.rect(item.x - 18, item.y - 17, 36, 20, 2, '#ece5dca0', '#c9b5b680', 1); this.label('已交班', item.x, item.y - 3, 8, '#786970'); }
      return;
    }
    if (!dragging) this.instrument(item.kind, item.x, item.y, this.mobile ? 1.25 : 1);
    else {
      const point = this.point(this.gesture.x, this.gesture.y);
      this.ellipse(item.x, item.y + 12, 42, 10, '#bac8a115', '#bac8a199', 1.5);
      this.ctx.save(); this.ctx.setLineDash([4, 5]); this.line([[item.x, item.y], [point.x, point.y]], '#bac8a188', 2); this.ctx.restore();
      this.instrument(item.kind, point.x, point.y, this.mobile ? 1.35 : 1.13, Math.sin(this.time * 6) * 0.045);
    }
    const names = this.paintFor('lab').equipmentNames;
    this.label(names[item.id], item.x, item.y + (this.mobile ? 50 : item.id === 1 ? 44 : 30), this.fontSize(this.mobile ? 26 : 13, 12), '#b8c9c9');
    const aim = this.point(this.aim.x, this.aim.y);
    const hovered = this.closest(this.equipment, aim.x, aim.y)?.id === item.id;
    if (hovered && !this.gesture) this.ellipse(item.x, item.y + 9, 49, 12, null, '#bac8a190', 1.5);
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
      this.path([[-26, -14], [26, -14], [34, 2], [25, 9], [-25, 9], [-34, 2]], '#b3a9c6c9', null); this.rect(-15, -81, 30, 9, 3, C.purple, C.ink, 1.5); this.ellipse(-6, -2, 3, 3, '#f1e7ffaa'); this.ellipse(9, -8, 2, 2, '#f1e7ffaa'); this.line([[-10, -62], [-10, -43]], '#effbeb70', 2);
    } else if (kind === 'gel') {
      this.path([[-45, -43], [27, -47], [46, -27], [-27, -22]], '#6e8a9c');
      this.path([[-27, -22], [46, -27], [46, 7], [-27, 12]], '#354e67');
      this.path([[-45, -43], [-27, -22], [-27, 12], [-45, -9]], '#253c51');
      this.path([[-31, -39], [20, -42], [31, -30], [-20, -27]], '#b3a9c636', '#b3a9c6', 1.5);
      for (let i = 0; i < 5; i++) this.line([[-20 + i * 10, -34], [-17 + i * 10, -31]], i % 2 ? C.purple : C.lime, 2.5);
      this.ellipse(32, -7, 3, 3, C.lime); this.rect(-13, -12, 27, 12, 3, '#142b38', null); this.label('RUN', 0, -3, 8, C.blue);
    } else if (kind === 'clipboard') {
      this.rect(-35, -98, 70, 108, 7, '#b8a58e', C.ink, 2);
      this.rect(-29, -89, 58, 91, 2, C.white, '#c9c7bb', 1);
      this.rect(-16, -105, 32, 16, 4, '#80969c', C.ink, 1.5);
      this.ellipse(0, -100, 4, 3, '#e6e7df');
      this.label('待办', 3, -68, 11, '#687982');
      for (let i = 0; i < 4; i++) {
        this.rect(-20, -55 + i * 14, 7, 7, 1, null, '#9caeae', 1);
        this.line([[-6, -51 + i * 14], [21, -51 + i * 14]], '#9aa7a8', 2);
        if (i === 0) this.line([[-20, -51], [-17, -48], [-12, -55]], '#879e89', 1.5);
      }
    } else if (kind === 'pager') {
      this.rect(-29, -71, 59, 75, 10, '#879aa6', C.ink, 2.5);
      this.rect(-21, -61, 42, 30, 5, '#dbe1ce', '#637883', 1.5);
      this.label('3 条提醒', 0, -43, 10, '#4c646d');
      this.ellipse(-11, -17, 5, 5, C.gold, C.ink, 1); this.ellipse(9, -17, 5, 5, C.purple, C.ink, 1);
      this.rect(27, -59, 7, 37, 2, '#607684', C.ink, 1);
      this.line([[-17, -4], [17, -4]], '#bcc9c9', 2);
    } else if (kind === 'clock') {
      this.ellipse(0, -45, 45, 45, '#a6b7bc', C.ink, 3);
      this.ellipse(0, -45, 37, 37, '#ede9df', '#71858b', 1.5);
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; this.line([[Math.sin(a) * 30, -45 - Math.cos(a) * 30], [Math.sin(a) * 34, -45 - Math.cos(a) * 34]], '#8b9494', 2); }
      this.line([[0, -45], [0, -66]], '#516b77', 3); this.line([[0, -45], [21, -34]], '#a1838d', 2.5);
      this.ellipse(0, -45, 3, 3, '#516b77');
      this.path([[-27, -5], [-33, 10], [-16, 10], [-12, -5]], '#8e9faa', C.ink, 1.5);
      this.path([[27, -5], [33, 10], [16, 10], [12, -5]], '#8e9faa', C.ink, 1.5);
    } else if (kind === 'folders') {
      for (let i = 0; i < 3; i++) {
        const yy = -14 - i * 18, xx = -39 + i * 4;
        this.path([[xx, yy - 32], [xx + 28, yy - 33], [xx + 32, yy - 41], [xx + 57, yy - 42], [xx + 62, yy - 33], [xx + 81, yy - 34], [xx + 77, yy + 20], [xx - 4, yy + 23]], [C.gold, '#b9bead', '#c5b7b4'][i], C.ink, 1.8);
        this.path([[xx + 7, yy - 20], [xx + 68, yy - 21], [xx + 68, yy + 4], [xx + 7, yy + 6]], C.white, '#b4b8b1', 1);
        this.line([[xx + 14, yy - 11], [xx + 57, yy - 12]], '#9da7a4', 1.5);
      }
    } else if (kind === 'cup') {
      this.ellipse(27, -27, 18, 20, null, '#c8b2b5', 9);
      this.path([[-29, -56], [-23, 4], [21, 4], [29, -56]], '#d4c1bb', C.ink, 2);
      this.ellipse(0, -56, 29, 10, '#ece1d5', C.ink, 2);
      this.ellipse(0, -55, 23, 6, '#716353', null);
      this.ellipse(-1, 5, 22, 7, '#b19b97', C.ink, 1.5);
      this.ellipse(-8, -19, 5, 8, '#eaded4', null, 1, -0.2);
      for (let i = -1; i <= 1; i++) this.line([[i * 12, -68], [i * 12 - 4, -78], [i * 12 + 2, -88]], '#e9e2d666', 1.5);
    } else if (kind === 'keyboard') {
      this.path([[-56, -26], [38, -32], [56, 2], [-38, 10]], '#b9c4c4', C.ink, 2);
      this.path([[-38, 10], [56, 2], [56, 10], [-38, 18]], '#7d939d', C.ink, 1.5);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 9; col++) {
        const xx = -46 + col * 9.5 + row * 4, yy = -21 + row * 9 - col * 0.45;
        this.rect(xx, yy, 7, 6, 1.2, row === 2 && col > 2 && col < 7 ? '#cfc6bd' : '#e2e5dd', '#92a6ad', 0.7);
      }
    } else if (kind === 'books') {
      this.path([[-54, -61], [-9, -66], [0, -58], [9, -66], [54, -61], [52, 4], [8, 10], [0, 5], [-8, 10], [-52, 4]], '#c0adac', C.ink, 2);
      this.path([[-49, -59], [-10, -62], [0, -55], [0, 0], [-10, 5], [-47, 0]], '#eee9dc', '#a9ada8', 1);
      this.path([[49, -59], [10, -62], [0, -55], [0, 0], [10, 5], [47, 0]], '#e6e2d5', '#a9ada8', 1);
      for (let i = 0; i < 5; i++) { this.line([[-40, -46 + i * 9], [-12, -47 + i * 9]], '#a4ada6', 1); this.line([[12, -47 + i * 9], [40, -46 + i * 9]], '#a4ada6', 1); }
      this.line([[0, -55], [0, 1]], '#8f9a93', 2);
      this.path([[28, -60], [28, -37], [23, -43], [18, -36], [18, -61]], C.purple, null);
    } else if (kind === 'board') {
      this.line([[-29, -5], [-36, 14]], '#b8a48d', 5); this.line([[29, -5], [36, 14]], '#b8a48d', 5);
      this.rect(-55, -94, 110, 86, 5, '#baa98f', C.ink, 2);
      this.rect(-49, -88, 98, 74, 2, '#6c8b83', '#8eaa9e', 1);
      this.label('今天', 0, -65, 15, '#e9eadc');
      this.line([[-29, -48], [26, -48]], '#d9ded0', 2); this.line([[-29, -36], [7, -36]], '#d9ded0', 2);
      this.rect(-54, -12, 108, 7, 2, '#c9b99b', C.ink, 1); this.rect(21, -18, 20, 7, 2, '#a8b8bd', C.ink, 1);
    } else if (kind === 'pencils') {
      for (let i = 0; i < 5; i++) {
        const xx = -23 + i * 11, yy = -75 - i % 3 * 7;
        this.path([[xx - 3, yy], [xx, yy - 16], [xx + 3, yy]], '#ded2bc', '#6c777a', 0.7);
        this.path([[xx - 1, yy - 10], [xx, yy - 16], [xx + 1, yy - 10]], '#5d6b71', null);
        this.rect(xx - 3, yy, 6, 69 + i % 3 * 7, 1, [C.gold, C.purple, C.pink, C.blue, C.lime][i], C.ink, 0.8);
      }
      this.path([[-32, -43], [-27, 6], [27, 6], [32, -43]], '#aab7bc', C.ink, 2);
      this.ellipse(0, -43, 32, 8, '#bbc8c7', C.ink, 1.5); this.ellipse(0, 6, 27, 7, '#869aa2', C.ink, 1.5);
      for (let i = -2; i <= 2; i++) this.line([[i * 10, -31], [i * 9, -1]], '#cdd5cf', 1.2);
    } else if (kind === 'worksheets') {
      for (let i = 0; i < 4; i++) this.path([[-40 + i * 2, -52 - i * 3], [28 + i * 2, -59 - i * 3], [43 + i * 2, 3 - i * 3], [-26 + i * 2, 11 - i * 3]], '#e7e4d9', '#9eaba7', 1);
      this.label('作业', 3, -42, 13, '#81928f');
      for (let i = 0; i < 3; i++) this.line([[-23 + i * 2, -26 + i * 10], [24 + i * 2, -30 + i * 10]], '#a3afa7', 1.5);
      this.line([[20, -18], [26, -13], [35, -25]], '#b48d91', 2);
    } else if (kind === 'bell') {
      this.ellipse(0, -74, 8, 7, '#c8b28f', C.ink, 1.5);
      c.beginPath(); c.moveTo(-31, -15); c.quadraticCurveTo(-21, -33, -20, -54); c.quadraticCurveTo(-20, -72, 0, -72); c.quadraticCurveTo(20, -72, 20, -54); c.quadraticCurveTo(21, -33, 31, -15); c.closePath(); c.fillStyle = C.gold; c.fill(); c.strokeStyle = C.ink; c.lineWidth = 2; c.stroke();
      this.ellipse(0, -14, 32, 9, '#bba27d', C.ink, 1.5); this.ellipse(0, -8, 6, 8, '#938069', C.ink, 1.5);
      this.line([[-12, -57], [-14, -35]], '#eee1c8', 3);
    }
    c.restore();
  }

  mentor() {
    const c = this.ctx, core = this.core;
    this.glow(core.x, core.y, 205, '#b3a9c61f');
    const shut = this.ended ? 0.55 : 1;
    c.save(); c.translate(core.x, core.y); c.rotate(this.reducedMotion ? -0.18 : this.time * 0.12 - 0.18); c.scale(shut, shut);
    this.ellipse(0, 0, 113, 49, null, '#b3a9c610', 24);
    this.ellipse(0, 0, 110, 45, null, '#b3a9c685', 5);
    this.ellipse(0, 0, 90, 39, null, '#d9c5a1a5', 2);
    this.ellipse(0, 0, core.r, core.r, '#23333e', '#9c8eaf', 2);
    this.ellipse(0, 0, core.r - 8, core.r - 8, '#293841', '#b3a9c621', 8);
    c.restore();
    this.label(this.ended ? '休息一会儿' : '消息放这里', core.x, core.y + 7, this.mobile ? 19 : 14, this.ended ? C.lime : '#ede5f1');
    this.cards.forEach(card => {
      if (card.gone) return;
      if (this.gesture?.active && this.dragTarget?.id === card.id) {
        const point = this.point(this.gesture.x, this.gesture.y);
        c.save(); c.setLineDash([4, 6]); this.line([[point.x, point.y], [core.x, core.y]], '#b3a9c67a', 2); c.restore();
        this.chat(card.text, point.x, point.y, card.id, true);
      } else this.chat(card.text, card.x, card.y + (this.reducedMotion ? 0 : Math.sin(this.time * 1.5 + card.id) * 3), card.id);
    });
    this.replies.forEach(reply => {
      const slot = this.ended || this.bursting ? { x: 400, y: core.y + (this.mobile ? 150 : 138) } : this.cards[reply.id];
      const w = this.ended || this.bursting ? (this.mobile ? 680 : 410) : (this.mobile ? 340 : 222);
      const hh = this.mobile ? 78 : 54;
      this.rect(slot.x - w / 2, slot.y - hh / 2, w, hh, 16, '#45605a', '#bac8a166', 1.5);
      this.wrappedLabel(reply.text, slot.x, slot.y + 8, w - 24, this.fontSize(this.mobile ? 28 : 14, 13), '#ebefe1', 2, true);
    });
    if (this.ended) {
      this.paperPlane(core.x - 128, core.y - 125, 1, -0.22, C.lime);
      this.paperPlane(core.x + 136, core.y - 88, 0.8, 0.3, C.blue);
    }
  }

  chat(text, x, y, id, dragging = false, scale = 1) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale); c.rotate(dragging ? -0.055 : (id % 2 ? 0.025 : -0.025));
    const w = this.mobile ? 340 : 214, h = this.mobile ? 108 : 86;
    this.rect(-w / 2 + 5, -h / 2 + 8, w, h, 16, '#26394330', null);
    const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); g.addColorStop(0, '#f0eadf'); g.addColorStop(1, '#cfd9d8');
    this.rect(-w / 2, -h / 2, w, h, 16, g, dragging ? C.lime : '#728795', dragging ? 2.5 : 1.5);
    this.ellipse(-w / 2 + 25, -h / 2 + 21, 9, 9, id % 2 ? '#9382ad' : '#678e98');
    this.label(`${this.paintFor('mentor').speaker} · 刚刚`, -w / 2 + 42, -h / 2 + 25, this.fontSize(this.mobile ? 22 : 11, 11), '#64747d', 'left');
    this.wrappedLabel(text, 0, this.mobile ? 16 : 14, w - 25, this.fontSize(this.mobile ? 30 : 17, 14), '#26363b', 2, true);
    this.path([[w / 2 - 30, h / 2 - 1], [w / 2 - 15, h / 2 + 10], [w / 2 - 13, h / 2 - 1]], '#cfd9d8', '#728795', 1.2);
    c.restore();
  }

  earth() {
    const c = this.ctx, g = this.globe;
    this.glow(g.x, g.y, g.r * 1.8, '#5cabd525');
    this.orbits();
    if (this.bursting || this.ended) {
      const p = this.ended || this.reducedMotion ? 1 : clamp(this.burstAge / this.burstDuration);
      if (p > 0.4) {
        const growth = this.reducedMotion ? 1 : clamp((p - 0.4) / 0.6);
        c.save(); c.globalAlpha = growth;
        this.ellipse(g.x, g.y + 54, 89 + growth * 33, 29, null, '#a7c3cd5a', 2);
        this.ellipse(g.x, g.y + 56, 72, 20, '#192d30', '#45666d', 2);
        this.line([[g.x, g.y + 55], [g.x, g.y - 15 * growth]], C.lime, 6);
        this.ellipse(g.x - 17, g.y + 18, 22, 9, C.lime, null, 1, 0.45);
        this.ellipse(g.x + 17, g.y + 7, 22, 9, '#aebf98', null, 1, -0.45);
        for (let i = 0; i < 6; i++) this.ellipse(g.x + Math.cos(i * TAU / 6) * 17, g.y - 29 + Math.sin(i * TAU / 6) * 17, 13, 15, C.purple, '#cfc0f7', 1);
        this.ellipse(g.x, g.y - 29, 11, 11, C.gold, C.ink, 1.5);
        this.label(this.persona === 'doctor' ? '这一刻，留给自己' : this.persona === 'teacher' ? '下课后，还有花开' : '歇一会儿，再出发', g.x, g.y + 112, this.mobile ? 25 : 17, C.white);
        c.restore();
      }
    } else {
      this.worldSurface(g.x, g.y, g.r);
      c.save(); c.translate(g.x, g.y); c.beginPath(); c.arc(0, 0, g.r, 0, TAU); c.clip();
      this.cracks.forEach((crack, i) => {
        const x = crack.x * g.r, y = crack.y * g.r, length = (35 + crack.power * 12) * g.r / 142;
        c.save(); c.translate(x, y); c.rotate(crack.angle + i * 0.6);
        this.glow(0, 0, length * 0.7, '#d9c5a135');
        this.line([[-length * 0.7, -10], [-length * 0.28, 4], [0, 0], [length * 0.23, 16], [length * 0.66, 7], [length, 30]], '#e2c7a3', 2.4);
        this.line([[0, 0], [6, -length * 0.3], [24, -length * 0.57]], '#ecdcc1', 1.3);
        this.ellipse(0, 0, 8 + crack.power * 2, 6, '#243c49', '#c5aa84', 1); c.restore();
      }); c.restore();
    }
  }

  worldSurface(x, y, r) {
    if (this.persona === 'doctor') this.clockSurface(x, y, r);
    else if (this.persona === 'teacher') this.gridSurface(x, y, r);
    else this.globeSurface(x, y, r);
  }

  clockSurface(x, y, r) {
    const c = this.ctx; c.save(); c.translate(x, y);
    this.ellipse(0, 0, r + 10, r + 10, null, '#d9c5a122', 13);
    const casing = c.createLinearGradient(-r, -r, r, r); casing.addColorStop(0, '#ccd5d1'); casing.addColorStop(1, '#7f98a1');
    this.ellipse(0, 0, r, r, casing, '#d3dbd7', 2);
    const face = c.createLinearGradient(-r, -r, r, r); face.addColorStop(0, '#f4eee2'); face.addColorStop(1, '#d4d7cf');
    this.ellipse(0, 0, r * 0.88, r * 0.88, face, '#708991', 2);
    for (let i = 0; i < 60; i++) {
      const a = i * TAU / 60, inner = i % 5 === 0 ? 0.73 : 0.79;
      this.line([[Math.sin(a) * r * inner, -Math.cos(a) * r * inner], [Math.sin(a) * r * 0.82, -Math.cos(a) * r * 0.82]], '#829699', i % 5 ? 1 : 2.5);
    }
    ['12', '3', '6', '9'].forEach((text, i) => { const a = i * TAU / 4; this.label(text, Math.sin(a) * r * 0.61, -Math.cos(a) * r * 0.61 + r * 0.05, r * 0.12, '#607780'); });
    this.rect(-r * 0.36, r * 0.20, r * 0.72, r * 0.16, 3, '#c3cdc4', '#9bab9f', 1);
    this.label('休息也在日程里', 0, r * 0.31, r * 0.075, '#65796e');
    this.line([[0, 0], [-r * 0.30, -r * 0.30]], '#627d89', r * 0.055);
    this.line([[0, 0], [r * 0.36, -r * 0.56]], '#ac8b93', r * 0.035);
    this.line([[0, r * 0.13], [0, -r * 0.67]], '#bea77f', r * 0.012);
    this.ellipse(0, 0, r * 0.065, r * 0.065, '#8da6ab', '#607a84', 2);
    this.ellipse(-r * 0.2, -r * 0.27, r * 0.54, r * 0.12, null, '#ffffff25', 6, -0.45);
    c.restore();
  }

  gridSurface(x, y, r) {
    const c = this.ctx; c.save(); c.translate(x, y);
    this.ellipse(0, 0, r + 10, r + 10, null, '#b3a9c627', 13);
    const paper = c.createLinearGradient(-r, -r, r, r); paper.addColorStop(0, '#f3ede1'); paper.addColorStop(0.48, '#d7ded4'); paper.addColorStop(1, '#90a7ac');
    this.ellipse(0, 0, r, r, paper, '#dce4d8', 2);
    c.save(); c.beginPath(); c.arc(0, 0, r - 2, 0, TAU); c.clip();
    this.rect(-r, -r * 0.71, r * 2, r * 0.29, 0, '#b4bcc4', null);
    this.label('本周待办', 0, -r * 0.53, r * 0.115, '#526d79');
    for (let i = -3; i <= 3; i++) {
      const xx = i * r * 0.24;
      this.line([[xx, -r * 0.43], [xx, r]], '#829c9d80', 1.3);
      this.line([[-r, i * r * 0.24 + r * 0.06], [r, i * r * 0.24 + r * 0.06]], '#829c9d80', 1.3);
    }
    for (let i = 0; i < 9; i++) {
      const xx = (i % 3 - 1) * r * 0.47, yy = Math.floor(i / 3) * r * 0.24 - r * 0.22;
      this.rect(xx - r * 0.16, yy, r * 0.30, r * 0.12, 2, [C.purple, C.lime, C.gold][i % 3], null);
      this.line([[xx - r * 0.11, yy + r * 0.05], [xx + r * 0.07, yy + r * 0.05]], '#6e8180', 1);
    }
    c.restore();
    this.path([[r * 0.51, -r * 0.78], [r * 0.91, -r * 0.39], [r * 0.50, -r * 0.42]], '#e9e5d8', '#a6b8b5', 1.5);
    this.ellipse(-r * 0.28, -r * 0.21, r * 0.6, r * 0.15, null, '#ffffff25', 5, -0.44);
    c.restore();
  }

  globeSurface(x, y, r) {
    const c = this.ctx; c.save(); c.translate(x, y);
    this.ellipse(0, 0, r + 10, r + 10, null, '#a7c3cd19', 13);
    this.ellipse(0, 0, r + 4, r + 4, null, '#a7c3cd64', 2);
    const sea = c.createLinearGradient(-r, -r, r, r); sea.addColorStop(0, '#b5cbd1'); sea.addColorStop(0.4, '#819fac'); sea.addColorStop(1, '#3c5b6d');
    this.ellipse(0, 0, r, r, sea, '#c7d9d9', 1.7);
    c.save(); c.beginPath(); c.arc(0, 0, r - 1, 0, TAU); c.clip(); c.scale(r / 100, r / 100); c.rotate(this.reducedMotion ? -0.15 : Math.sin(this.time * 0.16) * 0.22 - 0.15);
    this.path([[-85, -33], [-69, -60], [-35, -77], [-5, -68], [1, -49], [-18, -32], [-27, -39], [-33, -14], [-46, -6], [-61, -22]], '#bac7a5', null);
    this.path([[-41, -2], [-19, 6], [-2, 24], [-11, 42], [-23, 81], [-38, 64], [-40, 40], [-54, 18]], '#aabd9e', null);
    this.path([[5, -78], [49, -68], [80, -43], [105, -8], [69, -14], [54, 3], [37, -3], [21, -31], [4, -33], [-4, -49]], '#c5cfb2', null);
    this.path([[22, -14], [49, -2], [53, 28], [32, 57], [17, 38], [10, 4]], '#aebf9f', null);
    this.path([[67, 52], [89, 58], [91, 76], [64, 71], [54, 61]], '#c5cfb2', null);
    this.path([[-41, -88], [-23, -94], [6, -92], [22, -84], [-3, -78]], '#e0ece0', null);
    this.ellipse(-12, -22, 92, 9, null, '#eef6e540', 4, -0.18);
    this.ellipse(17, 38, 87, 7, null, '#eef6e533', 5, -0.18);
    this.ellipse(-6, -63, 70, 5, null, '#eef6e522', 4, -0.18);
    const shade = c.createLinearGradient(-87, -69, 94, 63); shade.addColorStop(0, '#dfe9e905'); shade.addColorStop(0.5, '#3d526200'); shade.addColorStop(1, '#30485288');
    this.ellipse(0, 0, 100, 100, shade); c.restore(); c.restore();
  }

  orbits() {
    if (this.ended) return;
    const c = this.ctx, g = this.globe, rx = this.mobile ? 308 : 278, ry = this.mobile ? 252 : 155;
    c.save(); c.setLineDash([3, 6]); this.ellipse(g.x, g.y, rx, ry, null, '#a7c3cd3a', 1, -0.16); c.restore();
    this.paintFor('earth').satellites.forEach((text, i) => {
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
    if (this.persona === 'phd') {
      this.speaker(this.mobile ? 89 : 108, stageY - 35, this.mobile ? 1.13 : 1);
      this.speaker(this.mobile ? 711 : 692, stageY - 35, this.mobile ? 1.13 : 1);
    } else {
      this.flowerPot(this.mobile ? 94 : 108, stageY - 29, this.persona === 'teacher' ? 1.35 : 1.1);
      this.flowerPot(this.mobile ? 706 : 692, stageY - 29, this.persona === 'teacher' ? 1.35 : 1.1);
      if (this.persona === 'teacher') {
        c.save(); c.globalAlpha = 0.25; this.ellipse(400, stageY + 28, 324, 61, '#aabd9b'); c.restore();
        this.instrument('pencils', 132, this.mobile ? h * 0.35 : 205, 0.75, -0.12);
        this.instrument('books', 670, this.mobile ? h * 0.35 : 205, 0.63, 0.14);
      }
    }
    const djY = this.mobile ? h * 0.44 : 201;
    this.mouse(400, djY, this.mobile ? 1.56 : 1.05, this.persona === 'phd' ? 'dj' : this.persona, 0);
    this.path([[312, djY + 37], [466, djY + 31], [490, djY + 58], [333, djY + 65]], '#8b8b9d', '#b3a9c6', 2);
    if (this.persona === 'phd') {
      this.ellipse(357, djY + 49, 28, 9, '#354551', C.purple, 2); this.ellipse(435, djY + 45, 28, 9, '#354551', C.purple, 2);
      this.ellipse(357, djY + 49, 7, 3, C.pink); this.ellipse(435, djY + 45, 7, 3, C.lime);
    } else if (this.persona === 'doctor') {
      this.instrument('cup', 356, djY + 47, 0.47);
      this.ellipse(437, djY + 45, 28, 10, '#dfdacd', '#9dafa9', 1);
      this.ellipse(434, djY + 42, 11, 7, C.gold, '#9d8c71', 1);
      this.ellipse(450, djY + 43, 9, 6, '#c6afa0', '#9d8c71', 1);
    } else {
      this.instrument('books', 362, djY + 48, 0.42);
      this.instrument('cup', 446, djY + 46, 0.39);
    }
    const colors = [C.pink, C.blue, C.lime, C.purple];
    for (let i = 0; i < 16; i++) {
      const x = 173 + i % 8 * 66, y = stageY + Math.floor(i / 8) * 25;
      const alpha = this.reducedMotion ? '50' : Math.sin(this.time * 4 + i) > 0 ? '75' : '28';
      this.path([[x, y], [x + 47, y - 2], [x + 64, y + 15], [x + 15, y + 18]], `${colors[i % 4]}${alpha}`, null);
    }
    const spots = this.mobile ? [[205, h * 0.59], [595, h * 0.60], [315, h * 0.74], [495, h * 0.74], [185, h * 0.82], [615, h * 0.82], [310, h * 0.86], [490, h * 0.86], [400, h * 0.62]] : [[220, 306], [578, 292], [326, 326], [467, 317], [159, 255], [644, 250], [283, 239], [519, 239], [400, 355]];
    spots.slice(0, this.guests - 1).forEach(([x, y], i) => this.mouse(x, Math.min(y, h - 120), this.mobile ? 1.30 : 0.75, ['party', 'vacation', this.persona === 'phd' ? 'scientist' : this.persona][i % 3], i + 1));
    if (this.ended || this.bursting) {
      const yy = this.mobile ? h - 174 : h - 96;
      this.rect(265, yy - 3, 270, 48, 14, '#9d90ae', '#d2c7dc', 2);
      this.ellipse(309, yy + 44, 15, 15, '#20303a', '#9fb7c4', 3); this.ellipse(493, yy + 44, 15, 15, '#20303a', '#9fb7c4', 3);
      this.label(this.paintFor('mice').partyLabel, 400, yy + 26, this.mobile ? 23 : 18, C.white);
      this.line([[531, yy + 6], [558, yy - 61]], C.lime, 2);
      this.path([[553, yy - 61], [641, yy - 57], [620, yy - 29], [541, yy - 35]], C.lime, '#53664e', 1.5); this.label('歇一会儿', 592, yy - 41, 14, '#3e5041');
    }
    if (this.persona === 'phd') this.discoBall(400, this.mobile ? 97 : 65);
    else if (this.persona === 'teacher') this.instrument('bell', 400, this.mobile ? 145 : 108, 0.59);
    else {
      this.line([[321, 0], [321, 65]], '#b5bab5', 1.5); this.line([[479, 0], [479, 65]], '#b5bab5', 1.5);
      this.path([[300, 66], [342, 66], [356, 94], [286, 94]], C.gold, '#b9b59e', 1.5);
      this.path([[458, 66], [500, 66], [514, 94], [444, 94]], C.gold, '#b9b59e', 1.5);
      this.glow(321, 94, 65, '#d9c5a126'); this.glow(479, 94, 65, '#d9c5a126');
    }
  }

  flowerPot(x, y, scale = 1) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    this.path([[-27, -12], [-20, 25], [20, 25], [27, -12]], '#b59ca0', C.ink, 1.5);
    this.ellipse(0, -12, 27, 8, '#c4adaf', C.ink, 1.5);
    for (let i = 0; i < 3; i++) {
      const xx = (i - 1) * 17, yy = -55 - i % 2 * 24;
      this.line([[xx, yy], [0, -10]], '#a8b896', 3);
      this.ellipse(xx + 9, yy + 25, 13, 6, '#a8b896', null, 1, -0.5);
      for (let p = 0; p < 5; p++) { const a = p * TAU / 5; this.ellipse(xx + Math.cos(a) * 9, yy + Math.sin(a) * 9, 7, 8, i % 2 ? C.purple : C.pink, null); }
      this.ellipse(xx, yy, 5, 5, C.gold);
    }
    c.restore();
  }

  speaker(x, y, scale) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    this.rect(-29, -100, 58, 102, 9, '#566873', '#77749d', 2);
    this.ellipse(0, -70, 17, 17, '#3b505d', '#ac9dbb', 2); this.ellipse(0, -27, 22, 22, '#3b505d', '#ac9dbb', 2);
    this.ellipse(0, -70, 7, 7, '#8990a0'); this.ellipse(0, -27, 9, 9, C.purple);
    c.restore();
  }

  discoBall(x, y) {
    this.line([[x, 0], [x, y - 20]], '#71859a', 1.5);
    this.ellipse(x, y, 23, 23, '#aea0d8', '#dfd8e4', 2);
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
    const color = outfit === 'scientist' || outfit === 'doctor' ? '#dce8dc' : outfit === 'teacher' ? '#beb2c7' : outfit === 'vacation' ? C.gold : outfit === 'dj' ? C.purple : [C.pink, C.blue, C.lime][id % 3];
    this.path([[-26, -4], [-20, 30], [20, 31], [26, -4], [8, -15], [-8, -15]], color, C.ink, 2.5);
    if (outfit === 'scientist') { this.path([[-12, -9], [0, 3], [-8, 12], [-18, -9]], '#adc3b7', C.ink, 1); this.path([[12, -9], [0, 3], [8, 12], [18, -9]], '#adc3b7', C.ink, 1); this.line([[0, 4], [0, 29]], '#749589', 1); this.rect(12, 12, 9, 8, 1, '#a3b7a6', null); }
    if (outfit === 'vacation') for (let i = 0; i < 3; i++) this.line([[-19, 4 + i * 8], [20, 4 + i * 8]], '#c7aa98', 3);
    if (outfit === 'doctor') {
      this.line([[-10, -7], [-12, 11], [0, 18], [11, 10], [9, -7]], '#778e94', 2.5);
      this.ellipse(0, 19, 4, 4, '#a9bcc0', '#5e767d', 1.5); this.rect(12, 10, 8, 9, 1, C.blue, null);
    }
    if (outfit === 'teacher') { this.line([[0, -7], [0, 30]], '#8d8396', 1.5); this.ellipse(1, 10, 1.3, 1.3, C.white); this.ellipse(1, 19, 1.3, 1.3, C.white); }
    c.save(); c.translate(-25, -3); c.rotate(party ? -0.6 - dance * 0.5 : -0.1); this.rect(-8, 0, 13, 26, 6, color, C.ink, 2); this.ellipse(-1, 26, 6, 5, '#dce4d7', C.ink, 1.5); c.restore();
    c.save(); c.translate(25, -3); c.rotate(party ? 0.6 + dance * 0.5 : -0.45); this.rect(-5, 0, 13, 25, 6, color, C.ink, 2); this.ellipse(2, 26, 6, 5, '#dce4d7', C.ink, 1.5); c.restore();
    this.ellipse(-26, -57, 20, 22, '#d7e0d3', C.ink, 2.5, -0.25); this.ellipse(26, -57, 20, 22, '#d7e0d3', C.ink, 2.5, 0.25);
    this.ellipse(-26, -57, 12, 14, '#cfacbe', null, 2, -0.25); this.ellipse(26, -57, 12, 14, '#cfacbe', null, 2, 0.25);
    const head = c.createLinearGradient(-26, -64, 32, -7); head.addColorStop(0, '#f0f3df'); head.addColorStop(1, '#b1c7bd');
    this.ellipse(0, -33, 36, 34, head, C.ink, 2.5); this.ellipse(-23, -20, 7, 4, '#d4adb350'); this.ellipse(23, -20, 7, 4, '#d4adb350');
    if (outfit === 'dj') { this.line([[-36, -37], [-36, -55], [-25, -72], [25, -72], [36, -55], [36, -37]], '#423c5d', 7); this.rect(-43, -46, 11, 22, 5, C.pink, C.ink, 2); this.rect(32, -46, 11, 22, 5, C.pink, C.ink, 2); }
    if (outfit === 'scientist') { this.line([[-33, -39], [33, -39]], '#546a81', 4); this.rect(-29, -46, 25, 22, 8, '#b3a9c626', '#536b83', 3); this.rect(4, -46, 25, 22, 8, '#b3a9c626', '#536b83', 3); this.line([[-4, -37], [4, -37]], '#536b83', 3); this.line([[-21, -42], [-12, -42]], '#f8fced90', 2); this.line([[10, -42], [19, -42]], '#f8fced90', 2); }
    if (outfit === 'teacher') { this.ellipse(-17, -34, 12, 11, null, '#687581', 2); this.ellipse(17, -34, 12, 11, null, '#687581', 2); this.line([[-5, -35], [5, -35]], '#687581', 2); }
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
    this.glow(0, 42, 65, '#b3a9c622');
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

  paperCrane(x, y, scale = 1, rotation = 0, color = C.white) {
    const c = this.ctx; c.save(); c.translate(x, y); c.rotate(rotation); c.scale(scale, scale);
    this.path([[-3, 2], [-38, -27], [-21, 15], [3, 6]], color, '#7c8e93', 1);
    this.path([[3, 6], [31, -28], [20, 19], [-3, 12]], '#cdc4d6', '#7c8e93', 1);
    this.path([[-20, 15], [0, -5], [22, 17], [0, 22]], '#e9e4da', '#7c8e93', 1);
    this.path([[0, 13], [18, -17], [27, -14], [17, -11], [13, 9]], color, '#7c8e93', 1);
    this.path([[-3, 14], [-31, 29], [-15, 6]], '#bac8c5', '#7c8e93', 1);
    this.line([[0, -5], [0, 22]], '#a19baa', 1); c.restore();
  }

  drawSplitFragments() {
    const c = this.ctx;
    this.splitFragments.forEach(fragment => {
      if (fragment.age < (fragment.delay || 0) && !this.reducedMotion) return;
      c.save();
      if (fragment.kind === 'world') {
        const settle = this.ended || this.reducedMotion ? 1 : clamp((fragment.age - 1.65) / 0.95);
        const x = fragment.x * (1 - settle) + (fragment.originX + Math.cos(fragment.angle) * fragment.radius * 0.81) * settle;
        const y = fragment.y * (1 - settle) + (fragment.originY + Math.sin(fragment.angle) * fragment.radius * 0.81) * settle;
        c.translate(x, y); c.rotate(fragment.rotation * (1 - settle) + fragment.spin * 0.55 * settle);
        c.scale(1 - settle * 0.53, 1 - settle * 0.53); c.globalAlpha = 1 - settle * 0.38;
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, fragment.radius + 2, fragment.start + 0.008, fragment.end - 0.008); c.closePath(); c.clip();
        c.drawImage(fragment.texture, -fragment.span, -fragment.span, fragment.span * 2, fragment.span * 2);
        c.beginPath(); c.moveTo(Math.cos(fragment.start) * fragment.radius, Math.sin(fragment.start) * fragment.radius); c.lineTo(0, 0); c.lineTo(Math.cos(fragment.end) * fragment.radius, Math.sin(fragment.end) * fragment.radius);
        c.strokeStyle = '#efe3cf'; c.lineWidth = 2; c.stroke();
      } else {
        const age = Math.max(0, fragment.age - (fragment.delay || 0));
        const factor = this.mobile ? 1.2 : 1;
        const x = this.reducedMotion ? fragment.originX + fragment.vx * 0.22 : fragment.x;
        const y = this.reducedMotion ? fragment.originY + fragment.vy * 0.22 : fragment.y;
        c.translate(x, y); c.rotate(this.reducedMotion ? fragment.spin * 0.12 : fragment.rotation);
        c.globalAlpha = this.reducedMotion ? 0.8 : clamp((fragment.life - age) * 2);
        c.drawImage(fragment.texture, fragment.sourceX, fragment.sourceY, fragment.sourceW, fragment.sourceH, -fragment.width * factor / 2, -fragment.height * factor / 2, fragment.width * factor, fragment.height * factor);
      }
      c.restore();
    });
  }

  drawExplosions() {
    if (this.reducedMotion) return;
    const c = this.ctx;
    this.explosions.forEach(explosion => {
      const age = Math.max(0, explosion.age), life = explosion.life, power = explosion.power;
      c.save();
      // A warm local pressure core, followed by staggered rings and a slow dust cloud.
      const coreOpacity = Math.max(0, 1 - age / 0.55) * 0.7;
      if (coreOpacity > 0) {
        c.globalAlpha = coreOpacity;
        this.glow(explosion.x, explosion.y, explosion.radius * (0.7 + age * 2.4) * power, '#f0dec4a0');
        this.ellipse(explosion.x, explosion.y, (16 + age * 60) * power, (13 + age * 50) * power, '#eee3d380');
      }
      for (let i = 0; i < 4; i++) {
        const progress = (age - i * 0.105) / (1.1 + i * 0.12);
        if (progress < 0 || progress > 1) continue;
        const radius = (explosion.radius * 0.25 + progress * (330 + explosion.radius * 0.6)) * (0.6 + power * 0.4);
        c.globalAlpha = (1 - progress) * (i === 0 ? 0.7 : 0.35);
        this.ellipse(explosion.x, explosion.y, radius, radius * (i % 2 ? 0.70 : 1), null, [C.gold, C.white, C.purple, C.blue][i], i ? 2.5 : 5);
      }
      for (let i = 0; i < 14; i++) {
        const a = i * TAU / 14, spread = (35 + age * 50) * power;
        const x = explosion.x + Math.cos(a) * spread, y = explosion.y + Math.sin(a) * spread * 0.54 - age * 14;
        const radius = 13 + Math.min(age, 1.8) * (19 + i % 3 * 5);
        c.globalAlpha = Math.sin(Math.min(1, age / 0.18) * Math.PI / 2) * Math.max(0, 1 - age / life) * 0.095;
        this.ellipse(x, y, radius * 1.3, radius, i % 2 ? '#d2c9c7' : '#adbbc0', null, 1, a);
      }
      c.restore();
    });
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
        this.line([[x - 100, y + 20], [x - 47, y + 8]], '#bac8a180', 2);
        this.paperPlane(x, y, this.mobile ? 1.4 : 0.9, -0.28, C.lime);
      } else if (flight.muted) {
        const x = flight.originX, y = flight.originY - p * 65;
        c.save(); c.globalAlpha = 1 - p;
        this.ellipse(x, y, 64 + p * 10, 47 + p * 10, '#a7c3cd21', '#b4cbd0', 2);
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
        this.rect(-5, -5, 11, 81, 5, '#d7b49a', C.ink, 2); this.rect(-40, -21, 80, 31, 7, '#8eacd0', '#e0edf4', 2); this.line([[-32, -14], [29, -14]], '#d9e2e0', 3);
      } else if (effect.kind === 'handoff') {
        const scale = effect.large ? 2.1 : this.mobile ? 1.35 : 1;
        c.translate(x, y); c.scale(scale, scale); c.rotate(-0.12);
        const incoming = Math.max(0, 1 - p * 5);
        c.translate(0, -incoming * 34);
        this.rect(-48, -26, 96, 52, 5, '#d4adb31b', '#d7b7b4', 3);
        this.rect(-42, -20, 84, 40, 3, null, '#d7b7b4', 1);
        this.label('交 班', 0, 9, 28, '#efcec8');
        if (p > 0.22) this.label('先歇一会儿', 0, 47, 13, C.white);
      } else if (effect.kind === 'fold') {
        const scale = effect.large ? 2.2 : this.mobile ? 1.65 : 1.25;
        this.paperCrane(x, y - p * 58, scale, -0.25 + p * 0.4, C.white);
        this.line([[x - 34, y + 21], [x - 12, y + 12]], '#e0d8e180', 1.5);
      } else if (effect.kind === 'erase') {
        const ex = x - 50 + p * 100;
        this.rect(ex - 22, y - 12, 44, 22, 4, '#b4b9c6', '#dee0dc', 1.5);
        for (let i = 0; i < 7; i++) this.ellipse(ex - 28 - i * 7, y + Math.sin(i * 2) * 15, 6 + i % 3 * 3, 4 + i % 2 * 3, '#e4e5d950');
      } else if (effect.kind === 'gravity' || effect.kind === 'blackhole') {
        this.glow(x, y, 100, '#b3a9c644');
        for (let i = 0; i < 3; i++) this.ellipse(x, y, 20 + i * 17 + p * 20, 8 + i * 10 + p * 10, null, [C.purple, C.pink, C.blue][i], 2.5, this.reducedMotion ? -0.4 : p * 3 + i);
        this.ellipse(x, y, 20 + p * 12, 20 + p * 12, '#243541', C.purple, 2);
      } else if (effect.kind === 'rainbow') {
        for (let i = 0; i < 4; i++) this.line([[x - 96, y - 80 + i * 6], [x - 33, y - 27 + i * 6], [x + 9, y + 22 + i * 6]], [C.pink, C.gold, C.lime, C.blue][i], 7);
      } else if (effect.kind === 'mute') {
        this.ellipse(x, y, 52 + p * 22, 45 + p * 15, '#a7c3cd35', '#a7c3cda0', 2);
        this.label('Z z z', x, y + 7, 25, C.blue); this.label('已静音', x, y + 30, 13, C.white);
      } else if (effect.kind === 'meteor') {
        const t = this.reducedMotion ? 1 : Math.min(1, p * 2.6), mx = x - (1 - t) * 195, my = y - (1 - t) * 220;
        this.line([[mx - 113, my - 122], [mx - 50, my - 54], [mx, my]], '#d9c5a155', 20); this.line([[mx - 75, my - 82], [mx, my]], C.gold, 6);
        this.ellipse(mx, my, 17, 14, '#866d7b', C.gold, 2); this.ellipse(mx - 4, my - 3, 4, 3, '#b3a2a4');
      } else if (effect.kind === 'laser') {
        this.line([[71, 93], [x, y]], '#d4adb328', 19); this.line([[71, 93], [x, y]], '#d4adb3aa', 6); this.line([[71, 93], [x, y]], '#fff1eb', 2);
        this.glow(x, y, 65, '#d4adb377'); this.rect(39, 77, 51, 27, 7, '#7587a0', C.ink, 2); this.ellipse(x, y, 11, 11, C.white);
      } else if (effect.kind === 'bubbles') {
        for (let i = 0; i < 7; i++) { const xx = x + Math.sin(i * 1.9) * 75, yy = y - p * 112 - i * 13; this.ellipse(xx, yy, 12 + i % 3 * 5, 12 + i % 3 * 5, '#a7c3cd12', '#b3cbd19a', 2); this.ellipse(xx - 4, yy - 5, 3, 2, '#e6fcffb0'); }
      } else if (effect.kind === 'snacks') {
        this.ellipse(x, y + 12, 50, 16, '#d8e1dd', C.ink, 2); this.ellipse(x - 16, y, 16, 12, C.gold, '#ac749a', 2); this.ellipse(x - 16, y, 6, 4, '#263141', null); this.rect(x + 13, y - 38, 21, 43, 5, '#a7c3cd70', '#b4d1d2', 2); this.line([[x + 21, y - 46], [x + 26, y - 3]], C.pink, 3); this.label('吃点好的', x, y + 50, this.mobile ? 24 : 17, C.white);
      } else if (effect.kind === 'disco' || effect.kind === 'festival') {
        const texts = ['今天辛苦了', '一起歇一会儿', '这会儿不忙', '好好下班'];
        this.label(texts[(this.hits - 1 + 4) % 4], x, y - 43 - p * 25, this.mobile ? 29 : 23, C.lime);
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; this.line([[x + Math.cos(a) * 25, y + Math.sin(a) * 25], [x + Math.cos(a) * (68 + p * 45), y + Math.sin(a) * (68 + p * 45)]], [C.pink, C.blue, C.lime][i % 3], 3); }
      }
      c.restore();
    });
  }

  drawParticles() {
    const c = this.ctx;
    this.particles.forEach(particle => {
      if (particle.age < (particle.delay || 0)) return;
      c.save(); c.translate(particle.x, particle.y); c.rotate(particle.rotation); c.globalAlpha = clamp((particle.life - particle.age) * 2);
      const s = particle.size;
      if (particle.kind === 'letter') this.label(particle.text, 0, 0, 16 + s, particle.color);
      else if (particle.kind === 'bubble') { this.ellipse(0, 0, s * 1.7, s * 1.7, '#a7c3cd12', '#b3cbd1a0', 1.4); this.ellipse(-s / 2, -s / 2, 2, 2, C.white); }
      else if (particle.kind === 'earth' || particle.kind === 'metal') this.path([[-s, -s * 0.35], [-s * 0.3, -s], [s, 0], [s * 0.5, s * 0.8]], particle.color, C.ink, 0.8);
      else if (particle.kind === 'page') {
        this.rect(-s * 0.6, -s, s * 1.2, s * 1.7, 1, '#e9e5da', '#9caead', 0.8);
        for (let i = 0; i < 3; i++) this.line([[-s * 0.38, -s * 0.65 + i * s * 0.36], [s * 0.35, -s * 0.65 + i * s * 0.36]], '#a6b1aa', 0.8);
        if (this.persona === 'doctor') this.label('✓', 0, s * 0.55, s * 0.60, '#b09094');
      }
      else if (particle.kind === 'crane') this.paperCrane(0, 0, s / 45, 0, particle.color);
      else if (particle.kind === 'clock') { this.rect(-s * 0.12, -s, s * 0.24, s * 1.8, 1, particle.color, '#899ca3', 0.7); this.ellipse(0, -s * 0.8, s * 0.2, s * 0.2, '#d9dfd5'); }
      else if (particle.kind === 'chalk') this.ellipse(0, 0, s * 1.5, s * 0.7, '#e2e5d963');
      else if (particle.kind === 'confetti') this.rect(-s * 0.4, -s, s * 0.8, s * 2, 1, particle.color, null);
      else this.ellipse(0, 0, s, particle.kind === 'paint' ? s * 0.65 : s, particle.color);
      c.restore();
    });
  }

  drawCharge() {
    if (this.charge <= 0) return;
    const c = this.ctx, g = this.mode === 'earth' ? this.globe : this.point(this.aim.x, this.aim.y);
    const r = this.mode === 'earth' ? g.r + 21 : 38;
    this.ellipse(g.x, g.y, r, r, null, '#bac8a125', 4);
    c.beginPath(); c.arc(g.x, g.y, r, -Math.PI / 2, -Math.PI / 2 + this.charge * TAU); c.strokeStyle = this.charge > 0.8 ? C.gold : C.lime; c.lineWidth = 6; c.stroke();
    if (this.mode === 'earth') { this.glow(g.x, g.y, g.r * 1.7, `rgba(255,201,123,${this.charge * 0.16})`); this.label(`${Math.round(this.charge * 100)}%`, g.x, g.y + 9, this.mobile ? 43 : 29, C.white); }
  }
}
