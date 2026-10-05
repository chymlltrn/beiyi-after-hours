import { Universe } from './assets/universe.js';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const modes = {
  lab: { name: '实验室大拆迁', number: '01', caption: '点击任意位置 · 给压力一点颜色', hits: ['移液枪：今天不加班。', '离心机已申请原地起飞。', 'PCR 仪开始反向扩增快乐。', '实验台：我先裂为敬。'], title: '实验室已飞出太阳系。', message: '实验记录没丢，小鼠已经度假。\n现在，世界安静了。你可以休息一下。' },
  mentor: { name: '导师语录粉碎机', number: '02', caption: '点击全息屏 · 把「再补一组」送走', hits: ['「很简单」已经不简单地消失了。', '「再补一组」：已进入黑洞。', '「周末有空吗」：信号已中断。', '「投个顶刊」：先投进碎纸机。'], title: '导师语录已进入黑洞。', message: '「再补一组」已被宇宙自动拒收。\n这一分钟，你的时间只属于你。' },
  earth: { name: '地球重启计划', number: '03', caption: '点击星球 · 宇宙替你消化坏心情', hits: ['组会所在的经线正在松动。', 'DDL 已经失去引力。', 'Reviewer 2 正在漂流。', '地球缓存已清理 99%。'], title: '地球重启成功。', message: '新地球没有凌晨的组会，没有无限的返修。\n有好好睡觉的你，还有快乐的鼠鼠。' },
  mice: { name: '小鼠罢工派对', number: '04', caption: '点击鼠鼠 · 今天只扩增快乐', hits: ['鼠鼠宣布：取消今天的实验。', '小鼠一号正在跳脱敏舞。', '动物房已经变成舞池。', '科研搭子已为你批准带薪休假。'], title: '鼠鼠宣布：全员下班！', message: '小鼠们开了一场没有对照组的派对。\n快乐不需要统计学显著。你也来吧。' },
};

let mode = 'lab';
let pressure = 0;
let releases = 0;
let phase = 'ready';
let soundEnabled = false;
let audioContext;
let toastTimer;
let completionTimer;
let breathingTimer;
let breathingRunning = false;
let breathingStartedAt = 0;
let breathingPausedAt = 0;
let breathingPausedDuration = 0;
let shredTimer;
let shredding = false;
const universe = new Universe($('#universe'), { reducedMotion: reducedMotion.matches });

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2800);
}

function tone(type = 'hit') {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { soundEnabled = false; updateSound(); return; }
    audioContext ??= new Audio();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type === 'hit' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(type === 'burst' ? 220 : type === 'shred' ? 650 : 360, now);
    oscillator.frequency.exponentialRampToValueAtTime(type === 'burst' ? 45 : 120, now + .22);
    gain.gain.setValueAtTime(.065, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .28);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(now + .3);
  } catch { soundEnabled = false; updateSound(); }
}

function updateSound() {
  const button = $('#sound-toggle');
  button.setAttribute('aria-pressed', String(soundEnabled));
  button.setAttribute('aria-label', soundEnabled ? '关闭音效' : '开启音效');
  button.title = soundEnabled ? '关闭音效' : '开启音效';
  button.querySelector('use').setAttribute('href', soundEnabled ? '#i-sound' : '#i-mute');
}

function updatePressure() {
  $('#pressure-value').textContent = `${pressure}%`;
  $('#pressure-fill').style.width = `${pressure}%`;
  $('#total-release').textContent = String(releases).padStart(2, '0');
}

function reset({ announce = true } = {}) {
  clearTimeout(completionTimer);
  if ($('#completion-dialog').open) $('#completion-dialog').close();
  phase = 'ready'; pressure = 0;
  universe.reset();
  $('#scene-caption').textContent = modes[mode].caption;
  $('#hit-button').disabled = false;
  $('#destroy-button').disabled = false;
  updatePressure();
  if (announce) toast('宇宙已恢复。你可以无限重来。');
}

function setMode(next, { scroll = true } = {}) {
  if (!(next in modes)) return;
  mode = next;
  reset({ announce: false });
  universe.setMode(mode);
  $('#scene-name').textContent = modes[mode].name;
  $('.scene-coordinate').textContent = `PKUHSC · SECTOR ${modes[mode].number}`;
  $('#scene-caption').textContent = modes[mode].caption;
  $('#universe').setAttribute('aria-label', `${modes[mode].name}，点击或按空格释放压力`);
  document.querySelectorAll('[data-mode]').forEach(card => {
    const active = card.dataset.mode === mode;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', String(active));
    card.querySelector('.mode-indicator').textContent = active ? '正在体验 ↗' : '进入 ↗';
  });
  if (scroll) {
    $('#universe-panel').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center' });
    $('#universe').focus({ preventScroll: true });
    toast(`已进入「${modes[mode].name}」，点击画面就能玩。`);
  }
}

function hit(x = .5, y = .5) {
  if (phase !== 'ready') return;
  releases += 1;
  pressure = Math.min(100, pressure + 10);
  universe.hit(x, y);
  tone('hit');
  const messages = modes[mode].hits;
  $('#scene-caption').textContent = messages[(releases - 1) % messages.length];
  updatePressure();
  if (pressure === 100) destroy({ automatic: true });
}

function destroy({ automatic = false } = {}) {
  if (phase !== 'ready') return;
  phase = 'burst';
  if (!automatic) releases += 1;
  pressure = 100;
  updatePressure();
  universe.burst();
  tone('burst');
  $('#hit-button').disabled = true;
  $('#destroy-button').disabled = true;
  $('#scene-caption').textContent = '正在把坏心情发射出太阳系……';
  completionTimer = setTimeout(() => {
    phase = 'complete';
    $('#completion-title').textContent = modes[mode].title;
    const message = $('#completion-message');
    message.replaceChildren();
    modes[mode].message.split('\n').forEach((line, index) => {
      if (index) message.append(document.createElement('br'));
      message.append(document.createTextNode(line));
    });
    $('#scene-caption').textContent = '已清空坏心情 · 点击恢复按钮，再来一局';
    $('#completion-dialog').showModal();
  }, reducedMotion.matches ? 300 : 1650);
}

$('#universe').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const rect = event.currentTarget.getBoundingClientRect();
  hit((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
});
$('#universe').addEventListener('keydown', event => {
  if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); hit(); }
});
$('#hit-button').addEventListener('click', () => hit(.3 + Math.random() * .4, .3 + Math.random() * .4));
$('#destroy-button').addEventListener('click', () => destroy());
$('#reset-button').addEventListener('click', () => reset());
$('#start-button').addEventListener('click', () => { setMode('lab'); setTimeout(() => hit(.5, .55), reducedMotion.matches ? 0 : 350); });
document.querySelectorAll('[data-mode]').forEach(card => card.addEventListener('click', () => setMode(card.dataset.mode)));
$('#sound-toggle').addEventListener('click', () => { soundEnabled = !soundEnabled; updateSound(); tone('hit'); toast(soundEnabled ? '音效已开启。快乐调到合适的音量。' : '音效已关闭，安静地发疯也很好。'); });
$('#again-button').addEventListener('click', () => { reset({ announce: false }); $('#universe').focus({ preventScroll: true }); });
$('#dialog-close').addEventListener('click', () => $('#completion-dialog').close());
$('#completion-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close(); } });
$('#rest-button').addEventListener('click', () => { $('#completion-dialog').close(); $('#rest').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' }); $('#breathing-button').focus({ preventScroll: true }); });

$('#vent-input').addEventListener('input', event => { $('#character-count').textContent = `${event.target.value.length} / 240`; });
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  if (shredding) return;
  $('#vent-input').value = button.dataset.prompt;
  $('#vent-input').dispatchEvent(new Event('input'));
  $('#vent-input').focus({ preventScroll: true });
}));
$('#shredder-form').addEventListener('submit', event => {
  event.preventDefault();
  if (shredding) return;
  const input = $('#vent-input');
  const value = input.value.trim();
  if (!value) { toast('先写一句想吐槽的话，让碎纸机替你消化。'); input.focus(); return; }
  shredding = true;
  input.disabled = true;
  $('.shred-button').disabled = true;
  $('.shred-button span').textContent = '正在粉碎，坏心情请退后……';
  $('.shredder-machine').classList.add('paper-shred');
  tone('shred');
  $('#shredder-output').textContent = '▥ ▥ ▥ 情绪正在变成宇宙碎屑……';
  shredTimer = setTimeout(() => {
    input.value = ''; input.disabled = false; shredding = false;
    $('#character-count').textContent = '0 / 240';
    $('.shred-button').disabled = false;
    $('.shred-button span').textContent = '粉碎它，让我下班';
    $('.shredder-machine').classList.remove('paper-shred');
    $('#shredder-output').textContent = '✳ 已粉碎。那句话消失了，你还好好地在这里。今天辛苦了。';
    releases += 1; updatePressure();
    // Vent text is discarded rather than added to a history or storage.
    universe.hit(.5, .5);
  }, reducedMotion.matches ? 150 : 1000);
});

function stopBreathing({ completed = false } = {}) {
  clearInterval(breathingTimer);
  breathingRunning = false;
  $('#breathing-orbit').classList.remove('inhale', 'exhale');
  $('#breathing-instruction').textContent = completed ? '做得很好' : '慢下来';
  $('#breathing-status').textContent = completed ? '这一分钟没有实验。只有被好好照顾的你。' : '实验可以等，先呼吸一下。';
  $('#breathing-button').textContent = completed ? '再陪我呼吸一分钟 ↗' : '陪我呼吸一分钟 ↗';
  $('#breathing-button').setAttribute('aria-pressed', 'false');
  if (completed) { tone('shred'); toast('一分钟到了。喝口水，伸个懒腰吧。'); }
}

function breathingTick() {
  if (!breathingRunning || document.hidden) return;
  const elapsed = (Date.now() - breathingStartedAt - breathingPausedDuration) / 1000;
  if (elapsed >= 60) { stopBreathing({ completed: true }); return; }
  const inhale = elapsed % 10 < 4;
  $('#breathing-orbit').classList.toggle('inhale', inhale);
  $('#breathing-orbit').classList.toggle('exhale', !inhale);
  $('#breathing-instruction').textContent = inhale ? '轻轻吸气' : '慢慢呼气';
  $('#breathing-status').textContent = `${inhale ? '轻轻吸气 4 秒' : '慢慢呼气 6 秒'} · 还剩 ${Math.ceil(60 - elapsed)} 秒`;
}

$('#breathing-button').setAttribute('aria-pressed', 'false');
$('#breathing-button').addEventListener('click', () => {
  if (breathingRunning) { stopBreathing(); return; }
  breathingRunning = true;
  breathingStartedAt = Date.now(); breathingPausedAt = 0; breathingPausedDuration = 0;
  $('#breathing-button').textContent = '结束暂停，慢慢回来';
  $('#breathing-button').setAttribute('aria-pressed', 'true');
  breathingTick();
  breathingTimer = setInterval(breathingTick, 250);
});
document.addEventListener('visibilitychange', () => {
  universe.setPaused(document.hidden);
  if (breathingRunning) {
    if (document.hidden) breathingPausedAt = Date.now();
    else if (breathingPausedAt) { breathingPausedDuration += Date.now() - breathingPausedAt; breathingPausedAt = 0; breathingTick(); }
  }
});
reducedMotion.addEventListener('change', event => { universe.reducedMotion = event.matches; });
window.addEventListener('pagehide', () => { clearTimeout(toastTimer); clearTimeout(completionTimer); clearTimeout(shredTimer); clearInterval(breathingTimer); universe.destroy(); }, { once: true });
