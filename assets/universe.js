const TAU = Math.PI * 2;
const TEACHER_CHARACTER_URL = new URL('./teacher-character.png?v=4', import.meta.url).href;
const C = { ink: '#293c46', white: '#f5f0e8', lime: '#bac8a1', purple: '#b3a9c6', pink: '#d4adb3', blue: '#a7c3cd', gold: '#d9c5a1' };
const TOOLS = { lab: ['hammer', 'gravity', 'rainbow'], mentor: ['shred', 'mute', 'reply'], earth: ['meteor', 'laser', 'blackhole'], mice: ['disco', 'bubbles', 'snacks'] };
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const LAB_KINDS = {
  phd: ['microscope', 'monitor', 'centrifuge', 'tubes', 'flask', 'gel'],
  doctor: Array(6).fill('document'),
  teacher: Array(6).fill('burden-paper')
};
const LAB_NAMES = {
  phd: ['显微镜', '结果电脑', '离心机', '试管架', '培养瓶', '跑胶仪'],
  doctor: ['基金标书', '迎检材料', 'DRG说明', '课题预算', '检查台账', 'DRG复核'],
  teacher: ['非教学报表', '迎检材料', '打卡截图', '临时会议', '重复录入', '评比台账']
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
    this.teacherAssetStatus = 'loading';
    this.teacherImage = new Image();
    this.teacherImage.onload = () => { this.teacherAssetStatus = 'ready'; this.draw(); this.wake(); };
    this.teacherImage.onerror = () => { this.teacherAssetStatus = 'error'; this.draw(); };
    this.teacherImage.src = TEACHER_CHARACTER_URL;
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
    this.mouseReactions = [];
    this.researcherReaction = 0;
    this.faceReaction = 0;
    this.stickers = [];
    this.queue = this.paintFor('mice').queueLabels.map((text, id) => ({ id, text, gone: false }));
    this.lastInteraction = null;
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
    // The workplace fills the gutters; gameplay and pointer math share this camera.
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
      this.equipment.forEach((item, i) => { item.x = 238 + (i % 2) * 320; item.y = 228 + Math.floor(i / 2) * Math.min(156, (h - 325) / 3); });
      const positions = [[205, 141], [595, 141], [205, h * 0.64], [595, h * 0.64], [400, h - 110]];
      this.cards.forEach((card, i) => { [card.x, card.y] = positions[i]; });
      this.core = { x: 400, y: h * 0.42, r: 72 };
      this.globe = { x: 400, y: h * 0.44, r: 188 };
      this.labMouse = { id: 99, x: 645, y: h - 145, radius: 88 };
      this.researcher = { id: 98, x: 136, y: h - 91, radius: 90 };
    } else {
      const positions = [[203, 245], [381, 245], [592, 240], [506, 319], [287, 332], [654, 316]];
      this.equipment.forEach((item, i) => { [item.x, item.y] = positions[i]; });
      const positionsCards = [[153, 143], [650, 132], [147, 311], [654, 316], [400, 84]];
      this.cards.forEach((card, i) => { [card.x, card.y] = positionsCards[i]; });
      this.core = { x: 400, y: h * 0.48, r: 74 };
      this.globe = { x: 400, y: h * 0.51, r: 138 };
      this.labMouse = { id: 99, x: 711, y: 406, radius: 45 };
      this.researcher = { id: 98, x: 70, y: 409, radius: 46 };
    }
    if (this.persona === 'doctor') {
      const paperY = this.mobile ? h * 0.29 : 166;
      this.equipment.forEach((item, i) => { item.x = this.mobile ? 222 + (i % 2) * 356 : 171 + (i % 3) * 229; item.y = paperY + Math.floor(i / (this.mobile ? 2 : 3)) * (this.mobile ? 130 : 118); });
    }
    this.bins = this.paintFor('lab').binLabels.map((label, id) => ({ id, label, x: 158 + id * 242, y: this.mobile ? h - 149 : 388, width: this.mobile ? 190 : 183, height: this.mobile ? 91 : 67 }));
    const spriteHeight = this.mobile ? Math.min(h * 0.67, 650) : 342;
    const spriteWidth = spriteHeight * (2 / 3);
    const spriteX = this.persona === 'teacher' && this.mode === 'lab' ? (this.mobile ? 402 : 454) : 400 - spriteWidth / 2, spriteY = this.mobile ? h * 0.22 : 103;
    this.character = { x: spriteX, y: spriteY, width: spriteWidth, height: spriteHeight,
      faceX: spriteX + spriteWidth * 0.495, faceY: spriteY + spriteHeight * 0.215,
      faceRadius: this.mobile ? 85 : 48 };
    if (this.persona === 'teacher' && this.mode === 'lab') this.equipment.forEach((item, i) => { item.x = (this.mobile ? 137 : 144) + (i % 2) * (this.mobile ? 196 : 178); item.y = (this.mobile ? h * 0.29 : 186) + Math.floor(i / 2) * (this.mobile ? 156 : 99); });
    this.layoutQueue();
  }

  get environment() { return { phd: 'laboratory', doctor: 'hospital', teacher: 'school' }[this.persona]; }

  normalized(x, y) { return { x: (x + this.offsetX) / this.viewW, y: (y + this.offsetY) / this.viewH }; }

  getTargets() {
    let targets = [];
    if (this.mode === 'lab') {
      targets = this.equipment.filter(item => !item.gone).map(item => ({ id: item.id, kind: this.persona === 'phd' ? 'instrument' : 'document', label: this.paintFor('lab').equipmentNames[item.id], category: this.paintFor('lab').documentCategories[item.id % 6], ...this.normalized(item.x, item.y - 44), width: 130 / this.viewW, height: 136 / this.viewH }));
      if (this.persona === 'phd') targets.push({ id: 99, kind: 'mouse', ...this.normalized(this.labMouse.x, this.labMouse.y - 25), radius: this.labMouse.radius / this.viewW }, this.researcherTarget());
    } else if (this.mode === 'mentor') targets = this.cards.filter(item => !item.gone).map(item => ({ id: item.id, kind: 'notification', label: item.text, ...this.normalized(item.x, item.y), width: (this.mobile ? 340 : 214) / this.viewW, height: (this.mobile ? 108 : 86) / this.viewH }));
    else if (this.persona === 'teacher') targets = [{ id: 0, kind: 'face', ...this.normalized(this.character.faceX, this.character.faceY), radius: this.character.faceRadius / this.viewW }];
    else if (this.mode === 'earth') targets = [{ id: 0, kind: this.persona === 'phd' ? 'ddl-ball' : 'drg-stack', ...this.normalized(this.globe.x, this.globe.y), radius: this.globe.r / this.viewW }];
    else if (this.persona === 'doctor') { this.layoutQueue(); targets = this.queue.filter(item => !item.gone && Number.isFinite(item.x)).slice(0, 3).map(item => ({ id: item.id, kind: 'queue-paper', label: item.text, ...this.normalized(item.x, item.y), width: 154 / this.viewW, height: 120 / this.viewH })); }
    else targets = this.mouseSpots().map(item => ({ id: item.id, kind: 'mouse', ...this.normalized(item.x, item.y - 28), radius: (this.mobile ? 82 : 54) / this.viewW })).concat([this.researcherTarget()]);
    if (this.mode === 'mentor' && this.persona === 'phd') targets.push({ id: 97, kind: 'mentor', ...this.normalized(this.core.x - 134, this.core.y - 65), radius: 30 / this.viewW }, { id: 98, kind: 'researcher', ...this.normalized(this.core.x + 134, this.core.y - 65), radius: 30 / this.viewW });
    const face = this.normalized(this.character.faceX, this.character.faceY);
    return { environment: this.environment, persona: this.persona, mode: this.mode, targets,
      bins: this.persona === 'doctor' && this.mode === 'lab' ? this.bins.map(bin => ({ id: bin.id, label: bin.label, ...this.normalized(bin.x, bin.y), width: bin.width / this.viewW, height: bin.height / this.viewH })) : [],
      character: this.persona === 'teacher' ? { ...this.normalized(this.character.x, this.character.y), faceX: face.x, faceY: face.y, faceRadius: this.character.faceRadius / this.viewW } : undefined,
      assetStatus: { teacher: this.teacherAssetStatus } };
  }

  layoutQueue() {
    if (!this.queue) return;
    this.queue.forEach(item => { item.x = NaN; item.y = NaN; });
    this.queue.filter(item => !item.gone).slice(0, 3).forEach((item, i) => { const travel = this.reducedMotion ? 0 : Math.sin(this.time * 0.72) * 18; item.x = this.mobile ? 400 : 204 + i * 198 + travel; item.y = this.mobile ? this.H * 0.29 + i * 150 + travel : this.H * 0.49; });
  }

  mouseSpots() {
    const spots = this.mobile ? [[244, this.H * 0.32], [554, this.H * 0.32], [244, this.H * 0.58], [554, this.H * 0.58]] : [[219, 243], [584, 243], [307, 343], [505, 343]];
    return spots.map(([x, y], id) => ({ x, y, id }));
  }

  researcherBounds() {
    const scale = this.mode === 'mice' ? (this.mobile ? 1.35 : 0.73) : (this.mobile ? 1.5 : 0.92);
    const x = this.mode === 'mice' ? 400 : this.researcher.x, y = this.mode === 'mice' ? this.H - 67 : this.researcher.y;
    return { x, y: y - 88 * scale, width: 110 * scale, height: 190 * scale, faceX: x, faceY: y - 142 * scale, scale };
  }

  researcherTarget() {
    const body = this.researcherBounds(), face = this.normalized(body.faceX, body.faceY);
    return { id: 98, kind: 'researcher', ...this.normalized(body.x, body.y), width: body.width / this.viewW, height: body.height / this.viewH, radius: body.height / (2 * this.viewW), faceX: face.x, faceY: face.y };
  }

  researcherAt(point) {
    const body = this.researcherBounds();
    return Math.abs(point.x - body.x) < body.width / 2 && Math.abs(point.y - body.y) < body.height / 2;
  }

  itemAt(items, point, { width = 130, height = 136, anchor = 44 } = {}) {
    return items.filter(item => !item.gone).find(item => Math.abs(item.x - point.x) < width / 2 && Math.abs(item.y - anchor - point.y) < height / 2) || null;
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
      partyLabel: this.persona === 'doctor' ? '行政队列清空' : this.persona === 'teacher' ? '今天不加任务' : '鼠鼠下班啦',
      binLabels: ['标书', '检查', 'DRG'], documentCategories: ['标书', '检查', 'DRG', '标书', '检查', 'DRG'],
      burdens: ['非教学报表', '迎检材料', '打卡截图', '临时会议', '重复录入', '家校群', '评比台账'],
      queueLabels: ['标书格式', '检查台账', 'DRG说明', '预算修改', '汇报材料', '复核表', '签字流程', '盖章申请', '检查清单', '临时会议', '补充附件', '重复录入']
    };
    const supplied = this.scenes?.[scene]?.paint || {};
    const merged = { ...fallback, ...supplied };
    for (const field of ['equipmentKinds', 'equipmentNames', 'cards', 'replies', 'satellites', 'binLabels', 'documentCategories', 'burdens', 'queueLabels']) {
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
        this.dragTarget = this.mode === 'lab' ? this.itemAt(this.equipment, point) : this.itemAt(this.cards, point, { width: this.mobile ? 340 : 214, height: this.mobile ? 108 : 86, anchor: 0 });
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
    if (this.disposed || this.paused || this.bursting) return { applied: false, interaction: 'unavailable' };
    if (options.tool) this.setTool(options.tool);
    const point = this.point(x, y);
    this.aim = { x: clamp(x), y: clamp(y) };
    this.ended = false;
    let feedback;
    if (this.mode === 'lab') feedback = this.hitLab(point, options);
    if (this.mode === 'mentor') feedback = this.hitMentor(point, options);
    if (this.mode === 'earth') feedback = this.hitEarth(point, options);
    if (this.mode === 'mice') feedback = this.hitMice(point, options);
    if (feedback?.applied) { this.hits++; this.shake = this.reducedMotion ? 0 : 0.10 + this.intensity * 0.02; }
    this.lastInteraction = feedback;
    this.dragTarget = null;
    this.gesture = null;
    this.trim(); this.draw(); this.wake();
    return feedback || { applied: false, interaction: 'empty' };
  }

  hitLab(point, options) {
    if (this.persona === 'phd' && !options.autoTarget) {
      if (Math.hypot(point.x - this.labMouse.x, point.y - (this.labMouse.y - 25)) < this.labMouse.radius) return this.petMouse(this.labMouse, false);
      if (this.researcherAt(point)) return this.restResearcher();
    }
    const target = options.autoTarget ? this.equipment.find(item => !item.gone) : this.dragTarget && !this.equipment[this.dragTarget.id]?.gone ? this.equipment[this.dragTarget.id] : this.itemAt(this.equipment, point);
    if (!target) return { applied: false, message: { phd: '点一件仪器，或者摸摸旁边的鼠鼠。', doctor: '抓住一份纸张，拖进对应的分类箱。', teacher: '点一份额外任务，把它送回发任务的人。' }[this.persona], interaction: 'empty' };
    const item = this.equipment[target.id];
    let releasedAt = Number.isFinite(options.endX) && Number.isFinite(options.endY) ? this.point(options.endX, options.endY) : item;
    if (this.persona === 'doctor') {
      const category = this.paintFor('lab').documentCategories[item.id % 6];
      const correct = this.bins.find(bin => bin.label === category) || this.bins[item.id % 3];
      if (options.autoTarget) releasedAt = correct;
      const bin = this.bins.find(candidate => Math.abs(releasedAt.x - candidate.x) <= candidate.width / 2 && Math.abs(releasedAt.y - candidate.y) <= candidate.height / 2);
      if (!bin || bin.id !== correct.id) {
        this.effects.push({ kind: 'sort-wrong', x: item.x, y: item.y - 100, age: 0, life: 1.3, text: `放进「${correct.label}」箱` });
        return { applied: false, gain: 0, message: `这份${this.paintFor('lab').equipmentNames[item.id]}归「${correct.label}」，拖进去就好。`, impact: '再分一次就好', interaction: 'sort-wrong', targetId: item.id };
      }
      item.gone = true;
      this.flights.push({ kind: 'sorted', item: { ...item }, originX: item.x, originY: item.y - 45, x: item.x, y: item.y - 45, toX: bin.x, toY: bin.y, age: 0, life: this.reducedMotion ? 0.2 : 0.7, tool: this.tool });
      this.effects.push({ kind: 'handoff', x: bin.x, y: bin.y - 15, age: 0, life: 0.9 });
      this.ring(bin.x, bin.y, C.blue);
      if (this.tool === 'rainbow') this.emit(bin.x, bin.y - 25, 20, 'confetti');
      return { applied: true, gain: 1, message: `${this.paintFor('lab').equipmentNames[item.id]}，归好了。`, impact: `${correct.label} · 已归档`, interaction: 'sort-correct', targetId: item.id };
    }
    item.gone = true;
    if (this.persona === 'teacher') {
      this.launchPaper(this.paintFor('lab').equipmentNames[item.id], item.x, item.y - 44, 0, false);
      this.emit(item.x, item.y - 35, 9, 'page');
      return { applied: true, gain: 1, message: '这件额外任务，送回发任务的人。', impact: '额外任务，退回！', interaction: 'burden-return', targetId: item.id };
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
      this.flights.push({ kind: 'equipment', item: { ...item }, x: releasedAt.x, y: releasedAt.y, vx: fling ? clamp(fling.dx, -2, 2) * this.viewW : (item.x < 400 ? -1 : 1) * (160 + this.intensity * 65), vy: fling ? clamp(fling.dy, -2, 2) * this.viewH - 110 : -220, age: 0, life: 1.45, rotation: 0 });
      this.effects.push({ kind: 'hammer', x: releasedAt.x, y: releasedAt.y - 45, age: 0, life: 0.38 });
      if (!fling) this.splitEquipment(item, releasedAt, false);
    }
    if (this.splashes.length > 8) this.splashes.shift();
    return { applied: true, gain: 1, interaction: options.fling ? 'instrument-fling' : 'instrument-hit', targetId: item.id };
  }

  petMouse(mouse, count = true, gain = 1) {
    this.mouseReactions.push({ id: mouse.id, x: mouse.x, y: mouse.y, age: 0, life: 1.2, tool: this.mode === 'mice' ? this.tool : 'snacks' });
    this.effects.push({ kind: this.mode === 'mice' ? this.tool : 'bubbles', x: mouse.x, y: mouse.y - 33, age: 0, life: 1.2 });
    this.emit(mouse.x, mouse.y - 36, 12, this.tool === 'bubbles' ? 'bubble' : 'confetti');
    const name = this.mode === 'mice' ? { disco: 'mouse-dance', bubbles: 'mouse-bubble', snacks: 'mouse-feed' }[this.tool] : 'mouse-pet';
    return { applied: count, gain: count ? gain : 0, message: this.mode === 'mice' ? '鼠鼠收到啦，开心得晃起了耳朵。' : '鼠鼠蹭了蹭你的手。先陪它歇一会儿。', impact: this.tool === 'snacks' ? '给鼠鼠加一颗小零食' : '鼠鼠也松了一口气', interaction: name, targetId: mouse.id };
  }

  restResearcher() {
    this.researcherReaction = 1.8;
    const x = this.mode === 'mice' ? 400 : this.researcher.x;
    this.effects.push({ kind: 'researcher-rest', x, y: this.mode === 'mice' ? this.H - 150 : this.researcher.y - 115, age: 0, life: 1.8 });
    return { applied: false, gain: 0, message: '博士生把肩膀放下来，喝了口水。今天已经很努力了。', impact: '博士生也休息一下', interaction: 'researcher-rest', targetId: 98 };
  }

  hitMentor(point, options) {
    if (this.persona === 'phd' && !options.autoTarget) {
      const avatar = Math.hypot(point.x - (this.core.x - 134), point.y - (this.core.y - 65)) < 30 ? '导师' : Math.hypot(point.x - (this.core.x + 134), point.y - (this.core.y - 65)) < 30 ? '博士生' : null;
      if (avatar) { this.effects.push({ kind: 'researcher-rest', x: point.x, y: point.y - 30, age: 0, life: 1.4 }); return { applied: false, gain: 0, message: avatar === '导师' ? '导师头像点了点头：今天先到这里。' : '博士生放下手机：明天再继续。', impact: '今天先到这里', interaction: avatar === '导师' ? 'mentor-pause' : 'researcher-rest', targetId: avatar === '导师' ? 97 : 98 }; }
    }
    const selected = options.autoTarget ? this.cards.find(card => !card.gone) : this.dragTarget && !this.cards[this.dragTarget.id]?.gone ? this.cards[this.dragTarget.id] : this.itemAt(this.cards, point, { width: this.mobile ? 340 : 214, height: this.mobile ? 108 : 86, anchor: 0 });
    if (!selected) return { applied: false, message: '点一条消息，把它收起来。', interaction: 'empty' };
    const card = this.cards[selected.id];
    const releasedAt = Number.isFinite(options.endX) && Number.isFinite(options.endY) ? this.point(options.endX, options.endY) : card;
    card.gone = true;
    if (this.persona === 'teacher') {
      this.launchPaper(card.text, releasedAt.x, releasedAt.y);
      return { applied: true, gain: 1, message: `「${card.text}」退回给发任务的人。`, impact: '额外通知，退回！', interaction: 'notification-face', targetId: card.id };
    }
    const replies = this.paintFor('mentor').replies;
    this.replies.push({ text: replies[card.id], id: card.id });
    this.ring(releasedAt.x, releasedAt.y, this.tool === 'mute' ? C.blue : C.purple);
    this.flights.push({ kind: this.tool === 'reply' ? 'plane' : 'card', item: { ...card }, x: releasedAt.x, y: releasedAt.y, originX: releasedAt.x, originY: releasedAt.y, age: 0, life: this.reducedMotion ? 0.25 : 1.0, rotation: 0, muted: this.tool === 'mute' });
    if (this.tool === 'mute') this.effects.push({ kind: 'mute', x: releasedAt.x, y: releasedAt.y, age: 0, life: 1.0 });
    else this.emit(releasedAt.x, releasedAt.y, 25 + this.intensity * 9, 'letter', card.text);
    return { applied: true, gain: 1, interaction: 'notification-clear', targetId: card.id };
  }

  hitEarth(point, options) {
    if (this.persona === 'teacher') return this.hitTeacher(point, options);
    const g = this.globe;
    if (!options.autoTarget && Math.hypot(point.x - g.x, point.y - g.y) > g.r * 1.16) return { applied: false, gain: 0, message: this.persona === 'doctor' ? '对着 DRG 纸堆点一下，或按住蓄力。' : '对着 DDL 球点一下，或按住蓄力。', interaction: 'empty' };
    let dx = point.x - g.x, dy = point.y - g.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance > g.r * 0.88) { dx *= g.r * 0.88 / distance; dy *= g.r * 0.88 / distance; }
    const x = g.x + dx, y = g.y + dy;
    const power = 1 + clamp(options.charge ?? this.charge) * 2 + this.intensity * 0.2;
    this.cracks.push({ x: dx / g.r, y: dy / g.r, angle: Math.atan2(dy, dx), power });
    if (this.cracks.length > 16) this.cracks.shift();
    this.effects.push({ kind: this.tool, x, y, age: 0, life: this.reducedMotion ? 0.3 : 0.75, power });
    this.emit(x, y, 22 + Math.round(power * 15), this.persona === 'doctor' ? 'page' : 'earth');
    this.ring(x, y, C.gold); this.charge = 0;
    return { applied: true, interaction: this.persona === 'doctor' ? 'drg-break' : 'ddl-hit', targetId: 0 };
  }

  hitMice(point, options) {
    if (this.persona === 'teacher') return this.hitTeacher(point, options);
    if (this.persona === 'doctor') {
      this.layoutQueue();
      const item = options.autoTarget ? this.queue.find(paper => !paper.gone) : this.itemAt(this.queue, point, { width: 154, height: 120, anchor: 0 });
      if (!item) return { applied: false, gain: 0, message: '点一张传送带上的行政纸张。', interaction: 'empty' };
      item.gone = true;
      this.flights.push({ kind: 'queued', item: { ...item }, x: item.x, y: item.y, originX: item.x, originY: item.y, age: 0, life: 0.65, tool: this.tool, toX: 684, toY: this.mobile ? this.H - 175 : 319 });
      this.emit(item.x, item.y, 12, 'page');
      if (this.tool === 'disco') this.effects.push({ kind: 'handoff', x: item.x, y: item.y, age: 0, life: 0.65 });
      else if (this.tool === 'bubbles') this.ring(item.x, item.y, C.blue);
      else this.ring(659, this.mobile ? this.H - 127 : this.H * 0.60 + 89, C.lime);
      this.layoutQueue();
      return { applied: true, gain: 1, message: `${item.text}，收下了。队列又短了一点。`, impact: '收走一件行政任务', interaction: 'admin-queue-clear', targetId: item.id };
    }
    if (!options.autoTarget && this.researcherAt(point)) return this.restResearcher();
    const mice = this.mouseSpots();
    const mouse = options.autoTarget ? mice[this.hits % mice.length] : mice.find(item => Math.hypot(point.x - item.x, point.y - (item.y - 28)) < (this.mobile ? 82 : 54));
    if (!mouse) return { applied: false, gain: 0, message: '点到鼠鼠，它才会回应你。', interaction: 'empty' };
    return this.petMouse(mouse, true, options.gain || 1);
  }

  hitTeacher(point, options) {
    const face = this.character;
    const aim = Number.isFinite(options.endX) && Number.isFinite(options.endY) ? this.point(options.endX, options.endY) : point;
    if (!options.autoTarget && Math.hypot(aim.x - face.faceX, aim.y - face.faceY) > face.faceRadius * 1.4) return { applied: false, gain: 0, message: '对准拿着话筒的人，把额外任务送回去。', interaction: 'paper-miss' };
    const labels = this.paintFor().burdens;
    const label = labels[this.hits % labels.length];
    this.launchPaper(label, this.mobile ? 142 : 132, this.H - (this.mobile ? 200 : 86));
    this.charge = 0;
    return { applied: true, gain: this.mode === 'mice' ? 1 : undefined, message: `「${label}」送回了发任务的人。`, impact: `${label} · 退回！`, interaction: 'paper-face', targetId: 0 };
  }

  launchPaper(text, x, y, delay = 0, big = false) {
    const face = this.character;
    this.flights.push({ kind: 'burden', shape: ['laser', 'reply'].includes(this.tool) ? 'plane' : ['blackhole', 'gravity', 'snacks'].includes(this.tool) ? 'bundle' : 'ball', text, originX: x, originY: y, x, y, toX: face.faceX, toY: face.faceY, age: 0, delay, life: this.reducedMotion ? 0.26 : big ? 1.45 : 1.05, contact: false, rotation: 0 });
  }

  burst(options = {}) {
    if (this.disposed || this.paused || this.bursting) return;
    if (options.tool) this.setTool(options.tool);
    this.bursting = true; this.burstAge = 0; this.ended = false; this.charge = 0;
    this.shake = this.reducedMotion ? 0 : 0.20 + this.intensity * 0.045;
    if (this.persona === 'teacher') {
      this.equipment.forEach(item => { item.gone = true; });
      this.cards.forEach(card => { card.gone = true; });
      const labels = this.mode === 'mentor' ? this.paintFor('mentor').cards : this.paintFor().burdens;
      for (let i = 0; i < 14; i++) this.launchPaper(labels[i % labels.length], i % 2 ? 675 : 123, this.H - 115 - i % 3 * 65, this.reducedMotion ? 0 : i * 0.072, true);
      this.splitPaperStack(this.character.faceX, this.character.faceY + 30, true);
      this.emit(this.character.faceX, this.character.faceY, 65, 'page', '', true);
      this.ring(this.character.faceX, this.character.faceY, C.gold, true);
    } else if (this.mode === 'lab') {
      this.equipment.forEach((item, i) => {
        item.gone = true;
        this.splitEquipment(item, item, true, i * 0.025);
        this.emit(item.x, item.y - 20, this.persona === 'phd' ? 9 : 17, this.persona === 'doctor' ? 'page' : 'metal', '', true);
      });
      this.ring(400, this.H * 0.51, C.lime, true);
      if (this.persona === 'doctor') this.effects.push({ kind: 'handoff', x: 400, y: this.H * 0.49, age: 0, life: 1.1, large: true });
    } else if (this.mode === 'mentor') {
      this.cards.forEach(card => { if (!card.gone) { card.gone = true; this.flights.push({ kind: 'card', item: { ...card }, x: card.x, y: card.y, originX: card.x, originY: card.y, age: 0, life: 1.3, rotation: 0 }); } });
      this.replies = [{ text: this.paintFor('mentor').replies[0], id: 0 }];
      this.emit(this.core.x, this.core.y, 90, 'letter', '今天先到这里'); this.ring(this.core.x, this.core.y, C.purple, true);
    } else if (this.mode === 'earth') {
      if (this.persona === 'doctor') this.splitPaperStack(this.globe.x, this.globe.y, true); else this.splitWorld();
      this.emit(this.globe.x, this.globe.y, 55, this.persona === 'doctor' ? 'page' : 'earth', '', true);
      this.ring(this.globe.x, this.globe.y, C.blue, true);
    } else if (this.persona === 'doctor') {
      this.queue.forEach(item => { item.gone = true; });
      this.splitPaperStack(400, this.H * 0.48, true);
      this.emit(400, this.H * 0.44, 90, 'page', '', true);
      this.ring(400, this.H * 0.5, C.blue, true);
    } else {
      this.mouseSpots().forEach(mouse => this.petMouse(mouse, false));
      this.emit(400, this.H * 0.42, 180, 'confetti', '', true);
      this.effects.push({ kind: 'festival', x: 400, y: this.H * 0.42, age: 0, life: this.burstDuration });
      this.ring(400, this.H * 0.5, C.pink, true);
    }
    const center = this.persona === 'teacher' ? { x: this.character.faceX, y: this.character.faceY } : this.mode === 'earth' ? this.globe : this.mode === 'mentor' ? this.core : { x: 400, y: this.H * 0.52 };
    this.explosions.push({ x: center.x, y: center.y, age: 0, life: this.burstDuration, power: this.intensity / 2, radius: this.mode === 'earth' ? this.globe.r : this.mobile ? 170 : 120 });
    this.trim(); this.draw(); this.wake();
  }

  splitPaperStack(x, y, big = true) {
    for (let i = 0; i < 7; i++) {
      const item = { kind: 'document', id: i % 6, x: x + (i % 3 - 1) * 65, y: y + Math.floor(i / 3) * 34 };
      this.splitEquipment(item, item, big, i * 0.026);
    }
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
    this.researcherReaction = Math.max(0, this.researcherReaction - elapsed);
    this.faceReaction = Math.max(0, this.faceReaction - elapsed);
    this.mouseReactions = this.mouseReactions.filter(reaction => { reaction.age += elapsed; return reaction.age < reaction.life; });
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
      if (flight.kind === 'burden' && !flight.contact && flight.age - (flight.delay || 0) >= flight.life * 0.46) {
        flight.contact = true; this.faceReaction = 0.45;
        this.stickers.push({ text: flight.text, x: flight.toX + (this.stickers.length % 2 ? 1 : -1) * 28, y: flight.toY + 28 + this.stickers.length % 3 * 18, tilt: (this.stickers.length % 2 ? 1 : -1) * 0.1 });
        if (this.stickers.length > 5) this.stickers.shift();
        this.effects.push({ kind: 'paper-contact', x: flight.toX, y: flight.toY, age: 0, life: 0.45 });
        this.emit(flight.toX, flight.toY, 7, 'page');
      }
      return flight.age < flight.life + (flight.delay || 0);
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
    if (!this.paused && !this.hidden && (!this.reducedMotion || this.particles.length || this.effects.length || this.flights.length || this.mouseReactions.length || this.researcherReaction || this.bursting)) this.raf = requestAnimationFrame(this.tick);
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
    const c = this.ctx, h = this.H, floor = h * 0.76;
    const palette = { phd: ['#f3f0e7', '#e0e8df', '#c8d6ce'], doctor: ['#e8f1f0', '#d8e7e3', '#bccfca'], teacher: ['#f2eadb', '#e6dfcd', '#d6c8af'] }[this.persona];
    const gradient = c.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, palette[0]); gradient.addColorStop(0.76, palette[1]); gradient.addColorStop(1, palette[2]);
    c.fillStyle = gradient; c.fillRect(-this.offsetX, -this.offsetY, this.viewW, this.viewH);
    this.rect(-this.offsetX, floor, this.viewW, this.viewH - floor, 0, palette[2], null);
    this.line([[-this.offsetX, floor], [800 + this.offsetX, floor]], '#afbeb4', 3);
    for (let i = -5; i < 10; i++) this.line([[i * 170, floor], [400 + (i * 170 - 400) * 1.8, h]], '#a4b2a530', 1.4);
    this.window(68, this.mobile ? 108 : 67, 171, this.mobile ? 173 : 132);
    if (this.persona === 'phd') {
      this.rect(454, 87, 242, this.mobile ? 153 : 117, 10, '#d8dfd4', '#adbeb4', 2);
      this.rect(469, 99, 211, this.mobile ? 97 : 67, 3, '#edf2e7', '#a9bcb7', 1.2);
      this.line([[482, 185], [670, 185]], '#91a79e', 3);
      for (let i = 0; i < 6; i++) { this.rect(486 + i * 29, 133, 14, 31, 4, [C.blue, C.lime, C.purple][i % 3], '#869f98', 1); this.rect(484 + i * 29, 128, 18, 6, 2, '#77968b', null); }
      this.rect(294, 76, 106, 61, 7, '#e8e1d0', '#b8b7a3', 1.5);
      this.label('实验室', 347, 105, this.fontSize(15, 12), '#557468');
      this.label('今天也慢慢来', 347, 122, this.fontSize(10, 10), '#667f72');
    } else if (this.persona === 'doctor') {
      this.rect(582, 84, 147, floor - 87, 9, '#cbded9', '#91aaa4', 2);
      this.rect(597, 100, 117, 67, 4, '#e6f0e9', '#a6beb4', 1);
      this.label('医院 · 文书站', 654, 130, this.fontSize(13, 11), '#42635d');
      this.line([[654, 143], [654, 155]], '#99b8ab', 3); this.line([[648, 149], [660, 149]], '#99b8ab', 3);
      this.ellipse(698, floor - 110, 5, 5, '#66857d');
      this.rect(290, 87, 237, 82, 8, '#f0f2e9', '#b0c3b7', 1.5);
      this.label('待办不等于你的全部', 408, 122, this.fontSize(15, 12), '#59726a');
      this.line([[315, 145], [494, 145]], '#c5d0bd', 3);
      this.rect(-this.offsetX, floor - 23, this.viewW, 16, 0, '#a9c2b8', null);
    } else {
      this.rect(287, 81, 278, this.mobile ? 178 : 139, 5, '#bea581', '#a08e70', 2);
      this.rect(298, 91, 256, this.mobile ? 157 : 119, 2, '#718f7e', '#4f7162', 1.5);
      this.label('今天的课，讲完了。', 426, this.mobile ? 144 : 131, this.fontSize(this.mobile ? 28 : 20, 13), '#eceddb');
      this.label('额外任务，下课后退回。', 426, this.mobile ? 185 : 161, this.fontSize(this.mobile ? 20 : 13, 11), '#e0e5cf');
      this.line([[315, this.mobile ? 224 : 191], [528, this.mobile ? 224 : 191]], '#e2e3d1', 2);
      this.rect(646, 93, 78, 101, 6, '#e5dcc4', '#b8aa8b', 1);
      this.label('课程表', 685, 121, this.fontSize(13, 11), '#796e56');
      for (let i = 0; i < 4; i++) this.line([[657, 135 + i * 13], [713, 135 + i * 13]], '#b8af92', 1.5);
      this.rect(51, floor - 43, 165, 25, 5, '#b4a284', '#8d826a', 1); this.line([[72, floor - 18], [64, h]], '#a19378', 8); this.line([[197, floor - 18], [205, h]], '#a19378', 8);
    }
  }

  window(x, y, width, height) {
    this.rect(x, y, width, height, 6, '#d7e6e5', '#afc6bf', 4);
    this.rect(x + 7, y + 7, width - 14, height - 14, 2, '#dfece5', null);
    this.ellipse(x + width * 0.72, y + height * 0.30, 18, 18, '#f0e6c5');
    this.path([[x + 7, y + height - 28], [x + 43, y + height - 51], [x + 86, y + height - 22], [x + width - 7, y + height - 47], [x + width - 7, y + height - 7], [x + 7, y + height - 7]], '#b7ceaf', null);
    this.line([[x + width / 2, y + 3], [x + width / 2, y + height - 3]], '#afc6bf', 5); this.line([[x + 3, y + height / 2], [x + width - 3, y + height / 2]], '#afc6bf', 5);
    this.rect(x - 9, y + height, width + 18, 9, 3, '#b0c3b5', null);
  }

  sceneLabels() {
    const size = this.fontSize(this.mobile ? 26 : 13, 14);
    const paint = this.paintFor();
    this.label(paint.sceneTag, 400, this.mobile ? 49 : 33, size, '#344a46', 'center', 500);
    if (this.ended) {
      const w = this.mobile ? 660 : 390;
      this.rect(400 - w / 2, this.H - (this.mobile ? 87 : 60), w, this.mobile ? 55 : 35, 18, '#edf0e3e8', '#a5baa4', 1);
      this.wrappedLabel(paint.endingTag, 400, this.H - (this.mobile ? 52 : 38), w - 28, this.fontSize(this.mobile ? 26 : 14, 12), '#344a46', 1);
    }
  }

  lab() {
    if (this.persona === 'doctor') { this.documentSorting(); return; }
    if (this.persona === 'teacher') {
      this.platform(this.mobile ? 243 : 235, this.mobile ? this.H * 0.59 : 345, this.mobile ? 382 : 394, this.mobile ? 357 : 151);
      this.teacherCharacter();
      this.equipment.forEach(item => this.drawLabItem(item));
      return;
    }
    if (this.mobile) this.equipment.forEach(item => this.platform(item.x, item.y + 21, 194, 49));
    else this.platform(409, 326, 700, 138);
    this.equipment.forEach(item => this.drawLabItem(item));
    this.researcherPerson(this.researcher.x, this.researcher.y, this.mobile ? 1.5 : 0.92);
    this.interactiveMouse(this.labMouse.x, this.labMouse.y, this.mobile ? 1.32 : 0.77, 'scientist', 99);
    this.splashes.forEach(splash => this.ellipse(splash.x, splash.y + 10, 45, 10, `${splash.color}85`));
    this.label('摸摸鼠鼠', this.labMouse.x, this.labMouse.y + (this.mobile ? 71 : 39), this.fontSize(this.mobile ? 25 : 12, 11), '#566e63');
  }

  documentSorting() {
    const h = this.H;
    this.platform(400, this.mobile ? h * 0.58 : 287, 725, this.mobile ? h * 0.48 : 194);
    this.bins.forEach(bin => {
      const highlighted = this.gesture?.active && this.dragTarget && this.paintFor('lab').documentCategories[this.dragTarget.id] === bin.label;
      this.rect(bin.x - bin.width / 2, bin.y - bin.height / 2, bin.width, bin.height, 13, highlighted ? '#d3dfbc' : ['#d9ddc4', '#c8dde0', '#d9cddd'][bin.id], '#78948a', highlighted ? 3 : 1.8);
      this.rect(bin.x - bin.width / 2 + 8, bin.y - bin.height / 2 - 4, bin.width - 16, 12, 5, '#97aaa0', '#728c80', 1);
      this.label(bin.label, bin.x, bin.y + 8, this.fontSize(this.mobile ? 30 : 21, 14), '#344e46');
      const filed = this.equipment.filter(item => item.gone && this.paintFor('lab').documentCategories[item.id] === bin.label).length;
      this.label(`${filed} / 2`, bin.x, bin.y + (this.mobile ? 35 : 29), this.fontSize(this.mobile ? 23 : 13, 11), '#5c776c');
    });
    this.equipment.forEach(item => this.drawLabItem(item));
  }

  platform(x, y, width, depth) {
    const left = x - width / 2, right = x + width / 2, d = depth / 2;
    this.ellipse(x, y + 57, width * 0.43, 22, '#526b5320');
    this.path([[left, y - d], [right - 37, y - d - 16], [right, y + d - 16], [left + 37, y + d]], '#e2dccd', '#b2bbab', 1.5);
    this.path([[left + 37, y + d], [right, y + d - 16], [right, y + d + 8], [left + 37, y + d + 24]], '#c6c9b6', '#9fab9a', 1.5);
    this.path([[left, y - d], [left + 37, y + d], [left + 37, y + d + 24], [left, y - d + 24]], '#d0d1be', '#a4ad98', 1.5);
    this.line([[left + 47, y + d + 13], [right - 8, y + d - 3]], '#b1bba2', 2);
  }

  drawLabItem(item) {
    if (item.gone) {
      this.ellipse(item.x, item.y + 12, 34, 8, '#82948426');
      if (this.persona === 'doctor') this.label('已归档', item.x, item.y - 35, this.fontSize(this.mobile ? 26 : 13, 12), '#657d6e');
      else if (this.persona === 'teacher') this.label('已退回', item.x, item.y - 36, this.fontSize(this.mobile ? 24 : 13, 11), '#778568');
      return;
    }
    const dragging = this.gesture?.active && this.dragTarget?.id === item.id;
    const point = dragging ? this.point(this.gesture.x, this.gesture.y) : item;
    if (dragging) {
      this.ctx.save(); this.ctx.setLineDash([4, 5]); this.line([[item.x, item.y], [point.x, point.y]], '#899f7b', 2); this.ctx.restore();
    }
    if (this.persona === 'phd') this.instrument(item.kind, point.x, point.y, this.mobile ? 1.15 : 1, dragging ? -0.08 : 0);
    else this.document(this.paintFor('lab').equipmentNames[item.id], point.x, point.y - 43, this.mobile ? 1.17 : 1, item.id, dragging ? -0.08 : 0, this.persona === 'teacher');
    if (this.persona === 'phd') this.label(this.paintFor('lab').equipmentNames[item.id], item.x, item.y + (this.mobile ? 50 : item.id === 1 ? 44 : 30), this.fontSize(this.mobile ? 26 : 13, 12), '#48675f');
  }

  document(text, x, y, scale = 1, id = 0, rotation = 0, burden = false) {
    const c = this.ctx; c.save(); c.translate(x, y); c.rotate(rotation); c.scale(scale, scale);
    this.rect(-62, -45, 124, 100, 7, '#cbd1bd50', null);
    this.rect(-64, -50, 124, 100, 6, burden ? '#eee4d3' : '#f7f5e9', '#97a997', 1.5);
    this.rect(-64, -50, 124, 24, 6, [C.lime, C.blue, C.purple][id % 3], null);
    this.wrappedLabel(text, -2, 0, 107, this.fontSize(this.mobile ? 20 : 15, 11), '#435f55', 2, true);
    for (let i = 0; i < 2; i++) this.line([[-46, 20 + i * 11], [40, 20 + i * 11]], '#b1bda6', 1.3);
    this.path([[40, 50], [60, 30], [40, 30]], '#d8ddc8', '#97a997', 1);
    c.restore();
  }

  instrument(kind, x, y, scale = 1, rotation = 0) {
    const c = this.ctx; c.save(); c.translate(x, y); c.rotate(rotation); c.scale(scale, scale);
    this.ellipse(0, 10, 45, 11, '#060d1360');
    if (kind === 'document' || kind === 'burden-paper') {
      this.document(kind === 'burden-paper' ? '额外任务' : '行政材料', 0, -47, 1, 0, 0, kind === 'burden-paper');
    } else if (kind === 'microscope') {
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
    if (this.persona === 'teacher') this.teacherCharacter();
    else {
    this.rect(core.x - 87, core.y - 63, 174, 126, 19, '#d2dfcd', '#8da389', 2);
    this.rect(core.x - 68, core.y - 51, 136, 13, 5, '#92aa8c', '#718c70', 1);
    this.label(this.ended ? '消息已收好' : '消息收纳盒', core.x, core.y + 7, this.fontSize(this.mobile ? 27 : 18, 13), '#41644d');
    this.label('明天再处理', core.x, core.y + 36, this.fontSize(this.mobile ? 21 : 12, 11), '#5f7c61');
    }
    if (this.persona === 'phd') { this.humanAvatar(core.x - 134, core.y - 65, this.paintFor('mentor').mentorAvatarLabel || '导师', 0.8); this.humanAvatar(core.x + 134, core.y - 65, this.paintFor('mentor').researcherLabel || '博士生', 0.8); }
    this.cards.forEach(card => {
      if (card.gone) return;
      if (this.gesture?.active && this.dragTarget?.id === card.id) {
        const point = this.point(this.gesture.x, this.gesture.y);
        c.save(); c.setLineDash([4, 6]); this.line([[point.x, point.y], [core.x, core.y]], '#9baa99', 2); c.restore();
        this.chat(card.text, point.x, point.y, card.id, true);
      } else this.chat(card.text, card.x, card.y + (this.reducedMotion ? 0 : Math.sin(this.time * 1.5 + card.id) * 3), card.id);
    });
    this.replies.forEach(reply => {
      const slot = this.ended || this.bursting ? { x: 400, y: core.y + (this.mobile ? 150 : 135) } : this.cards[reply.id];
      const w = this.ended || this.bursting ? (this.mobile ? 670 : 410) : (this.mobile ? 330 : 215);
      const hh = this.mobile ? 77 : 54;
      this.rect(slot.x - w / 2, slot.y - hh / 2, w, hh, 16, '#d1dfc7', '#95ac8c', 1.5);
      this.wrappedLabel(reply.text, slot.x, slot.y + 8, w - 24, this.fontSize(this.mobile ? 27 : 14, 13), '#3d5e45', 2, true);
    });
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
    const g = this.globe;
    if (this.persona === 'teacher') { this.teacherTarget(); return; }
    if (this.persona === 'doctor') {
      this.platform(400, g.y + g.r * 0.68, 588, this.mobile ? 132 : 72);
      if (!this.bursting && !this.ended) {
        for (let i = 0; i < 7; i++) this.document(['DRG说明', '编码复核', '费用反馈', '绩效报表', 'DRG清单', '复核材料', '补充说明'][i], g.x + (i % 3 - 1) * (this.mobile ? 106 : 72), g.y + Math.floor(i / 3) * 26 - 60, this.mobile ? 1.4 : 1.2, i, (i % 2 ? 1 : -1) * 0.09);
        this.label('DRG 纸堆', g.x, g.y + g.r + 47, this.fontSize(this.mobile ? 33 : 21, 14), '#4d7164');
        this.cracks.forEach((crack, i) => this.line([[g.x + crack.x * g.r - 38, g.y + crack.y * g.r], [g.x + crack.x * g.r, g.y + crack.y * g.r + 14], [g.x + crack.x * g.r + 37, g.y + crack.y * g.r - 14]], '#b7a27e', 2 + i % 2));
      } else this.label('纸张飞走了，呼吸回来了。', g.x, g.y + 72, this.fontSize(this.mobile ? 29 : 20, 13), '#3e6857');
      return;
    }
    this.platform(400, g.y + g.r + 24, this.mobile ? 680 : 516, this.mobile ? 90 : 55);
    if (!this.bursting && !this.ended) {
      this.globeSurface(g.x, g.y, g.r);
      this.label('DDL', g.x, g.y + 15, this.fontSize(this.mobile ? 54 : 34, 21), '#314d48');
      this.cracks.forEach((crack, i) => {
        const x = g.x + crack.x * g.r, y = g.y + crack.y * g.r;
        this.line([[x - 36, y - 9], [x - 12, y + 5], [x, y], [x + 19, y + 16], [x + 49, y + 6]], '#e5c7a0', 2.5);
        this.line([[x, y], [x + 8, y - 29], [x + 29, y - 43]], '#ead8b7', 1.5);
      });
      this.paintFor('earth').satellites.forEach((text, i) => { const x = 213 + i * 186; this.rect(x - 63, this.H - 99, 126, 37, 7, '#e2ddce', '#a8b5a1', 1); this.label(text, x, this.H - 75, this.fontSize(this.mobile ? 26 : 14, 12), '#566f61'); });
    } else {
      this.flowerPot(g.x, g.y + 70, this.mobile ? 2.0 : 1.1);
      this.label('实验室里，给自己留点空。', g.x, g.y + 151, this.fontSize(this.mobile ? 28 : 18, 13), '#406351');
    }
  }

  worldSurface(x, y, r) { this.globeSurface(x, y, r); }

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


  mice() {
    if (this.persona === 'teacher') { this.teacherTarget(); return; }
    if (this.persona === 'doctor') { this.documentConveyor(); return; }
    const stageY = this.mobile ? this.H * 0.62 : 322;
    this.platform(400, stageY, 725, this.mobile ? this.H * 0.47 : 163);
    this.speaker(this.mobile ? 82 : 104, stageY - 13, this.mobile ? 1.1 : 0.8);
    this.speaker(this.mobile ? 719 : 700, stageY - 13, this.mobile ? 1.1 : 0.8);
    this.mouseSpots().forEach(mouse => this.interactiveMouse(mouse.x, mouse.y, this.mobile ? 1.6 : 1.05, ['dj', 'party', 'vacation', 'scientist'][mouse.id], mouse.id));
    this.researcherPerson(400, this.H - 67, this.mobile ? 1.35 : 0.73);
    this.label('博士生也来歇一会儿', 400, this.H - 40, this.fontSize(this.mobile ? 23 : 12, 11), '#566e60');
    this.discoBall(400, this.mobile ? 104 : 65);
    if (this.bursting || this.ended) this.label(this.paintFor('mice').partyLabel, 400, this.mobile ? this.H * 0.78 : 414, this.fontSize(this.mobile ? 30 : 19, 13), '#4f705c');
  }

  documentConveyor() {
    const h = this.H, y = this.mobile ? h * 0.55 : h * 0.60;
    this.rect(83, this.mobile ? h * 0.17 : y - 114, 629, this.mobile ? h * 0.65 : 172, 26, '#c1d2ca', '#91a99e', 2);
    this.rect(97, this.mobile ? h * 0.18 : y - 98, 601, this.mobile ? h * 0.62 : 140, 18, '#dfe4d5', '#a7b6a5', 1.5);
    const movement = this.reducedMotion ? 0 : this.time * 42 % 50;
    for (let i = 0; i < 13; i++) {
      if (this.mobile) this.line([[113, h * 0.18 + i * 52 + movement], [681, h * 0.18 + i * 52 + movement]], '#bdc7b2', 3);
      else this.line([[113 + i * 49 + movement, y - 92], [113 + i * 49 + movement, y + 34]], '#bdc7b2', 3);
    }
    this.layoutQueue();
    this.queue.filter(item => !item.gone && Number.isFinite(item.x)).slice(0, 3).forEach(item => this.document(item.text, item.x, item.y, this.mobile ? 1.45 : 1.12, item.id, -0.025));
    this.rect(584, this.mobile ? h - 165 : y + 51, 149, 63, 9, '#b5c8b4', '#839f83', 2);
    this.label('行政任务收纳', 659, this.mobile ? h - 127 : y + 89, this.fontSize(this.mobile ? 23 : 13, 11), '#3f6045');
    const left = this.queue.filter(item => !item.gone).length;
    this.label(left ? `还剩 ${left} 件，慢慢清。` : '队列空了，先去喝杯水。', 400, this.mobile ? h - 65 : y + 142, this.fontSize(this.mobile ? 29 : 19, 13), '#456d5b');
  }

  teacherCharacter() {
    const c = this.ctx, a = this.character;
    this.ellipse(a.x + a.width / 2, a.y + a.height - 8, a.width * 0.46, 17, '#7d856326');
    if (this.teacherAssetStatus === 'ready') {
      c.save();
      const wobble = this.reducedMotion ? 0 : Math.sin(this.time * 35) * this.faceReaction * 0.035;
      c.translate(a.faceX, a.y + a.height * 0.68); c.rotate(wobble);
      c.drawImage(this.teacherImage, a.x - a.faceX, -a.height * 0.68, a.width, a.height);
      c.restore();
    } else {
      this.rect(a.x, a.y, a.width, a.height, 12, '#e1dfd1', '#b2b6a1', 1.5);
      this.wrappedLabel(this.teacherAssetStatus === 'error' ? '人物画面加载失败，请刷新。' : '人物画面正在加载…', a.x + a.width / 2, a.y + a.height / 2, a.width - 20, this.fontSize(17, 13), '#526550', 3, true);
    }
    this.stickers.forEach((sticker, i) => {
      c.save(); c.translate(sticker.x, sticker.y); c.rotate(sticker.tilt + (this.reducedMotion ? 0 : Math.sin(this.time * 9 + i) * this.faceReaction * 0.07));
      this.rect(-46, -10, 92, 30, 3, '#eee0b5', '#b9aa83', 1);
      this.label(sticker.text, 0, 11, this.fontSize(11, 9), '#5f6347'); c.restore();
    });
  }

  teacherTarget() {
    const a = this.character, labels = this.paintFor().burdens;
    this.teacherCharacter();
    const next = labels[this.hits % labels.length];
    this.rect(this.mobile ? 62 : 57, this.mobile ? this.H - 184 : 295, this.mobile ? 230 : 193, this.mobile ? 103 : 93, 12, '#f0dfbf', '#b6a17b', 1.5);
    this.label('这次送回', this.mobile ? 177 : 154, this.mobile ? this.H - 151 : 324, this.fontSize(this.mobile ? 25 : 15, 12), '#7b7054');
    this.wrappedLabel(next, this.mobile ? 177 : 154, this.mobile ? this.H - 111 : 354, this.mobile ? 204 : 172, this.fontSize(this.mobile ? 28 : 19, 13), '#5c664d', 2, true);
    this.paperBall(this.mobile ? 167 : 157, this.mobile ? this.H - 232 : 260, this.mobile ? 25 : 19);
    if (!this.ended) {
      this.ctx.save(); this.ctx.setLineDash([5, 8]); this.ellipse(a.faceX, a.faceY, a.faceRadius, a.faceRadius * 0.84, null, '#a8906b80', 1.5); this.ctx.restore();

    }
  }

  paperBall(x, y, radius = 19, rotation = 0, text = '') {
    const c = this.ctx; c.save(); c.translate(x, y); c.rotate(rotation);
    this.path([[-radius, -radius * 0.21], [-radius * 0.65, -radius * 0.85], [radius * 0.15, -radius], [radius * 0.83, -radius * 0.57], [radius, radius * 0.36], [radius * 0.31, radius], [-radius * 0.73, radius * 0.76]], '#f7ecd4', '#a49c7f', 1.6);
    this.line([[-radius * 0.65, -radius * 0.65], [0, -radius * 0.11], [radius * 0.31, -radius * 0.77]], '#c6b99b', 1.2);
    this.line([[-radius * 0.86, radius * 0.13], [-radius * 0.19, radius * 0.41], [radius * 0.65, 0], [radius * 0.8, radius * 0.44]], '#c6b99b', 1.2);
    if (text) this.label(text, 0, radius + 22, this.fontSize(this.mobile ? 21 : 11, 10), '#6b7154');
    c.restore();
  }

  interactiveMouse(x, y, scale, outfit, id) {
    const reaction = this.mouseReactions.find(item => item.id === id);
    const bounce = reaction && !this.reducedMotion ? Math.sin(clamp(reaction.age / reaction.life) * Math.PI * 4) * 12 : 0;
    if (reaction?.tool === 'disco' && !this.reducedMotion) { this.ctx.save(); this.ctx.translate(x, y - 28); this.ctx.rotate(clamp(reaction.age / reaction.life) * TAU); this.mouse(0, 28 - Math.abs(bounce), scale, outfit, id); this.ctx.restore(); }
    else this.mouse(x, y - Math.abs(bounce), scale, outfit, id);
    if (reaction) { this.ellipse(x, y - 90 * scale, 24, 15, '#e5dfbd', '#a8ae8f', 1); this.label(reaction.tool === 'snacks' ? '咔嚓' : reaction.tool === 'bubbles' ? '啵' : '♪', x, y - 90 * scale + 5, this.fontSize(this.mobile ? 24 : 14, 11), '#5b6d52'); }
  }

  researcherPerson(x, y, scale = 1) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    const rest = this.researcherReaction > 0;
    this.ellipse(0, 1, 39, 8, '#61785c25');
    this.rect(-21, -47, 17, 42, 5, '#7f9690', C.ink, 1.7); this.rect(5, -47, 17, 42, 5, '#7f9690', C.ink, 1.7);
    this.rect(-28, -10, 26, 12, 4, '#48665e', C.ink, 1.5); this.rect(4, -10, 29, 12, 4, '#48665e', C.ink, 1.5);
    this.path([[-29, -111], [-34, -53], [-5, -41], [0, -75], [6, -41], [34, -52], [27, -111], [8, -123], [-9, -123]], '#f0f1e5', '#728d81', 2);
    this.path([[-9, -123], [0, -101], [-14, -87], [-21, -111]], '#d0e0d0', '#728d81', 1);
    this.path([[9, -123], [0, -101], [14, -87], [21, -111]], '#d0e0d0', '#728d81', 1);
    this.rect(13, -72, 13, 12, 2, '#bed2bb', '#8fa78c', 1);
    this.line([[-29, -104], [-47, rest ? -93 : -59]], '#819d8c', 10); this.line([[29, -103], [rest ? 49 : 46, rest ? -103 : -63]], '#819d8c', 10);
    this.ellipse(-47, rest ? -91 : -54, 7, 7, '#d6b591', '#8f927a', 1); this.ellipse(rest ? 49 : 46, rest ? -105 : -58, 7, 7, '#d6b591', '#8f927a', 1);
    this.ellipse(0, -142, 27, 31, '#e2c29d', '#788a71', 2);
    this.path([[-27, -143], [-24, -167], [-7, -178], [13, -174], [27, -157], [22, -142], [17, -158], [-10, -160], [-19, -139]], '#506757', '#455e4a', 1.5);
    this.rect(-23, -149, 20, 15, 5, '#d8e6d633', '#607a68', 1.5); this.rect(3, -149, 20, 15, 5, '#d8e6d633', '#607a68', 1.5); this.line([[-3, -141], [3, -141]], '#607a68', 1.5);
    if (rest) { this.line([[-17, -141], [-12, -138], [-7, -141]], '#516650', 1.3); this.line([[7, -141], [12, -138], [17, -141]], '#516650', 1.3); }
    else { this.ellipse(-12, -141, 2, 2.5, '#486149'); this.ellipse(12, -141, 2, 2.5, '#486149'); }
    this.line([[-7, -124], [0, -120], [7, -124]], '#9b8569', 1.3);
    if (rest) this.document('休息一下', 66, -119, 0.37, 0);
    c.restore();
  }

  humanAvatar(x, y, label, scale = 1) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    this.ellipse(0, 0, 31, 31, '#d4deca', '#8ea17e', 1.5);
    this.ellipse(0, -3, 17, 20, '#ddbc97', '#839174', 1.2);
    this.path([[-17, -5], [-14, -22], [4, -27], [17, -17], [14, -4], [8, -17], [-10, -15]], '#596b50', null);
    this.rect(-13, -7, 11, 9, 3, null, '#647b5d', 1); this.rect(2, -7, 11, 9, 3, null, '#647b5d', 1); this.line([[-2, -3], [2, -3]], '#647b5d', 1);
    this.label(label, 0, 48, this.fontSize(13, 11), '#486549'); c.restore();
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
      const delayedAge = flight.age - (flight.delay || 0);
      if (delayedAge < 0) return;
      const p = clamp(delayedAge / flight.life);
      if (flight.kind === 'burden') {
        const contact = 0.46, forward = clamp(p / contact);
        const x = p < contact ? flight.originX + (flight.toX - flight.originX) * forward : flight.toX + (p - contact) * (flight.originX < 400 ? 190 : -190);
        const y = p < contact ? flight.originY + (flight.toY - flight.originY) * forward - Math.sin(forward * Math.PI) * 65 : flight.toY + (p - contact) * 280;
        c.save(); c.globalAlpha = p < contact ? 1 : clamp((1 - p) * 2);
        const fx = this.reducedMotion ? flight.toX : x, fy = this.reducedMotion ? flight.toY : y;
        if (flight.shape === 'plane') { this.paperPlane(fx, fy, this.mobile ? 1.0 : 0.7, this.reducedMotion ? -0.3 : -0.3 + p * 0.5, '#f2e6cf'); if (p < contact) this.label(flight.text, fx, fy + 35, this.fontSize(this.mobile ? 22 : 11, 10), '#6b7154'); }
        else if (flight.shape === 'bundle') { this.paperBall(fx - 9, fy + 3, this.mobile ? 25 : 18, p * 6); this.paperBall(fx + 13, fy - 8, this.mobile ? 25 : 18, -p * 4, p < contact ? flight.text : ''); }
        else this.paperBall(fx, fy, this.mobile ? 24 : 16, this.reducedMotion ? 0.12 : p * 7, p < contact ? flight.text : '');
        c.restore(); return;
      }
      if (flight.kind === 'sorted' || flight.kind === 'queued') {
        const x = flight.originX + (flight.toX - flight.originX) * p, y = flight.originY + (flight.toY - flight.originY) * p - Math.sin(p * Math.PI) * 45;
        c.save(); c.globalAlpha = 1 - p * 0.85; if (flight.tool === 'gravity' || flight.tool === 'bubbles') { this.rect(x - 35 * (1 - p), y - 14, 70 * (1 - p) + 6, 28, 12, '#edf0dd', '#91a48b', 1.5); this.ellipse(x + 32 * (1 - p), y, 8, 14, '#d3dbc3', '#91a48b', 1); } else this.document(flight.item.text || this.paintFor('lab').equipmentNames[flight.item.id], x, y, (1 - p * 0.6) * (this.mobile ? 1.2 : 1), flight.item.id, p * 0.4); c.restore(); return;
      }
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
      if (effect.kind === 'sort-wrong') {
        this.label(effect.text, x, y - p * 16, this.fontSize(this.mobile ? 25 : 16, 12), '#906f58');
      } else if (effect.kind === 'researcher-rest') {
        this.label('喝口水，放松肩膀。', x, y - p * 16, this.fontSize(this.mobile ? 24 : 13, 12), '#587252');
      } else if (effect.kind === 'paper-contact') {
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8; this.line([[x + Math.cos(a) * 19, y + Math.sin(a) * 19], [x + Math.cos(a) * (38 + p * 25), y + Math.sin(a) * (38 + p * 25)]], '#bfa16f', 2.3); }
        this.label('啪！', x + 65, y + 4, this.fontSize(this.mobile ? 30 : 18, 13), '#877355');
      } else if (effect.kind === 'hammer') {
        c.translate(x + 50, y - 57); c.rotate(this.reducedMotion ? -0.5 : -1.35 + p * 2.05);
        this.rect(-5, -5, 11, 81, 5, '#d7b49a', C.ink, 2); this.rect(-40, -21, 80, 31, 7, '#8eacd0', '#e0edf4', 2); this.line([[-32, -14], [29, -14]], '#d9e2e0', 3);
      } else if (effect.kind === 'handoff') {
        const scale = effect.large ? 2.1 : this.mobile ? 1.35 : 1;
        c.translate(x, y); c.scale(scale, scale); c.rotate(-0.12);
        const incoming = Math.max(0, 1 - p * 5);
        c.translate(0, -incoming * 34);
        this.rect(-48, -26, 96, 52, 5, '#d4adb31b', '#d7b7b4', 3);
        this.rect(-42, -20, 84, 40, 3, null, '#d7b7b4', 1);
        this.label('归 档', 0, 9, 28, '#8c746f');
        if (p > 0.22) this.label('先歇一会儿', 0, 47, 13, '#556b59');
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
        this.label('Z z z', x, y + 7, 25, '#607e80'); this.label('已静音', x, y + 30, 13, '#4c6a60');
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
        this.ellipse(x, y + 12, 50, 16, '#d8e1dd', C.ink, 2); this.ellipse(x - 16, y, 16, 12, C.gold, '#ac749a', 2); this.ellipse(x - 16, y, 6, 4, '#263141', null); this.rect(x + 13, y - 38, 21, 43, 5, '#a7c3cd70', '#b4d1d2', 2); this.line([[x + 21, y - 46], [x + 26, y - 3]], C.pink, 3); this.label('吃点好的', x, y + 50, this.mobile ? 24 : 17, '#546f55');
      } else if (effect.kind === 'disco' || effect.kind === 'festival') {
        const texts = ['今天辛苦了', '一起歇一会儿', '这会儿不忙', '好好下班'];
        this.label(texts[(this.hits - 1 + 4) % 4], x, y - 43 - p * 25, this.mobile ? 29 : 23, '#597547');
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
    const c = this.ctx;
    const face = this.persona === 'teacher' && this.mode === 'earth';
    const g = this.mode === 'earth' ? face ? { x: this.character.faceX, y: this.character.faceY, r: this.character.faceRadius } : this.globe : this.point(this.aim.x, this.aim.y);
    const r = this.mode === 'earth' ? g.r + 21 : 38;
    this.ellipse(g.x, g.y, r, r, null, '#9baf812e', 4);
    c.beginPath(); c.arc(g.x, g.y, r, -Math.PI / 2, -Math.PI / 2 + this.charge * TAU); c.strokeStyle = this.charge > 0.8 ? '#b79b67' : '#7b9b6d'; c.lineWidth = 6; c.stroke();
    if (this.mode === 'earth') this.label(`${Math.round(this.charge * 100)}%`, g.x, face ? g.y - r - 40 : g.y + 9, this.mobile ? 43 : 29, '#45634d');
  }
}
