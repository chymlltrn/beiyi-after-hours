const TAU = Math.PI * 2;
const C = {
  ink: '#151c21', ink2: '#243239', line: '#536167', white: '#e8eedc',
  lime: '#d7fc70', purple: '#b6a2f5', pink: '#ed92b8', blue: '#91cde5',
};

/** An entirely local, responsive miniature universe. Input belongs to the app. */
export class Universe {
  constructor(canvas, { onHit, onComplete, reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onComplete = onComplete;
    this.reducedMotion = reducedMotion;
    this.mode = 'lab';
    this.time = 0;
    this.lastTime = 0;
    this.raf = 0;
    this.paused = false;
    this.disposed = false;
    this.particles = [];
    this.rings = [];
    this.damage = 0;
    this.kick = 0;
    this.launch = 0;
    this.bursting = false;
    this.burstTime = 0;
    this.phrase = 0;
    this.stars = Array.from({ length: 66 }, (_, i) => ({
      x: (Math.sin(i * 113.7 + 3) * 0.5 + 0.5) * 720,
      y: (Math.sin(i * 217.3 + 9) * 0.5 + 0.5) * 430,
      r: i % 9 === 0 ? 1.65 : 0.7,
      phase: i * 1.8,
    }));
    this.tick = this.tick.bind(this);
    this.resize = this.resize.bind(this);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    this.resize();
    this.wake();
  }

  resize() {
    if (this.disposed) return;
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, box.width);
    this.height = Math.max(1, box.height);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.dpr = dpr;
    this.draw();
  }

  setMode(mode) {
    if (!['lab', 'mentor', 'earth', 'mice'].includes(mode)) return;
    this.mode = mode;
    this.reset();
  }

  hit(xNormalized = 0.5, yNormalized = 0.5) {
    if (this.disposed || this.paused || this.bursting) return;
    const x = Math.max(0, Math.min(1, xNormalized)) * 720;
    const y = Math.max(0, Math.min(1, yNormalized)) * 430;
    this.damage = Math.min(this.damage + 1, 7);
    this.kick = this.reducedMotion ? 0 : 1;
    this.phrase = (this.phrase + 1) % 4;
    this.emit(x, y, this.reducedMotion ? 8 : 23);
    this.rings.push({ x, y, age: 0, max: this.reducedMotion ? 0.3 : 0.65 });
    if (this.mode === 'earth') this.emit(538, 160, 12, 'earth');
    if (this.mode === 'mentor') this.emit(383, 201, 12, 'paper');
    if (this.mode === 'mice') this.emit(355, 245, 18, 'confetti');
    this.wake();
  }

  burst() {
    if (this.disposed || this.paused || this.bursting) return;
    this.bursting = true;
    this.burstTime = 0;
    this.kick = this.reducedMotion ? 0 : 2.5;
    const center = this.mode === 'earth' ? { x: 537, y: 162 } : { x: 365, y: 244 };
    const type = this.mode === 'earth' ? 'earth' : this.mode === 'mentor' ? 'paper' : 'confetti';
    this.emit(center.x, center.y, this.reducedMotion ? 20 : 125, type, true);
    this.rings.push({ ...center, age: 0, max: this.reducedMotion ? 0.3 : 1.4 });
    this.wake();
  }

  reset() {
    this.particles.length = 0;
    this.rings.length = 0;
    this.damage = 0;
    this.kick = 0;
    this.launch = 0;
    this.bursting = false;
    this.burstTime = 0;
    this.phrase = 0;
    this.draw();
    this.wake();
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    if (this.paused) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.lastTime = 0;
    } else this.wake();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.particles.length = 0;
    this.rings.length = 0;
  }

  wake() {
    if (!this.raf && !this.paused && !this.disposed) {
      this.lastTime = 0;
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  tick(now) {
    this.raf = 0;
    if (this.paused || this.disposed) return;
    // RAF timestamps can restart when a testing clock or renderer changes its origin.
    // Keep effect ages monotonic, while limiting physics steps after a long frame.
    const elapsed = this.lastTime && Number.isFinite(now)
      ? Math.max(0, (now - this.lastTime) / 1000)
      : 1 / 60;
    const dt = Math.min(elapsed, 0.04);
    this.lastTime = Number.isFinite(now) ? now : 0;
    this.time += dt;
    this.kick *= Math.exp(-dt * 6);
    this.particles = this.particles.filter(p => {
      p.age += elapsed;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (this.reducedMotion ? 0 : 95) * dt;
      p.rotation += p.spin * dt;
      return p.age < p.life;
    });
    this.rings = this.rings.filter(r => { r.age += elapsed; return r.age < r.max; });
    if (this.bursting) {
      this.burstTime += elapsed;
      if (this.mode === 'lab' && !this.reducedMotion) this.launch = Math.pow(Math.max(0, this.burstTime - 0.18), 2) * 135;
      if (this.burstTime > (this.reducedMotion ? 0.45 : 2.3)) {
        this.bursting = false;
        this.launch = 0;
        this.damage = 0;
        this.onComplete?.();
      }
    }
    this.draw();
    if (!this.reducedMotion || this.particles.length || this.rings.length || this.bursting) {
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  emit(x, y, count, type = 'spark', big = false) {
    const colors = [C.lime, C.purple, C.pink, C.blue, C.white];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = this.reducedMotion ? 10 : (big ? 85 : 35) + Math.random() * (big ? 230 : 115);
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (big ? 45 : 15),
        rotation: angle, spin: this.reducedMotion ? 0 : (Math.random() - 0.5) * 6,
        age: 0, life: this.reducedMotion ? 0.35 : 0.6 + Math.random() * (big ? 1.9 : 0.6),
        size: type === 'earth' ? 5 + Math.random() * 12 : 2 + Math.random() * (big ? 6 : 3),
        color: type === 'earth' ? [C.lime, C.blue, '#5f8599'][i % 3] : colors[i % colors.length], type,
      });
    }
  }

  path(points, fill, stroke = C.ink, width = 2) {
    const c = this.ctx;
    c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }

  line(points, color = C.line, width = 2) {
    const c = this.ctx;
    c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }

  ellipse(x, y, rx, ry, fill, stroke, width = 2, rotation = 0) {
    if (![x, y, rx, ry, rotation].every(Number.isFinite)) return;
    const c = this.ctx;
    c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rotation, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }

  rect(x, y, w, h, radius, fill, stroke = C.ink, width = 2) {
    const c = this.ctx;
    c.beginPath(); c.roundRect(x, y, w, h, radius);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }

  glow(x, y, radius, color) {
    const c = this.ctx;
    const g = c.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  label(text, x, y, size, color = C.white, align = 'left') {
    const c = this.ctx;
    c.font = `${size < 12 ? '500' : '600'} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    c.fillStyle = color; c.textAlign = align; c.fillText(text, x, y);
  }

  draw() {
    if (!this.ctx || !this.width || this.disposed) return;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.save();
    c.scale(this.width / 720, this.height / 430);
    c.lineCap = 'round'; c.lineJoin = 'round';
    this.background();
    this.planet();
    this.rocket();
    if (this.mode === 'earth') {
      this.earth(528, 158, 108);
    } else {
      this.earth(598, 111, 48);
    }
    c.save();
    const sway = this.reducedMotion ? 0 : Math.sin(this.time * 1.2) * 2.4;
    const kick = this.reducedMotion ? 0 : Math.sin(this.time * 49) * this.kick * 5;
    c.translate(kick, sway - this.launch);
    this.platform();
    this.shelf();
    this.monitor();
    this.microscope();
    this.testTubes();
    this.mouse(189, 263, 1, false);
    this.notes();
    if (this.mode === 'mice') {
      this.mouse(328, 282, 0.63, true);
      this.mouse(421, 293, 0.62, true);
      this.mouse(557, 275, 0.65, true);
      this.disco();
    }
    if (this.launch > 8) {
      this.glow(385, 356, 87, '#d7fc7050');
      this.path([[230, 334], [250, 384 + this.launch * 0.45], [279, 331]], C.lime, null);
      this.path([[480, 331], [504, 389 + this.launch * 0.4], [529, 330]], C.purple, null);
    }
    c.restore();
    this.effects();
    this.foreground();
    c.restore();
  }

  background() {
    const c = this.ctx;
    this.glow(343, 246, 248, '#b6a2f511');
    this.glow(575, 127, 178, '#d7fc700a');
    this.stars.forEach(s => {
      c.globalAlpha = this.reducedMotion ? 0.45 : 0.26 + (Math.sin(this.time * 0.6 + s.phase) + 1) * 0.18;
      this.ellipse(s.x, s.y, s.r, s.r, C.white);
    });
    c.globalAlpha = 1;
    c.save();
    c.setLineDash([2, 7]);
    this.ellipse(370, 225, 292, 117, null, '#5b656831', 1, -0.11);
    c.restore();
    this.line([[673, 177], [673, 189]], '#8f9b9160', 1);
    this.line([[667, 183], [679, 183]], '#8f9b9160', 1);
    this.line([[76, 161], [76, 169]], '#b6a2f580', 1);
    this.line([[72, 165], [80, 165]], '#b6a2f580', 1);
    this.ellipse(685, 33, 3, 3, C.lime);
  }

  planet() {
    const c = this.ctx;
    c.save(); c.translate(115, 104);
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 0.7) * 3;
    c.translate(0, bob); c.rotate(-0.28);
    this.glow(0, 0, 80, '#b6a2f51f');
    this.ellipse(0, 0, 59, 15, null, '#b6a2f555', 5);
    const g = c.createLinearGradient(-28, -24, 24, 25);
    g.addColorStop(0, '#c3b1fb'); g.addColorStop(1, '#6c6592');
    this.ellipse(0, 0, 31, 31, g, '#c0b2ed90', 1);
    c.save(); c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.clip();
    this.ellipse(-8, -13, 39, 7, null, '#e1d2ff32', 5);
    this.ellipse(6, 10, 37, 6, null, '#3a365630', 5);
    c.restore();
    c.beginPath(); c.ellipse(0, 0, 59, 15, 0, 0, Math.PI);
    c.strokeStyle = '#c6b5fa'; c.lineWidth = 5; c.stroke();
    this.ellipse(-16, -16, 5, 3, '#e9ddfb35');
    c.restore();
  }

  earth(x, y, r) {
    const c = this.ctx;
    if (this.mode === 'earth' && this.bursting && this.burstTime > 0.15) {
      this.glow(x, y, r * 1.7, '#d7fc7020');
      this.ellipse(x, y, r * 1.13, r * 1.13, null, '#d7fc7040', 1);
      return;
    }
    c.save(); c.translate(x, y);
    this.glow(0, 0, r * 1.5, '#91cde51c');
    const g = c.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#9abac3'); g.addColorStop(0.45, '#5b8e9f'); g.addColorStop(1, '#284c5f');
    this.ellipse(0, 0, r, r, g, '#98b7bd90', 1.5);
    c.save(); c.beginPath(); c.arc(0, 0, r - 1, 0, TAU); c.clip(); c.scale(r / 48, r / 48);
    this.path([[-39, -20], [-26, -35], [-9, -34], [-3, -24], [-12, -13], [-17, -14], [-18, -2], [-26, 2], [-36, -8]], '#b6ce82', null);
    this.path([[-18, 1], [-6, 5], [0, 17], [-8, 38], [-16, 30], [-18, 16], [-24, 8]], '#aac478', null);
    this.path([[7, -32], [28, -32], [46, -15], [33, -10], [28, -1], [17, -4], [10, -15], [1, -15]], '#c4d38e', null);
    this.path([[15, -7], [26, -1], [24, 13], [15, 23], [8, 12], [7, 1]], '#a8c17e', null);
    this.path([[33, 24], [45, 28], [42, 37], [31, 34]], '#c4d38e', null);
    this.ellipse(-5, -12, 44, 8, null, '#e8eedc22', 2, -0.24);
    this.ellipse(4, 17, 41, 5, null, '#e8eedc24', 3, -0.17);
    const shadow = c.createLinearGradient(-40, -38, 45, 30);
    shadow.addColorStop(0, 'transparent'); shadow.addColorStop(0.55, '#10202600'); shadow.addColorStop(1, '#102026bb');
    this.ellipse(0, 0, 48, 48, shadow);
    c.restore();
    if (this.mode === 'earth' && this.damage) {
      c.save(); c.scale(r / 48, r / 48);
      this.line([[-10, -44], [-4, -24], [-15, -8], [-1, 5], [-9, 23], [0, 47]], C.lime, 1.4);
      if (this.damage > 2) this.line([[-1, 5], [14, 0], [23, 13], [46, 17]], C.lime, 1.2);
      if (this.damage > 4) this.line([[-15, -8], [-35, -6], [-42, 8]], C.lime, 1.2);
      c.restore();
    }
    c.restore();
  }

  rocket() {
    const c = this.ctx;
    c.save(); c.translate(637, 49); c.rotate(0.58);
    this.path([[-10, 9], [-18, 21], [-11, 25], [-5, 15]], C.purple);
    this.path([[10, 9], [18, 21], [11, 25], [5, 15]], C.purple);
    c.beginPath(); c.moveTo(-10, 17); c.quadraticCurveTo(-14, -4, 0, -20); c.quadraticCurveTo(14, -4, 10, 17); c.closePath();
    c.fillStyle = C.white; c.fill(); c.strokeStyle = C.ink; c.lineWidth = 2; c.stroke();
    this.ellipse(0, -2, 5.5, 5.5, '#729bab', C.ink, 1.5);
    this.ellipse(-1.5, -3.5, 1.6, 1.6, '#dceef6');
    this.path([[-5, 20], [0, 33 + (this.reducedMotion ? 0 : Math.sin(this.time * 8) * 4)], [5, 20]], C.lime, null);
    c.restore();
  }

  platform() {
    const c = this.ctx;
    this.ellipse(376, 370, 235, 27, '#00000025');
    this.glow(363, 340, 177, '#b6a2f513');
    this.path([[89, 264], [579, 244], [657, 307], [177, 329]], '#35434a', '#6c797b', 1.5);
    this.path([[89, 264], [177, 329], [177, 348], [88, 282]], '#27323a', '#5f6a70', 1.5);
    this.path([[177, 329], [657, 307], [655, 326], [177, 348]], '#1d2930', '#5f6a70', 1.5);
    this.line([[182, 342], [651, 319]], '#b6a2f577', 2);
    this.path([[201, 348], [222, 349], [216, 362]], '#b6a2f5');
    this.path([[589, 329], [609, 328], [603, 342]], '#b6a2f5');
    c.save(); c.globalAlpha = 0.18;
    for (let i = 0; i < 6; i++) this.line([[113 + i * 88, 263 - i * 3], [198 + i * 86, 327 - i * 4]], '#a3b6ba', 1);
    for (let i = 0; i < 3; i++) this.line([[112 + i * 24, 279 + i * 19], [602 + i * 23, 259 + i * 19]], '#a3b6ba', 1);
    c.restore();
  }

  shelf() {
    const c = this.ctx;
    c.save(); c.translate(515, 184);
    if (this.mode === 'lab') c.rotate(Math.sin(this.time * 12) * this.kick * 0.055);
    this.path([[-36, -41], [32, -44], [32, 79], [-36, 82]], '#29383e', '#627178', 2);
    this.path([[32, -44], [45, -34], [45, 89], [32, 79]], '#1b272d', '#4e6067', 1.5);
    this.line([[-34, -3], [32, -6]], '#72848a', 3);
    this.line([[-34, 39], [32, 36]], '#72848a', 3);
    this.line([[-34, 80], [32, 77]], '#72848a', 3);
    this.rect(-25, -35, 9, 29, 1, C.purple, C.ink, 1);
    this.rect(-13, -30, 8, 24, 1, '#b7c3bb', C.ink, 1);
    this.rect(-2, -34, 10, 28, 1, C.lime, C.ink, 1);
    c.save(); c.translate(17, -8); c.rotate(-0.22);
    this.rect(0, -22, 8, 22, 1, C.pink, C.ink, 1); c.restore();
    this.rect(-25, 12, 21, 24, 4, '#b4c6c1', C.ink, 1.5);
    this.rect(-21, 7, 13, 6, 2, C.white, C.ink, 1);
    this.rect(-20, 18, 12, 9, 1, C.lime, null);
    this.rect(7, 12, 17, 24, 3, '#90b5c4', C.ink, 1.5);
    this.rect(10, 8, 11, 6, 2, C.purple, C.ink, 1);
    this.rect(-23, 52, 23, 22, 2, '#6f817e', C.ink, 1);
    this.line([[-19, 61], [-4, 61]], C.white, 1);
    this.rect(5, 51, 18, 24, 2, '#8a87a6', C.ink, 1);
    this.label('01', 9, 66, 8, C.white);
    c.restore();
  }

  monitor() {
    const c = this.ctx;
    c.save(); c.translate(366, 223);
    if (this.mode === 'lab') c.rotate(Math.sin(this.time * 15) * this.kick * 0.035);
    this.path([[-78, 20], [68, 14], [102, 41], [-43, 47]], '#77908d');
    this.path([[-78, 20], [-43, 47], [-43, 54], [-78, 27]], '#344c52');
    this.path([[-43, 47], [102, 41], [102, 48], [-43, 54]], '#3d5558');
    this.line([[-56, 37], [-55, 83]], '#8da8a3', 5);
    this.line([[82, 48], [83, 90]], '#687e80', 5);
    this.rect(-5, -12, 13, 25, 2, '#627b7e');
    this.ellipse(1, 15, 26, 6, '#677f7b', C.ink, 1.5);
    this.rect(-63, -88, 126, 83, 8, '#60777b', '#b0c4bd', 2);
    this.rect(-56, -81, 112, 66, 4, '#192b2d', C.ink, 1.5);
    this.ellipse(0, -10, 1.4, 1.4, C.lime);
    this.line([[-48, -70], [-32, -70]], '#65796d', 2);
    this.line([[-27, -70], [-19, -70]], '#65796d', 2);
    if (this.mode === 'mentor') {
      this.label('导师弹窗.exe', 0, -57, 9, C.purple, 'center');
      const phrases = ['这个结果再跑一遍', '毕业就在下一版', '周末顺便来一下', '这次真的最后一版'];
      this.label(this.bursting ? '已开启免打扰' : phrases[this.phrase], 0, -38, 11, this.bursting ? C.lime : C.white, 'center');
      this.rect(-23, -30, 46, 9, 3, this.bursting ? '#d7fc7030' : '#b6a2f526', null);
      this.label(this.bursting ? '已读 · 下班' : '点击送去太空', 0, -23, 6.5, C.lime, 'center');
    } else {
      this.line([[-44, -29], [-31, -29], [-25, -46], [-18, -26], [-11, -32], [-3, -27], [5, -52], [12, -35], [25, -35], [31, -44], [44, -43]], C.lime, 2);
      this.label(this.mode === 'mice' ? 'PARTY > PCR' : 'P > 0.05', -43, -54, 9, C.purple);
      this.label(this.mode === 'mice' ? '鼠鼠今晚不加班' : '又是美好的一天', 44, -19, 6.5, '#829b8b', 'right');
    }
    this.path([[-29, 27], [25, 25], [43, 34], [-12, 37]], '#a8b8b0', C.ink, 1);
    for (let i = 0; i < 5; i++) this.line([[-18 + i * 9, 29], [-12 + i * 9, 33]], '#4d6262', 1);
    this.ellipse(66, 32, 8, 4, C.purple, C.ink, 1.3);
    c.restore();
  }

  microscope() {
    const c = this.ctx;
    c.save(); c.translate(268, 277);
    if (this.mode === 'lab') c.rotate(Math.sin(this.time * 14 + 1) * this.kick * 0.09);
    this.ellipse(0, 13, 29, 10, '#101a2077');
    this.rect(-24, 1, 48, 12, 6, '#b5c5be', C.ink, 2);
    c.beginPath(); c.moveTo(5, 3); c.bezierCurveTo(29, -16, 23, -55, 3, -63); c.lineTo(-3, -51); c.bezierCurveTo(10, -41, 11, -17, -2, 2); c.closePath();
    c.fillStyle = '#a8bfb5'; c.fill(); c.strokeStyle = C.ink; c.lineWidth = 2.5; c.stroke();
    c.save(); c.translate(-7, -63); c.rotate(-0.42);
    this.rect(-10, -11, 17, 40, 4, '#d6e0d1', C.ink, 2);
    this.rect(-10, -17, 17, 8, 2, C.purple, C.ink, 2);
    this.rect(-6, 27, 10, 8, 2, '#536e75', C.ink, 1.5); c.restore();
    this.rect(-19, -17, 32, 6, 2, '#5b7c7d', C.ink, 2);
    this.rect(-9, -19, 14, 2, 1, C.blue, null);
    this.ellipse(14, -30, 7, 7, C.purple, C.ink, 2);
    this.ellipse(14, -30, 2, 2, C.white);
    c.restore();
  }

  testTubes() {
    const c = this.ctx;
    c.save(); c.translate(490, 289);
    if (this.mode === 'lab') c.rotate(Math.sin(this.time * 13 + 3) * this.kick * 0.06);
    this.ellipse(0, 11, 40, 9, '#101a2055');
    this.path([[-37, -10], [25, -14], [41, -2], [-21, 2]], '#78969a', C.ink, 2);
    this.line([[-29, -5], [-28, 13]], '#88a5a7', 3);
    this.line([[31, -5], [32, 9]], '#88a5a7', 3);
    this.path([[-28, 9], [33, 5], [38, 10], [-23, 14]], '#6c898f', C.ink, 1.5);
    [C.purple, C.lime, C.pink, C.blue].forEach((color, i) => {
      const x = -23 + i * 15;
      this.rect(x - 4, -44 - (i % 2) * 7, 8, 38 + (i % 2) * 7, 4, '#91cde526', '#b7d3d2', 1.5);
      this.rect(x - 2.7, -27, 5.4, 19, 3, color, null);
      this.rect(x - 5.5, -47 - (i % 2) * 7, 11, 5, 1.5, color, C.ink, 1.3);
      this.line([[x - 1.5, -37], [x - 1.5, -31]], '#f2fbef75', 1);
    });
    c.restore();
  }

  mouse(x, y, scale, party) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.scale(scale, scale);
    const dance = party && !this.reducedMotion ? Math.sin(this.time * 7 + x) : 0;
    c.translate(0, -Math.abs(dance) * 9); c.rotate(dance * 0.1);
    this.ellipse(0, 37, 42, 12, '#0e181a70');
    c.beginPath(); c.moveTo(25, 12); c.bezierCurveTo(77, 27, 51, 53, 34, 46);
    c.strokeStyle = '#c7b2ad'; c.lineWidth = 5; c.stroke();
    this.ellipse(-20, 36, 16, 8, '#b5c3be', C.ink, 2);
    this.ellipse(20, 36, 16, 8, '#b5c3be', C.ink, 2);
    this.path([[-30, -1], [-22, 32], [22, 33], [30, -1], [8, -13], [-8, -13]], party ? C.purple : '#dbe4d7', C.ink, 2.5);
    this.path([[-9, -9], [0, 2], [-8, 15], [-18, -9]], '#a1b7b0', C.ink, 1);
    this.path([[9, -9], [0, 2], [8, 15], [18, -9]], '#a1b7b0', C.ink, 1);
    this.line([[0, 4], [0, 31]], '#718a84', 1.5);
    this.ellipse(7, 14, 1.5, 1.5, C.ink2);
    this.ellipse(7, 24, 1.5, 1.5, C.ink2);
    this.rect(13, 12, 10, 9, 1, '#a6bbb0', null);
    this.line([[16, 9], [16, 17]], C.purple, 2);
    c.save(); c.translate(-27, -2); c.rotate(party ? -0.6 - dance * 0.5 : -0.13);
    this.rect(-9, 0, 15, 29, 7, party ? C.purple : '#dbe4d7', C.ink, 2);
    this.ellipse(-1, 28, 7, 6, '#d6d4c4', C.ink, 1.5); c.restore();
    c.save(); c.translate(26, -2); c.rotate(party ? 0.65 + dance * 0.5 : -0.6);
    this.rect(-6, 0, 15, 27, 7, party ? C.purple : '#dbe4d7', C.ink, 2);
    this.ellipse(2, 28, 7, 6, '#d6d4c4', C.ink, 1.5);
    if (!party) {
      this.rect(-1, 23, 6, 19, 3, '#a4c2be', C.ink, 1);
      this.rect(-1, 31, 6, 11, 3, C.lime, null);
      this.rect(-2, 21, 8, 4, 1, C.purple, C.ink, 1);
    }
    c.restore();
    this.ellipse(-29, -53, 21, 23, '#d8dfcf', C.ink, 2.5, -0.22);
    this.ellipse(29, -53, 21, 23, '#d8dfcf', C.ink, 2.5, 0.22);
    this.ellipse(-29, -53, 13, 15, '#c6a7b5', null, 2, -0.22);
    this.ellipse(29, -53, 13, 15, '#c6a7b5', null, 2, 0.22);
    const head = c.createLinearGradient(-30, -60, 35, -1);
    head.addColorStop(0, '#edf0dd'); head.addColorStop(1, '#b6c7bb');
    this.ellipse(0, -31, 40, 35, head, C.ink, 2.5);
    this.ellipse(-25, -20, 8, 4, '#d49bad55');
    this.ellipse(25, -20, 8, 4, '#d49bad55');
    this.line([[-39, -38], [39, -38]], '#5c7278', 5);
    this.rect(-31, -44, 27, 21, 8, '#b6a2f522', '#536775', 3);
    this.rect(4, -44, 27, 21, 8, '#b6a2f522', '#536775', 3);
    this.line([[-4, -36], [4, -36]], '#536775', 3);
    this.line([[-24, -40], [-15, -40]], '#f8fced80', 2);
    this.line([[10, -40], [19, -40]], '#f8fced80', 2);
    if (party) {
      this.line([[-22, -33], [-18, -36], [-13, -33]], C.ink, 2);
      this.line([[13, -33], [18, -36], [22, -33]], C.ink, 2);
    } else {
      this.ellipse(-18, -33, 3.4, 4.1, C.ink);
      this.ellipse(18, -33, 3.4, 4.1, C.ink);
      this.ellipse(-17, -34, 1, 1, C.white);
      this.ellipse(19, -34, 1, 1, C.white);
    }
    this.ellipse(0, -18, 5, 3.3, '#b97f98', C.ink, 1);
    this.line([[0, -15], [0, -11], [-5, -8]], C.ink, 1.2);
    this.line([[0, -11], [5, -8]], C.ink, 1.2);
    this.line([[-26, -14], [-45, -18]], '#62736d', 1.1);
    this.line([[-26, -10], [-43, -7]], '#62736d', 1.1);
    this.line([[26, -14], [45, -18]], '#62736d', 1.1);
    this.line([[26, -10], [43, -7]], '#62736d', 1.1);
    if (party) {
      this.path([[-15, -62], [0, -89], [15, -62]], C.lime, C.ink, 1.5);
      this.ellipse(0, -90, 4, 4, C.pink);
    }
    c.restore();
  }

  notes() {
    const c = this.ctx;
    c.save(); c.translate(569, 300); c.rotate(0.15);
    this.rect(-20, -5, 35, 18, 2, '#c5ceb7', C.ink, 1);
    this.line([[-14, 1], [7, 1]], '#5a6c5d', 1);
    this.line([[-14, 5], [1, 5]], '#5a6c5d', 1); c.restore();
    this.path([[214, 310], [242, 310], [253, 318], [225, 318]], C.pink, C.ink, 1);
    this.line([[220, 313], [237, 313]], '#78485e', 1);
    this.ellipse(586, 270, 12, 4, C.purple, C.ink, 1.5);
    this.rect(574, 253, 24, 17, 3, '#b3c2b5', C.ink, 1.5);
    this.ellipse(586, 253, 12, 4, '#74877b', C.ink, 1.5);
    this.ellipse(586, 254, 8, 2, '#232f29');
    this.ellipse(602, 261, 5, 5, null, '#b3c2b5', 3);
    this.line([[583, 241], [580, 234], [585, 227]], '#e4eacf40', 1.5);
    this.line([[590, 242], [592, 233]], '#e4eacf30', 1.5);
  }

  disco() {
    const c = this.ctx;
    const flash = this.reducedMotion ? 0.12 : 0.1 + Math.sin(this.time * 3) * 0.04;
    c.save(); c.globalAlpha = flash;
    this.path([[353, 56], [183, 307], [270, 313]], C.lime, null);
    this.path([[353, 56], [442, 316], [566, 288]], C.pink, null);
    c.restore();
    this.line([[353, 19], [353, 58]], '#707e79', 1);
    this.ellipse(353, 66, 18, 18, C.purple, '#d9cefd', 1.5);
    this.line([[336, 64], [370, 64]], '#817497', 1);
    this.line([[340, 73], [367, 73]], '#817497', 1);
    this.line([[346, 50], [346, 81]], '#817497', 1);
    this.line([[358, 49], [358, 83]], '#817497', 1);
    this.ellipse(343, 59, 2, 2, C.white);
  }

  effects() {
    const c = this.ctx;
    this.rings.forEach(r => {
      const p = Math.max(0, Math.min(1, r.age / r.max));
      c.globalAlpha = (1 - p) * 0.7;
      this.ellipse(r.x, r.y, 8 + p * 125, 8 + p * 125, null, C.lime, 2 - p);
    });
    c.globalAlpha = 1;
    this.particles.forEach(p => {
      c.save(); c.translate(p.x, p.y); c.rotate(p.rotation);
      c.globalAlpha = Math.min(1, (p.life - p.age) * 2);
      if (p.type === 'paper') {
        this.rect(-p.size, -p.size * 0.65, p.size * 2, p.size * 1.3, 1, p.color, null);
        this.line([[-p.size * 0.5, 0], [p.size * 0.5, 0]], '#26383b', 1);
      } else if (p.type === 'earth') {
        this.path([[-p.size, -p.size * 0.3], [0, -p.size], [p.size, 0], [p.size * 0.2, p.size * 0.8]], p.color, '#152126', 1);
      } else if (p.type === 'confetti') {
        this.rect(-p.size * 0.5, -p.size, p.size, p.size * 2, 1, p.color, null);
      } else {
        this.ellipse(0, 0, p.size, p.size, p.color);
      }
      c.restore();
    });
    c.globalAlpha = 1;
  }

  foreground() {
    const c = this.ctx;
    c.save(); c.globalAlpha = 0.65;
    this.ellipse(66, 350, 9, 9, null, '#b6a2f580', 1);
    this.line([[62, 350], [70, 350]], C.purple, 1);
    this.line([[66, 346], [66, 354]], C.purple, 1);
    c.restore();
  }
}
