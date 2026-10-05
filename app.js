import { Universe } from './assets/universe.js';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const modes = {
  lab: {
    name: '实验室拆迁办', number: '01', goal: 6, unit: '件仪器已起飞', badge: '营业中 · 全部拆迁',
    description: '移液枪、离心机、跑不出来的胶。把今天的实验现场，甩出太阳系。',
    instruction: '抓住仪器，拖动后松手甩飞。也可以直接点着砸。', hit: '砸飞一件', ultimate: '实验室原地起飞', charge: '按住 · 启动反重力',
    tools: [['hammer', '↘', '下班大锤'], ['gravity', '◎', '反重力场'], ['rainbow', '✺', '彩虹溶解液']],
    hits: ['离心机：这次真的离心了。', '移液枪，送你一个无薪飞行。', '阴性结果留着，坏心情飞走。', '试剂盒已加入星际快递。', 'PCR：扩增快乐，不扩增加班。', '实验台：本台宣布提前退休。'],
    title: '实验室，已发射。', message: '实验记录平安，小鼠坐上逃生火箭。\n今天不用补实验，只补一觉。', score: 180,
  },
  mentor: {
    name: '导师消息退订台', number: '02', goal: 5, unit: '条消息已退订', badge: '自动回复 · 本人已下班',
    description: '“这个很简单，再补一组。”选择粉碎、静音或礼貌回怼，把自己的时间拿回来。',
    instruction: '抓住消息拖进黑洞。换个工具，还能静音或回怼。', hit: '退订一条', ultimate: '拒收全部加班消息', charge: '按住 · 开启免打扰',
    tools: [['shred', '≋', '语录碎纸机'], ['mute', '⊘', '宇宙免打扰'], ['reply', '↗', '礼貌回怼']],
    hits: ['「再补一组」→ 收到，我先下班。', '「周末来一下」→ 周末已被我预约。', '「这个很简单」→ 那您一定很擅长。', '「投个顶刊」→ 先投一张休假申请。', '「结果呢？」→ 我的人生也需要结果。'],
    title: '您已退出加班群聊。', message: '所有「再补一组」已被宇宙拒收。\n自动回复：正在生活，稍后上线。', score: 220,
  },
  earth: {
    name: '地球卸载程序', number: '03', goal: 100, unit: '卸载进度', badge: '程序：地球.exe · 响应过载',
    description: '组会、DDL、Reviewer 2 都在这颗星球上。太卡了？那就卸载，重新安装一个。',
    instruction: '按住星球约 2.4 秒蓄力，松手释放。点击也能召唤陨石。', hit: '来一颗陨石', ultimate: '立即卸载地球', charge: '按住 · 蓄力卸载地球',
    tools: [['meteor', '☄', 'DDL 陨石'], ['laser', '⌁', '审稿人激光'], ['blackhole', '◉', '一键格式化']],
    hits: ['DDL 已经失去引力。', '组会所在的经线正在松动。', 'Reviewer 2：服务器连接失败。', '正在删除「无限返修」文件夹。', '地球内存终于留给了睡眠。'],
    title: '新地球，安装完成。', message: '已删除：凌晨组会、无限返修、无效加班。\n已保留：你、好好睡觉、快乐的小鼠。', score: 80,
  },
  mice: {
    name: '鼠鼠篡位俱乐部', number: '04', goal: 12, unit: '份快乐已扩增', badge: '133 BPM · 快乐不做对照组',
    description: '今天鼠鼠当导师，你负责蹦迪。踩准节拍，越敲越热闹，全员带薪休假。',
    instruction: '跟着节奏连续点击舞池。约半秒一下，踩准节拍快乐翻倍。', hit: '给鼠鼠打个拍', ultimate: '全员带薪开趴', charge: '按住 · 掀起派对高潮',
    tools: [['disco', '♫', '鼠鼠 DJ'], ['bubbles', '○', '汽水泡泡'], ['snacks', '✦', '零食空投']],
    hits: ['鼠鼠一号：取消今天的实验。', '动物房改名：北医地下舞厅。', '鼠鼠：这次由你当快乐实验组。', '小鼠已批准你的带薪摸鱼。', '快乐不显著？再来一个节拍！'],
    title: '鼠鼠宣布：全员下班！', message: '没有对照组，只有快乐组。\n今天我们全体通过「好好生活」伦理审批。', score: 120,
  },
};

let mode = 'lab';
let tool = 'hammer';
let intensity = 2;
let units = 0;
let pressure = 0;
let releases = 0;
let sceneHits = 0;
let score = 0;
let combo = 0;
let bestCombo = 0;
let lastHitAt = null;
let phase = 'ready';
let soundEnabled = false;
let audioContext;
let gesture = null;
let charging = null;
let charge = 0;
let chargeTimer;
let comboTimer;
let impactTimer;
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
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2300);
}

function tone(type = 'hit', power = 1) {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { soundEnabled = false; updateSound(); return; }
    audioContext ??= new Audio();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    const duration = type === 'burst' ? .8 : type === 'charge' ? .1 : .22;
    gain.gain.setValueAtTime(.001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(.13, .035 + power * .02), now + .012);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    gain.connect(audioContext.destination);
    const osc = audioContext.createOscillator();
    const frequency = type === 'shred' ? 700 : type === 'burst' ? 150 : { lab: 125, mentor: 460, earth: 82, mice: [262, 330, 392, 523][combo % 4] }[mode];
    osc.type = mode === 'mice' ? 'triangle' : mode === 'mentor' ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(type === 'burst' ? 25 : mode === 'mice' ? frequency * 1.4 : Math.max(35, frequency * .35), now + duration);
    osc.connect(gain); osc.start(now); osc.stop(now + duration + .02);
    if (mode === 'lab' || type === 'burst' || type === 'shred') {
      const length = Math.floor(audioContext.sampleRate * Math.min(duration, .3));
      const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * .35;
      const noise = audioContext.createBufferSource(); noise.buffer = buffer;
      const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = type === 'shred' ? 1800 : 850;
      noise.connect(filter); filter.connect(gain); noise.start(now); noise.stop(now + duration);
    }
  } catch { soundEnabled = false; updateSound(); }
}

function updateSound() {
  const button = $('#sound-toggle');
  button.setAttribute('aria-pressed', String(soundEnabled));
  button.setAttribute('aria-label', soundEnabled ? '关闭音效' : '开启音效');
  button.title = soundEnabled ? '关闭音效' : '开启音效';
  button.querySelector('use').setAttribute('href', soundEnabled ? '#i-sound' : '#i-mute');
}

function updateProgress() {
  pressure = Math.min(100, Math.round(units / modes[mode].goal * 100));
  $('#pressure-label').textContent = modes[mode].unit;
  $('#pressure-value').textContent = mode === 'earth' ? `${pressure}%` : `${Math.min(units, modes[mode].goal)} / ${modes[mode].goal}`;
  $('#pressure-fill').style.width = `${pressure}%`;
  $('#total-release').textContent = String(releases).padStart(2, '0');
  $('#scene-score').textContent = score.toLocaleString('zh-CN');
  $('#combo-value').textContent = combo > 1 ? `${combo}×` : '—';
  $('#combo-meter').style.width = `${Math.min(100, combo / 8 * 100)}%`;
  $('#game-area').dataset.phase = phase;
}

function impact(message) {
  clearTimeout(impactTimer);
  $('#impact-text').textContent = message;
  $('#impact-text').classList.remove('show');
  void $('#impact-text').offsetWidth;
  $('#impact-text').classList.add('show');
  $('#universe-panel').classList.toggle('is-impact', !reducedMotion.matches);
  impactTimer = setTimeout(() => {
    $('#impact-text').classList.remove('show');
    $('#universe-panel').classList.remove('is-impact');
  }, 950);
}

function cancelCharge() {
  const previous = charging;
  clearInterval(chargeTimer);
  charging = null; charge = 0;
  if (previous?.source === 'button' && $('#charge-button').hasPointerCapture(previous.owner)) $('#charge-button').releasePointerCapture(previous.owner);
  universe.setCharge(0);
  $('#charge-fill').style.width = '0%';
  $('#charge-label').textContent = '按住蓄力，松手释放';
  $('#charge-button').textContent = modes[mode].charge;
  $('#charge-button').setAttribute('aria-pressed', 'false');
  $('#game-area').classList.remove('charging');
}

function cancelGesture() {
  const previous = gesture;
  gesture = null;
  if (previous) {
    const canvas = $('#universe');
    if (canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
  }
  universe.setGesture({ active: false });
  cancelCharge();
}

function reset({ announce = true } = {}) {
  clearTimeout(completionTimer); clearTimeout(comboTimer); clearTimeout(impactTimer);
  cancelGesture();
  if ($('#completion-dialog').open) $('#completion-dialog').close();
  phase = 'ready'; units = 0; sceneHits = 0; score = 0; combo = 0; bestCombo = 0; lastHitAt = null;
  universe.reset(); universe.setTool(tool); universe.setIntensity(intensity);
  $('#result-panel').hidden = true; $('#result-button').hidden = true;
  $('#impact-text').classList.remove('show'); $('#universe-panel').classList.remove('is-impact');
  $('#scene-caption').textContent = '';
  $('#hit-button').disabled = false; $('#charge-button').disabled = false; $('#destroy-button').disabled = false;
  $('#hit-button').textContent = modes[mode].hit; $('#destroy-button').textContent = modes[mode].ultimate;
  updateProgress();
  if (announce) toast('新的一局。坏心情可以无限清空。');
}

function setTool(next) {
  if (!modes[mode].tools.some(item => item[0] === next)) return;
  tool = next; universe.setTool(tool);
  document.querySelectorAll('[data-tool]').forEach(button => {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
}

function renderTools() {
  $('#tool-rack').replaceChildren();
  for (const [key, icon, name] of modes[mode].tools) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.tool = key; button.className = 'tool-button';
    const symbol = document.createElement('span'); symbol.className = 'tool-symbol'; symbol.textContent = icon; symbol.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.textContent = name;
    button.append(symbol, text); button.addEventListener('click', () => setTool(key));
    $('#tool-rack').append(button);
  }
  setTool(tool);
}

function setMode(next, { scroll = false } = {}) {
  if (!(next in modes)) return;
  cancelGesture(); mode = next; tool = modes[mode].tools[0][0];
  universe.setMode(mode); reset({ announce: false }); renderTools();
  document.body.dataset.mode = mode; $('#game-area').dataset.mode = mode;
  $('#scene-name').textContent = modes[mode].name;
  $('.scene-coordinate').textContent = `PLAY ${modes[mode].number} / 无限重来`;
  $('#mode-description').textContent = modes[mode].description;
  $('#mode-instruction').textContent = modes[mode].instruction;
  $('#stage-badge').textContent = modes[mode].badge;
  $('#universe').setAttribute('aria-label', `${modes[mode].name}。${modes[mode].instruction}。键盘空格或回车也能操作。`);
  document.querySelectorAll('.mode-card[data-mode]').forEach(card => {
    const active = card.dataset.mode === mode;
    card.classList.toggle('active', active); card.setAttribute('aria-pressed', String(active));
    card.querySelector('.mode-indicator').textContent = active ? '正在玩' : '开玩 ↗';
  });
  if (scroll) {
    $('#game-area').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
    $('#universe').focus({ preventScroll: true });
  }
}

function hit(x = .5, y = .5, options = {}) {
  if (phase === 'complete') reset({ announce: false });
  if (phase !== 'ready') return;
  const now = performance.now();
  const interval = lastHitAt === null ? Infinity : now - lastHitAt;
  const onBeat = mode === 'mice' && Math.abs(interval - 450) < 150;
  combo = interval < 1250 ? combo + 1 : 1; bestCombo = Math.max(bestCombo, combo); lastHitAt = now;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => { combo = 0; updateProgress(); }, 1400);
  releases++; sceneHits++;
  const gain = mode === 'earth' ? Math.round(8 + (options.charge || 0) * 42) : mode === 'mice' && onBeat ? 2 : 1;
  units = Math.min(modes[mode].goal, units + gain);
  const earned = modes[mode].score * (1 + Math.min(combo - 1, 7) * .15) * (options.fling ? 1.5 : 1) * (onBeat ? 2 : 1);
  score += Math.round(earned);
  universe.hit(x, y, { ...options, tool, combo, gain, intensity });
  tone('hit', 1 + Math.min(combo, 5) * .1);
  const message = modes[mode].hits[(sceneHits - 1) % modes[mode].hits.length];
  $('#scene-caption').textContent = message;
  const punches = { hammer: '仪器，起飞！', gravity: '坏心情吸走！', rainbow: '压力溶解了！', shred: '已读，不补。', mute: '世界安静了。', reply: '收到，退回！', meteor: 'DDL 烧成灰！', laser: '返修，清零！', blackhole: '烦恼格式化！', disco: '鼠鼠：准假！', bubbles: '咕噜，快乐！', snacks: '干饭不干活！' };
  impact(onBeat ? 'PERFECT! 快乐 ×2' : options.fling ? `甩得漂亮！ +${Math.round(earned)}` : combo >= 3 ? `${combo} 连击 · 痛快！` : punches[tool]);
  updateProgress();
  if (units >= modes[mode].goal) destroy({ automatic: true, power: options.charge || 1 });
}

function destroy({ automatic = false, power = 1 } = {}) {
  if (phase === 'complete') { reset(); return; }
  if (phase !== 'ready') return;
  cancelGesture(); phase = 'burst'; units = modes[mode].goal;
  if (!automatic) { releases++; score += 1000; }
  universe.burst({ tool, power, combo: bestCombo, intensity });
  tone('burst', 2); updateProgress();
  $('#hit-button').disabled = true; $('#charge-button').disabled = true; $('#destroy-button').disabled = true;
  $('#scene-caption').textContent = { lab: '设备正在获得它们的第一张登机牌……', mentor: '正在向全宇宙广播：本人已下班。', earth: '正在删除地球旧版本，安装快乐更新……', mice: '带薪假期已生效，鼠鼠开始接管舞池！' }[mode];
  impact({ lab: '拆！拆！拆！', mentor: '已读，不补。', earth: '地球.exe 已卸载', mice: '鼠鼠万岁！' }[mode]);
  completionTimer = setTimeout(() => {
    phase = 'complete'; updateProgress();
    $('#result-title').textContent = modes[mode].title;
    $('#result-description').textContent = modes[mode].message.replace('\n', ' ');
    $('#result-panel').hidden = false; $('#result-button').hidden = false;
    $('#completion-title').textContent = modes[mode].title;
    $('#completion-message').textContent = modes[mode].message;
    $('#completion-stats').textContent = `${score.toLocaleString('zh-CN')} 快乐分 · 最高 ${bestCombo} 连击`;
    $('#scene-caption').textContent = '';
    $('#hit-button').disabled = false; $('#charge-button').disabled = false; $('#destroy-button').disabled = false;
    $('#hit-button').textContent = '再玩一局'; $('#destroy-button').textContent = '宇宙恢复 · 再来！';
  }, reducedMotion.matches ? 220 : 2000);
}

function beginCharge(source, position = { x: .5, y: .5 }, owner = null) {
  if (phase === 'complete') reset({ announce: false });
  if (phase !== 'ready' || charging) return;
  charging = { source, start: performance.now(), position, owner }; charge = 0;
  $('#charge-button').setAttribute('aria-pressed', 'true'); $('#game-area').classList.add('charging');
  const tick = () => {
    if (!charging) return;
    charge = Math.min(1, Math.max(0, (performance.now() - charging.start) / 2400));
    universe.setCharge(charge);
    $('#charge-fill').style.width = `${Math.round(charge * 100)}%`;
    $('#charge-label').textContent = charge >= 1 ? '蓄满了！松手，让宇宙替你发疯。' : `蓄力 ${Math.round(charge * 100)}% · 继续按住`;
    $('#charge-button').textContent = charge >= 1 ? '松手！释放宇宙级快乐' : `蓄力中 ${Math.round(charge * 100)}%`;
  };
  tick(); chargeTimer = setInterval(tick, 32);
}

function releaseCharge(source, owner) {
  if (!charging || charging.source !== source || charging.owner !== owner) return;
  const amount = charge; const { x, y } = charging.position;
  cancelCharge();
  if (amount >= .95) destroy({ power: 1 });
  else hit(x, y, { charge: amount });
}

function position(event) {
  const rect = $('#universe').getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
}

$('#universe').addEventListener('pointerdown', event => {
  if (event.button !== 0 || phase === 'burst' || gesture || charging) return;
  event.preventDefault();
  if (phase === 'complete') reset({ announce: false });
  const p = position(event);
  gesture = { id: event.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y, clientX: event.clientX, clientY: event.clientY };
  event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true });
  universe.setGesture({ ...gesture, active: true });
  if (mode === 'earth') beginCharge('canvas', p, event.pointerId);
});
$('#universe').addEventListener('pointermove', event => {
  const p = position(event); universe.pointer(p.x, p.y);
  if (!gesture || gesture.id !== event.pointerId) return;
  gesture.x = p.x; gesture.y = p.y;
  universe.setGesture({ ...gesture, active: true, charge });
});
$('#universe').addEventListener('pointerup', event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const g = gesture; const p = position(event);
  const distance = Math.hypot(event.clientX - g.clientX, event.clientY - g.clientY);
  gesture = null; universe.setGesture({ active: false });
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  if (mode === 'earth') releaseCharge('canvas', event.pointerId);
  else hit(g.startX, g.startY, distance > 35 && (mode === 'lab' || mode === 'mentor') ? { fling: { dx: p.x - g.startX, dy: p.y - g.startY }, endX: p.x, endY: p.y } : {});
});
$('#universe').addEventListener('pointercancel', event => { if (gesture?.id === event.pointerId) cancelGesture(); });
$('#universe').addEventListener('lostpointercapture', event => { if (gesture?.id === event.pointerId) cancelGesture(); });
$('#universe').addEventListener('keydown', event => {
  if (!['Space', 'Enter'].includes(event.code)) return;
  event.preventDefault(); if (event.repeat) return;
  if (charging || gesture) return;
  if (mode === 'earth') beginCharge('keyboard', undefined, event.code); else hit();
});
$('#universe').addEventListener('keyup', event => {
  if (['Space', 'Enter'].includes(event.code) && charging?.source === 'keyboard') { event.preventDefault(); releaseCharge('keyboard', event.code); }
});
$('#universe').addEventListener('blur', () => { if (charging?.source === 'keyboard') cancelCharge(); });
$('#charge-button').addEventListener('pointerdown', event => {
  if (event.button !== 0 || charging || gesture || phase === 'burst') return;
  event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
  beginCharge('button', undefined, event.pointerId); event.currentTarget.setPointerCapture(event.pointerId);
});
$('#charge-button').addEventListener('pointerup', event => {
  releaseCharge('button', event.pointerId);
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
});
$('#charge-button').addEventListener('pointercancel', event => { if (charging?.source === 'button' && charging.owner === event.pointerId) cancelCharge(); });
$('#charge-button').addEventListener('lostpointercapture', event => { if (charging?.source === 'button' && charging.owner === event.pointerId) cancelCharge(); });
$('#charge-button').addEventListener('keydown', event => { if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); if (!event.repeat && !gesture) beginCharge('charge-keyboard', undefined, event.code); } });
$('#charge-button').addEventListener('keyup', event => { if (['Space', 'Enter'].includes(event.code) && charging?.source === 'charge-keyboard') { event.preventDefault(); releaseCharge('charge-keyboard', event.code); } });
$('#charge-button').addEventListener('blur', () => { if (charging?.source === 'charge-keyboard') cancelCharge(); });
// Assistive technology can activate the button without pointer or keyboard events.
$('#charge-button').addEventListener('click', event => { if (event.detail === 0 && !charging && phase !== 'burst') hit(.5, .5, { charge: .5 }); });
$('#hit-button').addEventListener('click', () => {
  if (phase === 'complete') reset({ announce: false });
  else hit(.25 + Math.random() * .5, .35 + Math.random() * .3);
});
$('#destroy-button').addEventListener('click', () => destroy());
$('#reset-button').addEventListener('click', () => reset());
$('#start-button').addEventListener('click', () => setMode('lab', { scroll: true }));
document.querySelectorAll('.mode-card[data-mode]').forEach(card => card.addEventListener('click', () => setMode(card.dataset.mode)));
document.querySelectorAll('button[data-intensity]').forEach(button => button.addEventListener('click', () => {
  intensity = Number(button.dataset.intensity); universe.setIntensity(intensity); $('#game-area').dataset.intensity = String(intensity);
  document.querySelectorAll('button[data-intensity]').forEach(item => item.setAttribute('aria-pressed', String(Number(item.dataset.intensity) === intensity)));
}));
$('#sound-toggle').addEventListener('click', () => { soundEnabled = !soundEnabled; updateSound(); tone('hit'); toast(soundEnabled ? '声音开了。每个宇宙都有自己的声响。' : '静音模式。安静地拆，也很痛快。'); });

function setImmersive(active) {
  const wasActive = $('#game-area').classList.contains('immersive');
  $('#game-area').classList.toggle('immersive', active); document.body.classList.toggle('immersive-open', active);
  $('#fullscreen-button').setAttribute('aria-pressed', String(active));
  $('#fullscreen-button').setAttribute('aria-label', active ? '退出沉浸模式' : '进入沉浸模式');
  $('#fullscreen-button').textContent = active ? '↙ 退出沉浸' : '⤢ 沉浸模式';
  if (active) $('#universe').focus({ preventScroll: true });
  else if (wasActive) $('#fullscreen-button').focus({ preventScroll: true });
}
$('#fullscreen-button').addEventListener('click', () => setImmersive(!$('#game-area').classList.contains('immersive')));
document.addEventListener('keydown', event => { if (event.code === 'Escape') { cancelGesture(); setImmersive(false); $('#permission-card').hidden = true; } });
document.addEventListener('keydown', event => {
  if (event.code !== 'Tab' || !$('#game-area').classList.contains('immersive') || $('#completion-dialog').open) return;
  const targets = [...$('#game-area').querySelectorAll('button:not(:disabled), canvas[tabindex="0"]')].filter(element => element.getClientRects().length);
  const first = targets[0]; const last = targets.at(-1);
  if (event.shiftKey && (document.activeElement === first || !$('#game-area').contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
$('#result-button').addEventListener('click', () => $('#completion-dialog').showModal());
$('#again-button').addEventListener('click', () => { reset({ announce: false }); $('#universe').focus({ preventScroll: true }); });
$('#dialog-close').addEventListener('click', () => $('#completion-dialog').close());
$('#completion-dialog').addEventListener('click', event => {
  if (event.target !== event.currentTarget) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
});
$('#rest-button').addEventListener('click', () => { $('#completion-dialog').close(); setImmersive(false); $('#rest').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' }); $('#breathing-button').focus({ preventScroll: true }); });

$('#vent-input').addEventListener('input', event => { $('#character-count').textContent = `${event.target.value.length} / 240`; });
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  if (shredding) return;
  $('#vent-input').value = button.dataset.prompt; $('#vent-input').dispatchEvent(new Event('input')); $('#vent-input').focus({ preventScroll: true });
}));
$('#shredder-form').addEventListener('submit', event => {
  event.preventDefault(); if (shredding) return;
  const input = $('#vent-input'); const value = input.value.trim();
  if (!value) { toast('先写一句想吐槽的话。今天不用委婉。'); input.focus(); return; }
  shredding = true; input.disabled = true; $('.shred-button').disabled = true;
  $('.shred-button span').textContent = '正在把破事切成彩纸……'; $('.shredder-machine').classList.add('paper-shred'); tone('shred');
  const stream = $('#shredder-stream'); stream.replaceChildren();
  Array.from(value).slice(0, 60).forEach((character, index) => {
    const bit = document.createElement('span'); bit.textContent = character;
    bit.style.setProperty('--i', String(index)); bit.style.setProperty('--x', `${Math.random() * 90}%`); bit.style.setProperty('--r', `${Math.random() * 160 - 80}deg`);
    stream.append(bit);
  });
  $('#shredder-output').textContent = '进纸中 → 压力正在失去它的形状';
  shredTimer = setTimeout(() => {
    input.value = ''; input.disabled = false; shredding = false; stream.replaceChildren();
    $('#character-count').textContent = '0 / 240'; $('.shred-button').disabled = false; $('.shred-button span').textContent = '粉碎它，让我下班';
    $('.shredder-machine').classList.remove('paper-shred');
    $('#shredder-output').textContent = '✦ 已粉碎。宇宙里少了一件破事，多了一个准备下班的你。';
    releases++; updateProgress();
  }, reducedMotion.matches ? 180 : 1500);
});

const permissionMessages = ['经鼠鼠委员会一致表决：今天的你已经足够努力。准予下班，不必内疚。', '兹证明：阴性结果不影响你的下班资格。今日剩余时间归你所有。', '北医宇宙劳动委员会批准：停止脑内组会，开启晚饭、热水澡与睡眠。', '特批一张免补实验券。有效期：此刻。签发人：已逃出动物房的鼠鼠。'];
$('#permission-button').addEventListener('click', () => {
  $('#permission-text').textContent = permissionMessages[Math.floor(Math.random() * permissionMessages.length)]; $('#permission-card').hidden = false; tone('shred');
  $('#permission-close').focus({ preventScroll: true });
});
$('#permission-close').addEventListener('click', () => { $('#permission-card').hidden = true; $('#permission-button').focus({ preventScroll: true }); });

function stopBreathing({ completed = false } = {}) {
  clearInterval(breathingTimer); breathingRunning = false;
  $('#breathing-orbit').classList.remove('inhale', 'exhale');
  $('#breathing-instruction').textContent = completed ? '做得很好' : '慢下来';
  $('#breathing-status').textContent = completed ? '这一分钟没有实验。只有被好好照顾的你。' : '实验可以等，先呼吸一下。';
  $('#breathing-button').textContent = completed ? '再陪我呼吸一分钟 ↗' : '陪我呼吸一分钟 ↗'; $('#breathing-button').setAttribute('aria-pressed', 'false');
  if (completed) { tone('shred'); toast('一分钟到了。喝口水，伸个懒腰吧。'); }
}

function breathingTick() {
  if (!breathingRunning || document.hidden) return;
  const elapsed = (Date.now() - breathingStartedAt - breathingPausedDuration) / 1000;
  if (elapsed >= 60) { stopBreathing({ completed: true }); return; }
  const inhale = elapsed % 10 < 4;
  $('#breathing-orbit').classList.toggle('inhale', inhale); $('#breathing-orbit').classList.toggle('exhale', !inhale);
  $('#breathing-instruction').textContent = inhale ? '轻轻吸气' : '慢慢呼气';
  $('#breathing-status').textContent = `${inhale ? '轻轻吸气 4 秒' : '慢慢呼气 6 秒'} · 还剩 ${Math.ceil(60 - elapsed)} 秒`;
}

$('#breathing-button').setAttribute('aria-pressed', 'false');
$('#breathing-button').addEventListener('click', () => {
  if (breathingRunning) { stopBreathing(); return; }
  breathingRunning = true; breathingStartedAt = Date.now(); breathingPausedAt = 0; breathingPausedDuration = 0;
  $('#breathing-button').textContent = '结束暂停，慢慢回来'; $('#breathing-button').setAttribute('aria-pressed', 'true');
  breathingTick(); breathingTimer = setInterval(breathingTick, 250);
});
document.addEventListener('visibilitychange', () => {
  universe.setPaused(document.hidden);
  if (document.hidden) { cancelGesture(); clearTimeout(comboTimer); combo = 0; lastHitAt = null; updateProgress(); }
  if (breathingRunning) {
    if (document.hidden) breathingPausedAt = Date.now();
    else if (breathingPausedAt) { breathingPausedDuration += Date.now() - breathingPausedAt; breathingPausedAt = 0; breathingTick(); }
  }
});
window.addEventListener('blur', cancelGesture);
reducedMotion.addEventListener('change', event => { universe.reducedMotion = event.matches; });
window.addEventListener('pagehide', () => {
  cancelGesture(); clearTimeout(toastTimer); clearTimeout(completionTimer); clearTimeout(shredTimer); clearTimeout(comboTimer); clearTimeout(impactTimer); clearInterval(breathingTimer);
  $('#vent-input').value = ''; $('#shredder-stream').replaceChildren(); universe.destroy();
  if (audioContext) audioContext.close().catch(() => {});
});
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
setMode('lab');
