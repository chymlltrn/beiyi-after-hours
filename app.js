import { Universe } from './assets/universe.js?v=4';
import { PERSONAS } from './assets/personas.js?v=4';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let persona = 'phd';
let modes = PERSONAS[persona].modes;

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
let breathingTimer;
let breathingRunning = false;
let breathingStartedAt = 0;
let breathingPausedAt = 0;
let breathingPausedDuration = 0;
let shredTimer;
let shredding = false;
const universe = new Universe($('#universe'), { reducedMotion: reducedMotion.matches, onComplete: finishBurst });

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
    if (type === 'burst') {
      const body = audioContext.createGain();
      body.gain.setValueAtTime(.001, now);
      body.gain.exponentialRampToValueAtTime(.15, now + .018);
      body.gain.exponentialRampToValueAtTime(.001, now + 1.25);
      body.connect(audioContext.destination);
      const bass = audioContext.createOscillator();
      bass.type = 'sine'; bass.frequency.setValueAtTime(140, now);
      bass.frequency.exponentialRampToValueAtTime(30, now + .75);
      bass.connect(body); bass.start(now); bass.stop(now + 1.3);
      const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 1.8), audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.7);
      for (const [delay, volume, cutoff] of [[0, .09, 1800], [.14, .045, 600]]) {
        const noise = audioContext.createBufferSource(); noise.buffer = buffer;
        const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff;
        const echo = audioContext.createGain(); echo.gain.setValueAtTime(volume, now + delay);
        echo.gain.exponentialRampToValueAtTime(.001, now + delay + 1.8);
        noise.connect(filter); filter.connect(echo); echo.connect(audioContext.destination);
        noise.start(now + delay); noise.stop(now + delay + 1.85);
      }
      return;
    }
    const gain = audioContext.createGain();
    const duration = type === 'charge' ? .1 : .22;
    gain.gain.setValueAtTime(.001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(.13, .035 + power * .02), now + .012);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    gain.connect(audioContext.destination);
    const osc = audioContext.createOscillator();
    const frequency = type === 'shred' ? 700 : { lab: 125, mentor: 460, earth: 82, mice: [262, 330, 392, 523][combo % 4] }[mode];
    osc.type = mode === 'mice' ? 'triangle' : mode === 'mentor' ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(mode === 'mice' ? frequency * 1.4 : Math.max(35, frequency * .35), now + duration);
    osc.connect(gain); osc.start(now); osc.stop(now + duration + .02);
    if (mode === 'lab' || type === 'shred') {
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
  clearTimeout(comboTimer); clearTimeout(impactTimer);
  cancelGesture();
  if ($('#completion-dialog').open) $('#completion-dialog').close();
  phase = 'ready'; units = 0; sceneHits = 0; score = 0; combo = 0; bestCombo = 0; lastHitAt = null;
  universe.reset(); universe.setTool(tool); universe.setIntensity(intensity);
  $('#result-panel').hidden = true; $('#result-button').hidden = true;
  delete $('#game-area').dataset.lastInteraction;
  delete $('#game-area').dataset.lastTarget;
  $('#impact-text').classList.remove('show'); $('#universe-panel').classList.remove('is-impact');
  $('#scene-caption').textContent = '';
  $('#hit-button').disabled = false; $('#charge-button').disabled = false; $('#destroy-button').disabled = false;
  $('#hit-button').textContent = modes[mode].hit; $('#destroy-button').textContent = modes[mode].ultimate;
  updateProgress();
  if (announce) toast('收拾好了。想再玩一会儿，也可以。');
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
  $('.scene-coordinate').textContent = `${PERSONAS[persona].label} / 随时重来`;
  $('#mode-description').textContent = modes[mode].description;
  $('#mode-instruction').textContent = modes[mode].instruction;
  $('#stage-badge').textContent = modes[mode].badge;
  const profile = PERSONAS[persona];
  $('#environment-label').textContent = profile.environmentLabel;
  $('#environment-description').textContent = profile.backgroundDescription;
  $('#game-area').dataset.environment = profile.environmentLabel;
  $('#game-area').dataset.interaction = modes[mode].interaction;
  $('#interaction-label').textContent = {
    fling: '抓起道具，拖动后松手',
    sort: '看清类别，拖进对应纸箱',
    aim: persona === 'teacher' ? '选个负担，瞄准脸部投过去' : '按住蓄力，松手释放',
    pet: '直接点鼠鼠，它们会回应你',
    conveyor: '点传送带上的文书，处理一件少一件',
  }[modes[mode].interaction];
  $('#universe').setAttribute('aria-label', `${modes[mode].name}。${modes[mode].instruction}。键盘空格或回车也能操作。`);
  document.querySelectorAll('.mode-card[data-mode]').forEach(card => {
    const active = card.dataset.mode === mode;
    card.classList.toggle('active', active); card.setAttribute('aria-pressed', String(active));
    card.querySelector('.mode-indicator').textContent = active ? '正在这里' : '试试看 ↗';
  });
  if (scroll) {
    $('#game-area').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
    $('#universe').focus({ preventScroll: true });
  }
}

function setPersona(next) {
  if (!(next in PERSONAS)) return;
  cancelGesture();
  persona = next;
  modes = PERSONAS[persona].modes;
  const profile = PERSONAS[persona];
  universe.setPersona(persona, modes);
  document.body.dataset.persona = persona;
  $('#game-area').dataset.persona = persona;
  document.querySelectorAll('#persona-picker button[data-persona]').forEach(button => {
    const active = button.dataset.persona === persona;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#persona-welcome').textContent = profile.welcome;
  $('#persona-description').textContent = profile.subtitle;
  document.querySelectorAll('.desktop-description, .mobile-description').forEach(text => { text.textContent = profile.heroDescription; });
  $('[data-start-label]').textContent = { phd: '去实验室玩一会儿', doctor: '把这摞文书退回去', teacher: '把额外任务丢回去' }[persona];
  const art = {
    phd: ['lab', 'mentor', 'earth', 'mice'],
    doctor: ['grant', 'inspection', 'drg', 'forms'],
    teacher: ['books', 'burden', 'school', 'burden'],
  }[persona];
  $('#ticket-art').setAttribute('href', `#art-${{ phd: 'lab', doctor: 'doctor', teacher: 'school' }[persona]}`);
  $('#brand-art').setAttribute('href', `#${{ phd: 'i-mouse', doctor: 'art-doctor', teacher: 'art-school' }[persona]}`);
  $('#closing-art').setAttribute('href', `#art-${{ phd: 'mice', doctor: 'drg', teacher: 'school' }[persona]}`);
  document.querySelectorAll('.mode-card[data-mode]').forEach((card, index) => {
    const scene = modes[card.dataset.mode];
    card.querySelector('.desktop-title').textContent = scene.cardTitle;
    const short = card.querySelector('.mobile-title');
    short.replaceChildren(document.createTextNode(scene.cardShort[0]), document.createElement('br'), document.createTextNode(scene.cardShort[1]));
    card.querySelector('p').textContent = scene.cardDescription;
    card.querySelector('.card-number').textContent = `${scene.number} / ${scene.methodLabel}`;
    card.querySelector('.card-art use').setAttribute('href', `#art-${art[index]}`);
  });
  document.querySelectorAll('[data-prompt]').forEach((button, index) => {
    button.dataset.prompt = profile.prompts[index];
    button.textContent = profile.prompts[index];
  });
  $('#vent-input').placeholder = `比如：${profile.prompts[0]}`;
  $('#permission-card').hidden = true;
  setMode(mode);
}

function releaseWords() {
  const words = {
    phd: ['实验台，今天先到这里。', '导师消息，明天再看。', '截止日，暂时炸开吧。', '鼠鼠和博士一起下班。'],
    doctor: ['标书、检查、DRG，各回各箱。', '这些行政提醒，先退回。', 'DRG文书堆，散开吧。', '这条文书传送带，停工啦。'],
    teacher: ['额外任务，先离开备课桌。', '不用什么都让老师来。', '这些额外负担，投回去！', '报表和打卡，请自己接好。'],
  };
  return words[persona][Object.keys(modes).indexOf(mode)];
}

function hit(x = .5, y = .5, options = {}) {
  if (phase === 'complete') reset({ announce: false });
  if (phase !== 'ready') return false;
  const now = performance.now();
  const interval = lastHitAt === null ? Infinity : now - lastHitAt;
  const onBeat = persona === 'phd' && mode === 'mice' && Math.abs(interval - 450) < 150;
  const nextCombo = interval < 1250 ? combo + 1 : 1;
  const proposedGain = mode === 'earth' ? Math.round(8 + (options.charge || 0) * 42) : onBeat ? 2 : 1;
  const feedback = universe.hit(x, y, { ...options, tool, combo: nextCombo, gain: proposedGain, intensity });
  $('#game-area').dataset.lastInteraction = feedback?.interaction || modes[mode].interaction;
  if (feedback?.targetId !== undefined) $('#game-area').dataset.lastTarget = String(feedback.targetId);
  else delete $('#game-area').dataset.lastTarget;
  if (feedback?.applied === false) {
    if (feedback.message) $('#scene-caption').textContent = feedback.message;
    if (feedback.impact) impact(feedback.impact);
    if (['mouse-pet', 'researcher-rest', 'mentor-pause'].includes(feedback.interaction)) { releases++; tone('hit', .3); }
    updateProgress();
    return false;
  }
  combo = nextCombo; bestCombo = Math.max(bestCombo, combo); lastHitAt = now;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => { combo = 0; updateProgress(); }, 1400);
  releases++; sceneHits++;
  const gain = onBeat ? proposedGain : (feedback?.gain ?? proposedGain);
  units = Math.min(modes[mode].goal, units + gain);
  const earned = modes[mode].score * (1 + Math.min(combo - 1, 7) * .15) * (options.fling ? 1.5 : 1) * (onBeat ? 2 : 1);
  score += Math.round(earned);
  tone('hit', 1 + Math.min(combo, 5) * .1);
  const message = feedback?.message || modes[mode].hits[(sceneHits - 1) % modes[mode].hits.length];
  $('#scene-caption').textContent = message;
  const punches = { hammer: releaseWords(), gravity: '轻飘飘地飞走了。', rainbow: '心情添了一点颜色。', shred: '这一条，先放下。', mute: '安静了一点。', reply: '留一点时间给自己。', meteor: '裂开一道缝啦。', laser: '这一块，松开了。', blackhole: '慢慢散开。', disco: '跟上节拍啦。', bubbles: '咕噜，冒个泡。', snacks: '给自己一点甜。' };
  impact(onBeat ? '合拍！ ×2' : feedback?.impact || (options.fling ? `甩得漂亮！ +${Math.round(earned)}` : combo >= 3 ? `${combo} 连击 · 轻一点了！` : punches[tool]));
  updateProgress();
  if (units >= modes[mode].goal) destroy({ automatic: true, power: options.charge || 1 });
  return true;
}

function destroy({ automatic = false, power = 1 } = {}) {
  if (phase === 'complete') { reset(); return; }
  if (phase !== 'ready') return;
  cancelGesture(); phase = 'burst'; units = modes[mode].goal;
  if (!automatic) { releases++; score += 1000; }
  universe.burst({ tool, power, combo: bestCombo, intensity });
  tone('burst', 2); updateProgress();
  $('#hit-button').disabled = true; $('#charge-button').disabled = true; $('#destroy-button').disabled = true;
  $('#scene-caption').textContent = `${releaseWords()} 看看它们慢慢飞远。`;
  impact(releaseWords());
}

function finishBurst() {
  if (phase !== 'burst') return;
  phase = 'complete'; updateProgress();
  $('#result-title').textContent = modes[mode].title;
  $('#result-description').textContent = modes[mode].message.replace('\n', ' ');
  $('#result-panel').hidden = false; $('#result-button').hidden = false;
  $('#completion-title').textContent = modes[mode].title;
  $('#completion-message').textContent = modes[mode].message;
  $('#completion-stats').textContent = `${score.toLocaleString('zh-CN')} 快乐分 · 最高 ${bestCombo} 连击`;
  $('#scene-caption').textContent = '';
  $('#hit-button').disabled = false; $('#charge-button').disabled = false; $('#destroy-button').disabled = false;
  $('#hit-button').textContent = '再玩一会儿'; $('#destroy-button').textContent = '收拾好，再来一次';
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
    $('#charge-label').textContent = charge >= 1 ? '蓄满了。松开手，让它们飞远一点。' : `蓄力 ${Math.round(charge * 100)}% · 继续按住`;
    $('#charge-button').textContent = charge >= 1 ? '松开手，放出去吧' : `蓄力中 ${Math.round(charge * 100)}%`;
  };
  tick(); chargeTimer = setInterval(tick, 32);
}

function releaseCharge(source, owner) {
  if (!charging || charging.source !== source || charging.owner !== owner) return;
  const amount = charge; const { x, y } = charging.position;
  cancelCharge();
  if (amount >= .95) {
    if (source !== 'canvas' || hit(x, y, { charge: amount })) destroy({ power: 1 });
  }
  else hit(x, y, { charge: amount, autoTarget: source !== 'canvas' });
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
  if (charging?.source === 'canvas' && charging.owner === event.pointerId) charging.position = p;
  universe.setGesture({ ...gesture, active: true, charge });
});
$('#universe').addEventListener('pointerup', event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const g = gesture; const p = position(event);
  const distance = Math.hypot(event.clientX - g.clientX, event.clientY - g.clientY);
  gesture = null; universe.setGesture({ active: false });
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  if (mode === 'earth') {
    if (charging?.source === 'canvas' && charging.owner === event.pointerId) charging.position = p;
    releaseCharge('canvas', event.pointerId);
  }
  else {
    const throwing = distance > 35 && (mode === 'lab' || mode === 'mentor' || modes[mode].interaction === 'aim');
    hit(g.startX, g.startY, throwing ? { fling: { dx: p.x - g.startX, dy: p.y - g.startY }, endX: p.x, endY: p.y } : {});
  }
});
$('#universe').addEventListener('pointercancel', event => { if (gesture?.id === event.pointerId) cancelGesture(); });
$('#universe').addEventListener('lostpointercapture', event => { if (gesture?.id === event.pointerId) cancelGesture(); });
$('#universe').addEventListener('keydown', event => {
  if (!['Space', 'Enter'].includes(event.code)) return;
  event.preventDefault(); if (event.repeat) return;
  if (charging || gesture) return;
  if (mode === 'earth') beginCharge('keyboard', undefined, event.code); else hit(.5, .5, { autoTarget: true });
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
$('#charge-button').addEventListener('click', event => { if (event.detail === 0 && !charging && phase !== 'burst') hit(.5, .5, { charge: .5, autoTarget: true }); });
$('#hit-button').addEventListener('click', () => {
  if (phase === 'complete') reset({ announce: false });
  else hit(.5, .5, { autoTarget: true });
});
$('#destroy-button').addEventListener('click', () => destroy());
$('#reset-button').addEventListener('click', () => reset());
$('#start-button').addEventListener('click', () => setMode('lab', { scroll: true }));
document.querySelectorAll('.mode-card[data-mode]').forEach(card => card.addEventListener('click', () => setMode(card.dataset.mode)));
document.querySelectorAll('#persona-picker button[data-persona]').forEach(button => button.addEventListener('click', () => setPersona(button.dataset.persona)));
document.querySelectorAll('button[data-intensity]').forEach(button => button.addEventListener('click', () => {
  intensity = Number(button.dataset.intensity); universe.setIntensity(intensity); $('#game-area').dataset.intensity = String(intensity);
  document.querySelectorAll('button[data-intensity]').forEach(item => item.setAttribute('aria-pressed', String(Number(item.dataset.intensity) === intensity)));
}));
$('#sound-toggle').addEventListener('click', () => { soundEnabled = !soundEnabled; updateSound(); tone('hit'); toast(soundEnabled ? '声音开了。听听它们飞走的声音。' : '声音关了。安静地玩一会儿。'); });

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
  if (!value) { toast('写一句也好。这里可以说说心里话。'); input.focus(); return; }
  shredding = true; input.disabled = true; $('.shred-button').disabled = true;
  $('.shred-button span').textContent = '正在把这些字变成彩纸……'; $('.shredder-machine').classList.add('paper-shred'); tone('shred');
  const stream = $('#shredder-stream'); stream.replaceChildren();
  Array.from(value).slice(0, 60).forEach((character, index) => {
    const bit = document.createElement('span'); bit.textContent = character;
    bit.style.setProperty('--i', String(index)); bit.style.setProperty('--x', `${Math.random() * 90}%`); bit.style.setProperty('--r', `${Math.random() * 160 - 80}deg`);
    stream.append(bit);
  });
  $('#shredder-output').textContent = '慢慢松开，看看它们飘走。';
  shredTimer = setTimeout(() => {
    input.value = ''; input.disabled = false; shredding = false; stream.replaceChildren();
    $('#character-count').textContent = '0 / 240'; $('.shred-button').disabled = false; $('.shred-button span').textContent = '把这句话放下';
    $('.shredder-machine').classList.remove('paper-shred');
    $('#shredder-output').textContent = '已粉碎。这句话先放下，剩下的时间留给自己。';
    releases++; updateProgress();
  }, reducedMotion.matches ? 180 : 1500);
});

$('#permission-button').addEventListener('click', () => {
  const permissionMessages = PERSONAS[persona].permits;
  $('#permission-text').textContent = permissionMessages[Math.floor(Math.random() * permissionMessages.length)]; $('#permission-card').hidden = false; tone('shred');
  $('#permission-close').focus({ preventScroll: true });
});
$('#permission-close').addEventListener('click', () => { $('#permission-card').hidden = true; $('#permission-button').focus({ preventScroll: true }); });

function stopBreathing({ completed = false } = {}) {
  clearInterval(breathingTimer); breathingRunning = false;
  $('#breathing-orbit').classList.remove('inhale', 'exhale');
  $('#breathing-instruction').textContent = completed ? '做得很好' : '慢下来';
  $('#breathing-status').textContent = completed ? '这一分钟留给了自己。现在感觉怎么样？' : '事情可以等一会儿，先呼吸一下。';
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
  $('#breathing-button').textContent = '我想先停一下'; $('#breathing-button').setAttribute('aria-pressed', 'true');
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
  cancelGesture(); clearTimeout(toastTimer); clearTimeout(shredTimer); clearTimeout(comboTimer); clearTimeout(impactTimer); clearInterval(breathingTimer);
  $('#vent-input').value = ''; $('#shredder-stream').replaceChildren(); universe.destroy();
  if (audioContext) audioContext.close().catch(() => {});
});
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
setPersona('phd');
