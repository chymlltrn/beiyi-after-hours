const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const base = process.env.SITE_URL || 'http://127.0.0.1:8087/';
const modeContracts = [
  { id: 'lab', empty: '0 / 6', complete: '6 / 6', tools: ['hammer', 'gravity', 'rainbow'] },
  { id: 'mentor', empty: '0 / 5', complete: '5 / 5', tools: ['shred', 'mute', 'reply'] },
  { id: 'earth', empty: '0%', complete: '100%', tools: ['meteor', 'laser', 'blackhole'] },
  { id: 'mice', empty: '0 / 12', complete: '12 / 12', tools: ['disco', 'bubbles', 'snacks'] },
];
const digest = buffer => createHash('sha256').update(buffer).digest('hex');

(async () => {
  const { PERSONAS } = await import(pathToFileURL(path.join(__dirname, '../assets/personas.js')).href);
  const modes = modeContracts.map(item => ({ ...item, title: PERSONAS.phd.modes[item.id].title }));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    ...(process.env.BROWSER_PROXY ? { proxy: { server: process.env.BROWSER_PROXY } } : {}),
  });
  const checks = [], errors = [], failedRequests = [], httpErrors = [], unexpectedDialogs = [], imageChanges = [], personaScenes = [], fragmentMotion = [], targetedInteractions = [], loadedOfflineImages = [];
  const observe = (page, label) => {
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    page.on('requestfailed', request => failedRequests.push(`${label}: ${request.url()}`));
    page.on('response', response => { if (response.status() >= 400) httpErrors.push(`${label}: ${response.status()} ${response.url()}`); });
    page.on('dialog', async dialog => { unexpectedDialogs.push(`${label}: ${dialog.message()}`); await dialog.dismiss(); });
  };
  const verify = async (name, action) => { await action(); checks.push(name); console.log(`PASS ${name}`); };
  const newPage = async (label, options = {}) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
    await page.addInitScript(() => {
      const NativeImage = window.Image;
      window.__qaImages = [];
      window.Image = class extends NativeImage {
        constructor(...args) { super(...args); window.__qaImages.push(this); }
      };
    });
    observe(page, label); await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('#game-area[data-persona="phd"][data-phase="ready"]').waitFor();
    await page.locator('#scene-name').filter({ hasText: PERSONAS.phd.modes.lab.name }).waitFor(); return page;
  };
  const selectMode = async (page, id) => {
    await page.locator(`.mode-card[data-mode="${id}"]`).click();
    assert.equal(await page.locator(`.mode-card[data-mode="${id}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#game-area').getAttribute('data-mode'), id);
  };
  const selectPersona = async (page, id) => {
    const choice = page.locator(`#persona-picker button[data-persona="${id}"]`);
    await choice.click(); assert.equal(await choice.getAttribute('aria-pressed'), 'true');
    assert.equal(await choice.evaluate(el => el.classList.contains('active')), true);
    assert.equal(await page.locator('body').getAttribute('data-persona'), id);
    assert.equal(await page.locator('#game-area').getAttribute('data-persona'), id);
  };
  const progress = page => page.locator('#pressure-value').textContent();
  const score = async page => Number((await page.locator('#scene-score').textContent()).replaceAll(',', ''));
  const canvasPoint = async (page, x = .5, y = .5) => {
    const canvas = page.locator('#universe'); await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox(); assert.ok(box && box.width > 100 && box.height > 100);
    return { x: box.x + box.width * x, y: box.y + box.height * y };
  };
  const dragCanvas = async (page, from, to) => {
    const start = await canvasPoint(page, ...from), end = await canvasPoint(page, ...to);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
  };
  const authoredTarget = async (page, x, y) => {
    const box = await page.locator('#universe').boundingBox();
    // Targets come from the actual illustrated microscope/message, with the
    // documented desktop camera fit applied to the current viewport size.
    const scale = Math.min(box.width / 800, box.height / 460);
    const viewW = box.width / scale, viewH = box.height / scale;
    return [(x + (viewW - 800) / 2) / viewW, (y + (viewH - 460) / 2) / viewH];
  };
  const sceneTargets = async (page, persona, mode) => page.evaluate(async ({ persona, mode }) => {
    const [{ Universe }, { PERSONAS }] = await Promise.all([
      import(new URL('./assets/universe.js', location.href).href),
      import(new URL('./assets/personas.js', location.href).href),
    ]);
    const box = document.querySelector('#universe').getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `width:${box.width}px;height:${box.height}px;position:fixed;left:-9999px;top:0;pointer-events:none`;
    document.body.append(canvas);
    const scene = new Universe(canvas, { reducedMotion: true });
    try {
      scene.setPersona(persona, PERSONAS[persona].modes); scene.setMode(mode);
      return scene.getTargets();
    } finally { scene.destroy(); canvas.remove(); }
  }, { persona, mode });
  const targetCoordinates = target => [target.x, target.y];
  const clickTarget = async (page, target) => {
    const point = await canvasPoint(page, ...targetCoordinates(target));
    await page.mouse.click(point.x, point.y);
  };
  const tapTarget = async (page, target) => {
    const point = await canvasPoint(page, ...targetCoordinates(target));
    await page.touchscreen.tap(point.x, point.y);
  };
  const inspectFling = async (page, mode) => page.evaluate(async mode => {
    // A disposable rendered scene checks the drawing API without exposing or
    // altering the application's scene instance or its user-visible counters.
    const { Universe } = await import(new URL('./assets/universe.js', location.href).href);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:1250px;height:430px;position:fixed;left:-9999px;top:0;pointer-events:none';
    document.body.append(canvas);
    const scene = new Universe(canvas, { reducedMotion: true });
    try {
      scene.setMode(mode);
      const start = mode === 'lab' ? { x: 203, y: 206 } : { x: 153, y: 143 };
      const from = { x: (start.x + scene.offsetX) / scene.viewW, y: (start.y + scene.offsetY) / scene.viewH };
      const to = mode === 'lab' ? { x: .84, y: .18 } : { x: (scene.core.x + scene.offsetX) / scene.viewW, y: (scene.core.y + scene.offsetY) / scene.viewH };
      scene.setGesture({ active: true, startX: from.x, startY: from.y, x: from.x, y: from.y });
      scene.setGesture({ active: true, startX: from.x, startY: from.y, x: to.x, y: to.y });
      scene.setGesture({ active: false });
      scene.hit(from.x, from.y, { fling: { dx: to.x - from.x, dy: to.y - from.y }, endX: to.x, endY: to.y });
      const objects = mode === 'lab' ? scene.equipment : scene.cards;
      const released = scene.point(to.x, to.y), flight = scene.flights[0], ring = scene.rings[0];
      return { selectedGone: objects[0].gone, otherGone: objects.slice(1).some(item => item.gone),
        flightAtRelease: Math.abs(flight.x - released.x) < .001 && Math.abs(flight.y - released.y) < .001,
        ringAtRelease: Math.abs(ring.x - released.x) < .001 && Math.abs(ring.y - released.y + (mode === 'lab' ? 30 : 0)) < .001 };
    } finally { scene.destroy(); canvas.remove(); }
  }, mode);
  const mouseHold = async (page, selector, duration = 2520, point = [.5, .5]) => {
    const element = page.locator(selector); await element.scrollIntoViewIfNeeded();
    const box = await element.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width * point[0], box.y + box.height * point[1]);
    await page.mouse.down(); await page.waitForTimeout(duration); await page.mouse.up();
  };
  const completed = async (page, item) => {
    await page.locator('#result-panel').waitFor({ state: 'visible' });
    assert.equal(await progress(page), item.complete);
    assert.equal(await page.locator('#result-title').textContent(), item.title);
    assert.equal(await page.locator('#completion-dialog').isVisible(), false, 'completion leaves the scene visible');
    assert.equal(await page.locator('#result-button').isVisible(), true);
    assert.equal(await page.locator('#hit-button').isEnabled(), true);
  };
  const canvasFrame = async (page, filename) => {
    const data = await page.locator('#universe').evaluate(el => el.toDataURL('image/png'));
    const pixels = Buffer.from(data.split(',')[1], 'base64');
    if (filename) await fs.writeFile(path.join(__dirname, filename), pixels);
    return digest(pixels);
  };
  try {
    const page = await newPage('reduced-motion');
    await verify('page renders four distinct plays and a usable canvas', async () => {
      assert.match(await page.title(), /北医下班宇宙/); assert.equal(await page.locator('.mode-card').count(), 4);
      assert.equal(await progress(page), '0 / 6');
      assert.ok(await page.locator('#universe').evaluate(el => el.width > 300 && el.height > 200));
      await page.locator('#hit-button').click(); assert.equal(await progress(page), '1 / 6');
      assert.ok(await score(page) > 0); assert.equal(await page.locator('#total-release').textContent(), '01');
      await page.locator('#reset-button').click();
    });
    await verify('laboratory equipment responds to a real mouse fling with a bonus', async () => {
      await selectMode(page, 'lab'); await dragCanvas(page, await authoredTarget(page, 203, 206), [.84, .18]);
      assert.equal(await progress(page), '1 / 6'); assert.match(await page.locator('#impact-text').textContent(), /甩得漂亮/);
      const flingScore = await score(page); await page.locator('#reset-button').click(); await page.locator('#hit-button').click();
      assert.ok(flingScore > await score(page), 'flinging is rewarded more than a tap');
      assert.deepEqual(await inspectFling(page, 'lab'), { selectedGone: true, otherGone: false, flightAtRelease: true, ringAtRelease: true });
    });
    await verify('mentor messages drag away and all three reply tools accept input', async () => {
      await selectMode(page, 'mentor'); await dragCanvas(page, await authoredTarget(page, 153, 143), [.5, .48]);
      assert.equal(await progress(page), '1 / 5'); assert.match(await page.locator('#impact-text').textContent(), /甩得漂亮/);
      assert.deepEqual(await inspectFling(page, 'mentor'), { selectedGone: true, otherGone: false, flightAtRelease: true, ringAtRelease: true });
      for (const tool of modes[1].tools) {
        await page.locator(`[data-tool="${tool}"]`).click();
        assert.equal(await page.locator(`[data-tool="${tool}"]`).getAttribute('aria-pressed'), 'true');
        const before = await score(page); await page.locator('#hit-button').click(); assert.ok(await score(page) > before);
      }
    });
    await verify('twelve creative tools work and three intensity choices accept selection', async () => {
      for (const item of modes) {
        await selectMode(page, item.id); assert.equal(await page.locator('[data-tool]').count(), 3);
        for (let i = 0; i < item.tools.length; i++) {
          const level = String(i + 1); await page.locator(`button[data-intensity="${level}"]`).click();
          assert.equal(await page.locator('#game-area').getAttribute('data-intensity'), level);
          assert.equal(await page.locator(`button[data-intensity="${level}"]`).getAttribute('aria-pressed'), 'true');
          await page.locator(`[data-tool="${item.tools[i]}"]`).click();
          assert.equal(await page.locator(`[data-tool="${item.tools[i]}"]`).getAttribute('aria-pressed'), 'true');
          const before = await score(page); await page.locator('#hit-button').click();
          assert.ok(await score(page) > before, `${item.id}/${item.tools[i]}/intensity ${level}`);
        }
      }
      await page.locator('button[data-intensity="2"]').click();
    });
    for (const [persona, profile] of Object.entries(PERSONAS)) {
      for (const contract of modeContracts) {
        await verify(`${persona}/${contract.id}: role-specific scene, touchable tools, ending and replay`, async () => {
          await selectPersona(page, persona); await selectMode(page, contract.id);
          const scene = profile.modes[contract.id];
          assert.equal(await page.locator('#scene-name').textContent(), scene.name);
          assert.equal(await page.locator(`.mode-card[data-mode="${contract.id}"] .desktop-title`).textContent(), scene.cardTitle);
          assert.equal(await page.locator('#mode-description').textContent(), scene.description);
          const labels = await page.locator('#tool-rack button').allTextContents();
          for (const [key, , label] of scene.tools) {
            assert.ok((await page.locator(`[data-tool="${key}"]`).textContent()).includes(label));
          }
          personaScenes.push({ persona, mode: contract.id, name: scene.name, toolLabels: labels,
            canvas: await canvasFrame(page, `v4-${persona}-${contract.id}.png`) });
          await page.locator('#hit-button').click(); assert.ok(await score(page) > 0);
          await page.locator('#destroy-button').click(); await completed(page, { ...contract, title: scene.title });
          assert.equal(await page.locator('#result-description').textContent(), scene.message.replace('\n', ' '));
          await page.locator('#hit-button').click(); assert.equal(await progress(page), contract.empty);
          assert.equal(await page.locator('#result-panel').isVisible(), false);
        });
      }
    }
    await verify('all twelve scenes differ and each role has its own tools and canvas artwork', async () => {
      assert.equal(await page.locator('#persona-picker button[data-persona]').count(), 3);
      assert.equal(personaScenes.length, 12); assert.equal(new Set(personaScenes.map(scene => scene.name)).size, 12);
      for (const { id } of modeContracts) {
        const scenes = personaScenes.filter(scene => scene.mode === id);
        assert.equal(new Set(scenes.map(scene => scene.toolLabels.join('|'))).size, 3, `${id} tool choices adapt to the role`);
        assert.equal(new Set(scenes.map(scene => scene.canvas)).size, 3, `${id} canvas adapts to the role`);
      }
      await selectPersona(page, 'phd');
    });
    await verify('three real settings and twelve target maps reject blank clicks without scoring', async () => {
      const settings = { phd: 'laboratory', doctor: 'hospital', teacher: 'school' };
      for (const persona of Object.keys(PERSONAS)) {
        await selectPersona(page, persona);
        for (const { id } of modeContracts) {
          await selectMode(page, id);
          const map = await sceneTargets(page, persona, id);
          assert.equal(map.environment, settings[persona]); assert.ok(map.targets.length > 0);
          assert.ok(map.targets.every(target => [target.x, target.y].every(Number.isFinite)));
          if (persona !== 'phd') assert.ok(map.targets.every(target => !['mouse', 'researcher'].includes(target.kind)));
          const before = await progress(page), points = await score(page);
          const empty = await canvasPoint(page, .98, .02); await page.mouse.click(empty.x, empty.y);
          assert.equal(await progress(page), before, `${persona}/${id}: blank space cannot remove a task`);
          assert.equal(await score(page), points, `${persona}/${id}: blank space cannot earn points`);
          targetedInteractions.push({ persona, mode: id, environment: map.environment, targets: map.targets, blankDoesNotScore: true });
        }
      }
    });
    await verify('a laboratory mouse and a human PhD student respond separately without removing equipment', async () => {
      await selectPersona(page, 'phd'); await selectMode(page, 'lab');
      const map = await sceneTargets(page, 'phd', 'lab');
      await clickTarget(page, map.targets.find(item => item.kind === 'mouse'));
      assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'mouse-pet');
      assert.equal(await page.locator('#game-area').getAttribute('data-last-target'), '99');
      assert.equal(await progress(page), '0 / 6'); assert.equal(await score(page), 0);
      assert.match(await page.locator('#scene-caption').textContent(), /鼠鼠/);
      await clickTarget(page, map.targets.find(item => item.kind === 'researcher'));
      assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'researcher-rest');
      assert.equal(await page.locator('#game-area').getAttribute('data-last-target'), '98');
      assert.equal(await progress(page), '0 / 6'); assert.match(await page.locator('#scene-caption').textContent(), /博士生/);
      const responses = await page.evaluate(async () => {
        const [{ Universe }, { PERSONAS }] = await Promise.all([import(new URL('./assets/universe.js', location.href).href), import(new URL('./assets/personas.js', location.href).href)]);
        const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:1250px;height:430px;position:fixed;left:-9999px;top:0'; document.body.append(canvas);
        const scene = new Universe(canvas, { reducedMotion: true });
        try {
          scene.setPersona('phd', PERSONAS.phd.modes); scene.setMode('lab');
          const map = scene.getTargets(), mouse = map.targets.find(item => item.kind === 'mouse'), student = map.targets.find(item => item.kind === 'researcher');
          const mouseFeedback = scene.hit(mouse.x, mouse.y), studentFeedback = scene.hit(student.x, student.y);
          return { mouseFeedback, studentFeedback, reactedMouseIds: scene.mouseReactions.map(reaction => reaction.id), studentReaction: scene.researcherReaction, remainingEquipment: scene.equipment.filter(item => !item.gone).length };
        } finally { scene.destroy(); canvas.remove(); }
      });
      assert.deepEqual(responses.reactedMouseIds, [99]); assert.ok(responses.studentReaction > 0); assert.equal(responses.remainingEquipment, 6);
      targetedInteractions.push({ persona: 'phd', mode: 'lab', responses });
      await page.locator('#game-area').screenshot({ path: path.join(__dirname, 'v4-phd-human-mouse-interaction.png') });
    });
    await verify('individual PhD mice dance, bubble and eat only when their own target is clicked', async () => {
      const interactions = { disco: 'mouse-dance', bubbles: 'mouse-bubble', snacks: 'mouse-feed' };
      for (const [tool, expected] of Object.entries(interactions)) {
        await selectMode(page, 'mice'); await page.locator(`[data-tool="${tool}"]`).click();
        const mouse = (await sceneTargets(page, 'phd', 'mice')).targets.find(item => item.kind === 'mouse' && item.id === 2);
        await clickTarget(page, mouse);
        assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), expected);
        assert.equal(await page.locator('#game-area').getAttribute('data-last-target'), '2');
        assert.equal(await progress(page), '1 / 12');
        targetedInteractions.push({ persona: 'phd', mode: 'mice', tool, targetId: 2, interaction: expected });
      }
    });
    await verify('PhD mentor and student avatars have separate responses while messages remain available', async () => {
      await selectMode(page, 'mentor'); const map = await sceneTargets(page, 'phd', 'mentor');
      for (const [kind, expected, id] of [['mentor', 'mentor-pause', 97], ['researcher', 'researcher-rest', 98]]) {
        await clickTarget(page, map.targets.find(target => target.kind === kind));
        assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), expected);
        assert.equal(await page.locator('#game-area').getAttribute('data-last-target'), String(id));
        assert.equal(await progress(page), '0 / 5'); assert.equal(await score(page), 0);
      }
      await clickTarget(page, map.targets.find(target => target.kind === 'notification'));
      assert.equal(await progress(page), '1 / 5');
    });
    await verify('hospital grant, inspection and DRG documents require the matching classification bin', async () => {
      await selectPersona(page, 'doctor'); await selectMode(page, 'lab');
      const map = await sceneTargets(page, 'doctor', 'lab');
      assert.equal(map.bins.length, 3); assert.ok(map.bins.some(bin => /标书/.test(bin.label))); assert.ok(map.bins.some(bin => /检查/.test(bin.label))); assert.ok(map.bins.some(bin => /DRG/.test(bin.label)));
      assert.ok(map.targets.some(item => /标书/.test(item.label))); assert.ok(map.targets.some(item => /检查/.test(item.label))); assert.ok(map.targets.some(item => /DRG/.test(item.label)));
      const first = map.targets[0], correct = map.bins.find(bin => bin.label === first.category), wrong = map.bins.find(bin => bin.id !== correct.id);
      await dragCanvas(page, targetCoordinates(first), targetCoordinates(wrong));
      assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'sort-wrong');
      assert.equal(await progress(page), '0 / 6'); assert.equal(await score(page), 0);
      for (let i = 0; i < map.targets.length; i++) {
        const target = map.targets[i], bin = map.bins.find(item => item.label === target.category); assert.ok(bin);
        await dragCanvas(page, targetCoordinates(target), targetCoordinates(bin));
        assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'sort-correct');
        assert.equal(await page.locator('#game-area').getAttribute('data-last-target'), String(target.id));
        assert.equal(await progress(page), `${i + 1} / 6`);
        targetedInteractions.push({ persona: 'doctor', mode: 'lab', label: target.label, category: target.category, bin: bin.label, wrongAttemptScoresZero: i === 0 });
      }
      await completed(page, { ...modeContracts[0], title: PERSONAS.doctor.modes.lab.title });
    });
    await verify('doctors break the DRG stack and remove actual administrative conveyor papers', async () => {
      await selectMode(page, 'earth'); const stack = (await sceneTargets(page, 'doctor', 'earth')).targets[0];
      assert.equal(stack.kind, 'drg-stack'); await clickTarget(page, stack);
      assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'drg-break'); assert.equal(await progress(page), '8%');
      await selectMode(page, 'mice'); const paper = (await sceneTargets(page, 'doctor', 'mice')).targets[0];
      assert.equal(paper.kind, 'queue-paper'); await clickTarget(page, paper);
      assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'admin-queue-clear');
      assert.equal(await page.locator('#game-area').getAttribute('data-last-target'), String(paper.id)); assert.equal(await progress(page), '1 / 12');
      await page.locator('#game-area').screenshot({ path: path.join(__dirname, 'v4-doctor-conveyor-interaction.png') });
      targetedInteractions.push({ persona: 'doctor', mode: 'mice', paper: paper.label, interaction: 'admin-queue-clear' });
    });
    await verify('school burdens become different paper balls that physically arrive at the supplied character face', async () => {
      await selectPersona(page, 'teacher'); await selectMode(page, 'mentor');
      await clickTarget(page, (await sceneTargets(page, 'teacher', 'mentor')).targets.find(target => target.kind === 'notification'));
      assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'notification-face'); assert.equal(await progress(page), '1 / 5');
      await selectMode(page, 'mice');
      const map = await sceneTargets(page, 'teacher', 'mice'), face = map.targets.find(target => target.kind === 'face'); assert.ok(face);
      for (let i = 0; i < 3; i++) {
        await clickTarget(page, face); assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'paper-face');
        assert.equal(await progress(page), `${i + 1} / 12`);
      }
      const papers = await page.evaluate(async () => {
        const [{ Universe }, { PERSONAS }] = await Promise.all([import(new URL('./assets/universe.js', location.href).href), import(new URL('./assets/personas.js', location.href).href)]);
        const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:1250px;height:430px;position:fixed;left:-9999px;top:0'; document.body.append(canvas);
        const scene = new Universe(canvas, { reducedMotion: false });
        try {
          scene.setPersona('teacher', PERSONAS.teacher.modes); scene.setMode('mice');
          for (let attempts = 0; attempts < 200 && scene.teacherAssetStatus === 'loading'; attempts++) await new Promise(resolve => setTimeout(resolve, 15));
          const rolePaths = [];
          for (const mode of ['lab', 'mentor', 'earth', 'mice']) {
            scene.setMode(mode);
            const target = scene.getTargets().targets[0], result = scene.hit(target.x, target.y), flight = scene.flights.find(item => item.kind === 'burden');
            rolePaths.push({ mode, interaction: result.interaction, label: flight?.text, to: flight ? [flight.toX, flight.toY] : [], face: [scene.character.faceX, scene.character.faceY] });
          }
          scene.setMode('mice'); const face = scene.getTargets().targets.find(item => item.kind === 'face'), feedback = [];
          for (let i = 0; i < 3; i++) feedback.push(scene.hit(face.x, face.y));
          const launched = scene.flights.filter(flight => flight.kind === 'burden').map(flight => ({ label: flight.text, from: [flight.originX, flight.originY], to: [flight.toX, flight.toY] }));
          await new Promise(resolve => setTimeout(resolve, 620));
          return { asset: scene.teacherAssetStatus, rolePaths, feedback, launched, face: [scene.character.faceX, scene.character.faceY], stickers: scene.stickers.map(item => item.text), contacts: scene.effects.filter(effect => effect.kind === 'paper-contact').length };
        } finally { scene.destroy(); canvas.remove(); }
      });
      assert.equal(papers.asset, 'ready'); assert.equal(papers.launched.length, 3); assert.equal(new Set(papers.launched.map(paper => paper.label)).size, 3);
      assert.ok(papers.rolePaths.every(path => path.label && path.to[0] === path.face[0] && path.to[1] === path.face[1]), 'all four school scenes send their own paper burden to the character');
      assert.ok(papers.launched.every(paper => paper.to[0] === papers.face[0] && paper.to[1] === papers.face[1]));
      assert.deepEqual(new Set(papers.stickers), new Set(papers.launched.map(paper => paper.label))); assert.ok(papers.contacts > 0);
      targetedInteractions.push({ persona: 'teacher', mode: 'mice', papers });
      await page.locator('#game-area').screenshot({ path: path.join(__dirname, 'v4-teacher-face-interaction.png') });
    });
    await verify('school paper throws use the real release point when dragging toward or away from the face', async () => {
      for (const mode of ['earth', 'mice']) {
        await selectMode(page, mode); const face = (await sceneTargets(page, 'teacher', mode)).targets.find(target => target.kind === 'face');
        await dragCanvas(page, [.05, .94], targetCoordinates(face));
        assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'paper-face'); assert.ok(parseInt(await progress(page), 10) > 0);
        await selectMode(page, mode); await dragCanvas(page, targetCoordinates(face), [.05, .94]);
        assert.equal(await page.locator('#game-area').getAttribute('data-last-interaction'), 'paper-miss');
        assert.equal(await progress(page), mode === 'earth' ? '0%' : '0 / 12'); assert.equal(await score(page), 0);
        targetedInteractions.push({ persona: 'teacher', mode, dragToFaceApplied: true, dragAwayFromFaceApplied: false });
      }
    });
    await verify('fully charged canvas holds require the actual DDL, DRG or school face target', async () => {
      for (const [persona, profile] of Object.entries(PERSONAS)) {
        await selectPersona(page, persona); await selectMode(page, 'earth');
        await mouseHold(page, '#universe', 2520, [.98, .02]);
        assert.equal(await progress(page), '0%'); assert.equal(await score(page), 0);
        assert.equal(await page.locator('#game-area').getAttribute('data-phase'), 'ready'); assert.equal(await page.locator('#result-panel').isVisible(), false);
        const target = (await sceneTargets(page, persona, 'earth')).targets[0]; await mouseHold(page, '#universe', 2520, targetCoordinates(target));
        await completed(page, { ...modeContracts[2], title: profile.modes.earth.title });
        targetedInteractions.push({ persona, mode: 'earth', chargedBlankApplied: false, chargedTargetKind: target.kind, chargedTargetApplied: true });
      }
      await selectPersona(page, 'phd');
    });
    await verify('doctor and teacher drawings never call the mouse renderer in any ready or exploded scene', async () => {
      const renderers = await page.evaluate(async () => {
        const [{ Universe }, { PERSONAS }] = await Promise.all([import(new URL('./assets/universe.js', location.href).href), import(new URL('./assets/personas.js', location.href).href)]);
        const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:1250px;height:430px;position:fixed;left:-9999px;top:0'; document.body.append(canvas);
        const scene = new Universe(canvas, { reducedMotion: true }), calls = [];
        const drawMouse = scene.mouse.bind(scene); scene.mouse = (...args) => { calls.push({ persona: scene.persona, mode: scene.mode }); return drawMouse(...args); };
        try {
          for (const persona of ['doctor', 'teacher']) {
            scene.setPersona(persona, PERSONAS[persona].modes);
            for (const mode of ['lab', 'mentor', 'earth', 'mice']) { scene.setMode(mode); scene.draw(); scene.burst(); scene.draw(); }
          }
          return calls;
        } finally { scene.destroy(); canvas.remove(); }
      });
      assert.deepEqual(renderers, []); await selectPersona(page, 'phd');
    });
    await verify('switching roles clears an active charge and prevents old scene completion returning', async () => {
      const switched = await newPage('persona-switch', { reducedMotion: 'no-preference' });
      await selectMode(switched, 'earth'); await switched.locator('#universe').focus(); await switched.keyboard.down('Space');
      await switched.waitForTimeout(120); await selectPersona(switched, 'doctor'); await switched.keyboard.up('Space');
      assert.equal(await progress(switched), '0%'); assert.equal(await switched.locator('#charge-button').getAttribute('aria-pressed'), 'false');
      assert.equal(await switched.locator('#game-area').getAttribute('data-phase'), 'ready');
      await switched.locator('#destroy-button').click(); assert.equal(await switched.locator('#game-area').getAttribute('data-phase'), 'burst');
      await selectPersona(switched, 'teacher'); await switched.waitForTimeout(2900);
      assert.equal(await switched.locator('#game-area').getAttribute('data-mode'), 'earth');
      assert.equal(await switched.locator('#scene-name').textContent(), PERSONAS.teacher.modes.earth.name);
      assert.equal(await progress(switched), '0%'); assert.equal(await switched.locator('#result-panel').isVisible(), false);
      assert.equal(await switched.locator('#game-area').getAttribute('data-phase'), 'ready');
      await switched.locator('#hit-button').click(); assert.ok(await score(switched) > 0); await switched.close();
    });
    for (const item of modes) {
      await verify(`${item.id}: scene result, optional dialog and repeat play`, async () => {
        await selectMode(page, item.id); await page.locator('#destroy-button').click(); await completed(page, item);
        await page.locator('#result-button').click(); assert.equal(await page.locator('#completion-dialog').isVisible(), true);
        assert.equal(await page.locator('#completion-title').textContent(), item.title);
        await page.locator('#again-button').click(); assert.equal(await page.locator('#completion-dialog').isVisible(), false);
        assert.equal(await progress(page), item.empty); assert.equal(await page.locator('#result-panel').isVisible(), false);
        await page.locator('#destroy-button').click(); await completed(page, item); await page.locator('#hit-button').click();
        assert.equal(await progress(page), item.empty, 'replay restores a clean playable scene');
      });
    }
    await verify('six lab objects and five mentor messages complete naturally', async () => {
      for (const item of modes.slice(0, 2)) {
        await selectMode(page, item.id);
        for (let i = 0; i < (item.id === 'lab' ? 6 : 5); i++) await page.locator('#hit-button').click();
        await completed(page, item);
      }
    });
    await verify('earth taps add progress and a real canvas hold unloads the planet', async () => {
      await selectMode(page, 'earth'); const target = (await sceneTargets(page, 'phd', 'earth')).targets[0];
      await clickTarget(page, target); assert.equal(await progress(page), '8%');
      await mouseHold(page, '#universe', 2520, targetCoordinates(target)); await completed(page, modes[2]);
    });
    await verify('earth charge button and held keyboard release a full charge', async () => {
      await selectMode(page, 'earth'); await mouseHold(page, '#charge-button'); await completed(page, modes[2]);
      await page.locator('#reset-button').click(); await page.locator('#universe').focus();
      await page.keyboard.down('Space'); await page.waitForTimeout(2520); await page.keyboard.up('Space'); await completed(page, modes[2]);
    });
    await verify('cancelled pointer and escaped charge never accidentally destroy a scene', async () => {
      await selectMode(page, 'earth'); const p = await canvasPoint(page);
      await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(120);
      await page.locator('#universe').dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
      assert.equal(await progress(page), '0%'); assert.equal(await page.locator('#charge-button').getAttribute('aria-pressed'), 'false');
      await page.locator('#universe').focus(); await page.keyboard.down('Space'); await page.waitForTimeout(100);
      await page.keyboard.press('Escape'); await page.keyboard.up('Space');
      assert.equal(await progress(page), '0%'); assert.equal(await page.locator('#result-panel').isVisible(), false);
      await page.locator('#charge-button').scrollIntoViewIfNeeded(); const box = await page.locator('#charge-button').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(100);
      await page.locator('#charge-button').dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up(); assert.equal(await progress(page), '0%');
    });
    await verify('a second pointer or unrelated key cannot release somebody else’s charge', async () => {
      await selectMode(page, 'earth'); await page.locator('#charge-button').scrollIntoViewIfNeeded();
      const box = await page.locator('#charge-button').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.locator('#charge-button').dispatchEvent('pointerup', { pointerId: 88, button: 0 });
      await page.locator('#universe').dispatchEvent('pointerdown', { pointerId: 88, button: 0, clientX: 10, clientY: 10 });
      await page.locator('#universe').dispatchEvent('pointerup', { pointerId: 88, button: 0, clientX: 10, clientY: 10 });
      assert.equal(await page.locator('#charge-button').getAttribute('aria-pressed'), 'true'); assert.equal(await progress(page), '0%');
      await page.mouse.up(); assert.ok(parseInt(await progress(page), 10) >= 8);
      await page.locator('#reset-button').click(); const canvas = await canvasPoint(page);
      await page.mouse.move(canvas.x, canvas.y); await page.mouse.down();
      await page.locator('#universe').dispatchEvent('pointercancel', { pointerId: 88 });
      await page.locator('#universe').dispatchEvent('lostpointercapture', { pointerId: 88 });
      assert.equal(await page.locator('#charge-button').getAttribute('aria-pressed'), 'true'); assert.equal(await progress(page), '0%');
      await page.mouse.up(); assert.ok(parseInt(await progress(page), 10) >= 8, 'the owned canvas gesture survives unrelated cancellation');
      await page.locator('#reset-button').click(); await page.locator('#universe').focus(); await page.keyboard.down('Space');
      await page.keyboard.press('Enter'); assert.equal(await page.locator('#charge-button').getAttribute('aria-pressed'), 'true');
      assert.equal(await progress(page), '0%'); await page.keyboard.up('Space'); assert.ok(parseInt(await progress(page), 10) >= 8);
      await page.locator('#destroy-button').click(); await completed(page, modes[2]);
      await page.locator('#charge-button').evaluate(element => element.click());
      assert.ok(parseInt(await progress(page), 10) > 0 && parseInt(await progress(page), 10) < 100, 'assistive activation replays and acts');
      assert.equal(await page.locator('#result-panel').isVisible(), false);
    });
    await verify('mouse beat doubles joy and fast actions make a combo that expires', async () => {
      await selectMode(page, 'mice'); await page.locator('#hit-button').click(); await page.waitForTimeout(400); await page.locator('#hit-button').click();
      assert.equal(await progress(page), '3 / 12'); assert.match(await page.locator('#impact-text').textContent(), /合拍/);
      await page.locator('#hit-button').click(); assert.equal(await page.locator('#combo-value').textContent(), '3×');
      await page.waitForTimeout(1470); assert.equal(await page.locator('#combo-value').textContent(), '—');
      await page.locator('#hit-button').click(); assert.equal(await page.locator('#combo-value').textContent(), '—');
      await selectMode(page, 'lab'); assert.equal(await progress(page), '0 / 6'); assert.equal(await score(page), 0);
      assert.equal(await page.locator('#combo-value').textContent(), '—'); assert.equal(await page.locator('[data-tool="hammer"]').getAttribute('aria-pressed'), 'true');
    });
    await verify('keyboard play, immersive escape and optional celebration preserve control', async () => {
      await selectMode(page, 'mentor'); await page.locator('#universe').focus(); await page.keyboard.press('Enter'); assert.equal(await progress(page), '1 / 5');
      await page.locator('#fullscreen-button').click(); assert.equal(await page.locator('#game-area').evaluate(el => el.classList.contains('immersive')), true);
      for (let i = 0; i < 18; i++) {
        await page.keyboard.press(i < 9 ? 'Tab' : 'Shift+Tab');
        assert.equal(await page.locator('#game-area').evaluate(el => el.contains(document.activeElement)), true, 'immersive controls retain keyboard focus');
      }
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#game-area').evaluate(el => el.classList.contains('immersive')), false);
      await page.locator('#destroy-button').click(); await completed(page, modes[1]);
      await page.locator('#result-button').click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#completion-dialog').isVisible(), false);
      await page.locator('#result-button').click(); await page.locator('#rest-button').click();
      assert.equal(await page.locator('#breathing-button').evaluate(el => el === document.activeElement), true);
    });
    await verify('shredder validates empty input, clears private text and never executes markup', async () => {
      await page.locator('.shred-button').click(); assert.equal(await page.locator('#vent-input').evaluate(el => el === document.activeElement), true);
      await page.locator('#vent-input').fill('<img src=x onerror="alert(1)"> 为什么又要补实验？'); assert.match(await page.locator('#character-count').textContent(), /\d+ \/ 240/);
      await page.locator('.shred-button').click(); await page.waitForFunction(() => document.querySelector('#shredder-output').textContent.includes('已粉碎'));
      assert.equal(await page.locator('#vent-input').inputValue(), ''); assert.equal(await page.locator('#character-count').textContent(), '0 / 240');
      assert.equal(await page.locator('#shredder-stream img, #shredder-output img').count(), 0);
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.deepEqual(unexpectedDialogs, []);
      for (const chip of await page.locator('[data-prompt]').all()) { await chip.click(); assert.ok((await page.locator('#vent-input').inputValue()).length > 0); }
      await page.locator('#vent-input').fill('');
    });
    await verify('sound is opt-in and a personalized after-hours permit can be collected', async () => {
      assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false'); await page.locator('#sound-toggle').click();
      assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true'); await page.locator('#sound-toggle').click();
      assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false'); await page.locator('#permission-button').click();
      assert.equal(await page.locator('#permission-card').isVisible(), true); assert.ok((await page.locator('#permission-text').textContent()).length > 15);
      assert.equal(await page.locator('#permission-close').evaluate(el => el === document.activeElement), true);
      await page.locator('#permission-close').click(); assert.equal(await page.locator('#permission-card').isVisible(), false);
      await page.locator('#permission-button').click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#permission-card').isVisible(), false);
    });
    await verify('layout fits widths 320 through 1440 without sideways scrolling', async () => {
      for (const persona of Object.keys(PERSONAS)) {
        await selectPersona(page, persona);
        for (const width of [320, 375, 390, 600, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(80);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${persona}: horizontal overflow at ${width}px`);
        }
      }
      await selectPersona(page, 'phd');
    });
    await verify('60-second breathing follows inhale/exhale, finishes and cancels', async () => {
      // Fake time stays isolated from visual captures and actual pointer gestures.
      const breathing = await newPage('breathing-clock'); await breathing.clock.install(); await breathing.locator('#breathing-button').click();
      assert.equal(await breathing.locator('#breathing-instruction').textContent(), '轻轻吸气'); await breathing.clock.fastForward(4250);
      assert.equal(await breathing.locator('#breathing-instruction').textContent(), '慢慢呼气'); await breathing.clock.fastForward(57000);
      assert.equal(await breathing.locator('#breathing-instruction').textContent(), '做得很好');
      assert.equal(await breathing.locator('#breathing-button').getAttribute('aria-pressed'), 'false');
      await breathing.locator('#breathing-button').click(); await breathing.locator('#breathing-button').click();
      assert.equal(await breathing.locator('#breathing-instruction').textContent(), '慢下来'); assert.equal(await breathing.locator('#breathing-button').getAttribute('aria-pressed'), 'false');
      await breathing.close();
    });
    await verify('phone touch plays, switches modes, completes and returns to rest', async () => {
      const mobile = await newPage('mobile-touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await tapTarget(mobile, (await sceneTargets(mobile, 'phd', 'lab')).targets.find(item => item.kind === 'instrument')); assert.equal(await progress(mobile), '1 / 6');
      await mobile.locator('.mode-card[data-mode="mentor"]').tap(); await mobile.locator('[data-tool="reply"]').tap();
      await tapTarget(mobile, (await sceneTargets(mobile, 'phd', 'mentor')).targets[0]);
      assert.equal(await progress(mobile), '1 / 5'); await mobile.locator('.mode-card[data-mode="earth"]').tap();
      const earthTarget = (await sceneTargets(mobile, 'phd', 'earth')).targets[0]; await tapTarget(mobile, earthTarget); assert.equal(await progress(mobile), '8%');
      const touchPoint = await canvasPoint(mobile, ...targetCoordinates(earthTarget));
      const cdp = await mobile.context().newCDPSession(mobile);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchPoint.x, y: touchPoint.y, id: 11 }] });
      await mobile.waitForTimeout(2520);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await completed(mobile, modes[2]); await cdp.detach();
      await mobile.locator('#result-button').tap(); await mobile.locator('#rest-button').tap();
      assert.equal(await mobile.locator('#breathing-button').evaluate(el => el === document.activeElement), true);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await mobile.close();
    });
    await verify('phone touch targets the laboratory mouse, hospital bins and school character separately', async () => {
      const mobile = await newPage('three-role-mobile-targets', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' });
      const mouse = (await sceneTargets(mobile, 'phd', 'lab')).targets.find(target => target.kind === 'mouse');
      await tapTarget(mobile, mouse); assert.equal(await mobile.locator('#game-area').getAttribute('data-last-interaction'), 'mouse-pet'); assert.equal(await progress(mobile), '0 / 6');
      await selectPersona(mobile, 'doctor'); await selectMode(mobile, 'lab');
      const hospital = await sceneTargets(mobile, 'doctor', 'lab'), paper = hospital.targets[0], bin = hospital.bins.find(item => item.label === paper.category);
      const from = await canvasPoint(mobile, ...targetCoordinates(paper)), to = await canvasPoint(mobile, ...targetCoordinates(bin));
      const cdp = await mobile.context().newCDPSession(mobile);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 21 }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8, id: 21 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
      assert.equal(await mobile.locator('#game-area').getAttribute('data-last-interaction'), 'sort-correct'); assert.equal(await progress(mobile), '1 / 6');
      await mobile.locator('#game-area').screenshot({ path: path.join(__dirname, 'v4-doctor-touch-sort-390.png') });
      await selectPersona(mobile, 'teacher'); await selectMode(mobile, 'mice');
      const face = (await sceneTargets(mobile, 'teacher', 'mice')).targets.find(target => target.kind === 'face'); await tapTarget(mobile, face);
      assert.equal(await mobile.locator('#game-area').getAttribute('data-last-interaction'), 'paper-face'); assert.equal(await progress(mobile), '1 / 12');
      await mobile.waitForTimeout(580); await mobile.locator('#game-area').screenshot({ path: path.join(__dirname, 'v4-teacher-touch-face-390.png') });
      const empty = await canvasPoint(mobile, .98, .02); await mobile.touchscreen.tap(empty.x, empty.y); assert.equal(await progress(mobile), '1 / 12');
      await selectMode(mobile, 'earth'); const chargedFace = (await sceneTargets(mobile, 'teacher', 'earth')).targets.find(target => target.kind === 'face');
      const chargePoint = await canvasPoint(mobile, ...targetCoordinates(chargedFace)); const faceCdp = await mobile.context().newCDPSession(mobile);
      await faceCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: chargePoint.x, y: chargePoint.y, id: 22 }] });
      await mobile.waitForTimeout(2520); await faceCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await faceCdp.detach();
      await mobile.waitForTimeout(580); await mobile.locator('#game-area').screenshot({ path: path.join(__dirname, 'v4-teacher-touch-face-burst-390.png') });
      await completed(mobile, { ...modeContracts[2], title: PERSONAS.teacher.modes.earth.title });
      await mobile.close();
    });
    await verify('role-specific world and object fragments visibly separate over real animation frames', async () => {
      const probe = await newPage('fragment-motion', { reducedMotion: 'no-preference' });
      for (const persona of Object.keys(PERSONAS)) {
        for (const mode of ['lab', 'earth']) {
          const motion = await probe.evaluate(async ({ persona, mode }) => {
            const [{ Universe }, { PERSONAS }] = await Promise.all([
              import(new URL('./assets/universe.js', location.href).href),
              import(new URL('./assets/personas.js', location.href).href),
            ]);
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'width:1250px;height:430px;position:fixed;left:-9999px;top:0;pointer-events:none';
            document.body.append(canvas);
            const scene = new Universe(canvas, { reducedMotion: false });
            const sample = () => {
              const pieces = scene.splitFragments;
              const visible = pieces.filter(piece => piece.x + scene.offsetX >= 0 && piece.x + scene.offsetX <= scene.viewW
                && piece.y + scene.offsetY >= 0 && piece.y + scene.offsetY <= scene.viewH);
              return { age: scene.burstAge, pieces: pieces.length, visible: visible.length,
                meanDistancePx: pieces.reduce((sum, piece) => sum + Math.hypot(piece.x - piece.originX, piece.y - piece.originY) * scene.scale, 0) / Math.max(1, pieces.length),
                finite: pieces.every(piece => [piece.x, piece.y, piece.vx, piece.vy, piece.rotation].every(Number.isFinite)),
                kinds: [...new Set(pieces.map(piece => piece.kind))] };
            };
            try {
              scene.setPersona(persona, PERSONAS[persona].modes); scene.setMode(mode); scene.burst();
              const samples = [sample()];
              await new Promise(resolve => setTimeout(resolve, 180)); samples.push(sample());
              await new Promise(resolve => setTimeout(resolve, 470)); samples.push(sample());
              return { persona, mode, duration: scene.burstDuration, samples };
            } finally { scene.destroy(); canvas.remove(); }
          }, { persona, mode });
          assert.equal(motion.duration, 2.6);
          assert.ok(motion.samples[0].pieces >= 8, `${persona}/${mode} splits into visible material`);
          assert.ok(motion.samples.every(sample => sample.finite), `${persona}/${mode} fragment physics stays finite`);
          assert.ok(motion.samples[1].visible > 0, `${persona}/${mode} fragments remain on the canvas`);
          assert.ok(motion.samples[2].meanDistancePx > motion.samples[1].meanDistancePx + 8, `${persona}/${mode} fragments travel across animation frames`);
          fragmentMotion.push(motion);
        }
      }
      await probe.close();
    });
    await verify('twelve role-specific animated scenes show a multi-stage blast and the offline file plays all roles', async () => {
      const animated = await newPage('normal-motion', { reducedMotion: 'no-preference' });
      for (const [persona, profile] of Object.entries(PERSONAS)) {
        await selectPersona(animated, persona);
        for (const contract of modeContracts) {
          const item = { ...contract, title: profile.modes[contract.id].title };
          await selectMode(animated, item.id); const before = await canvasFrame(animated);
          await animated.locator('#hit-button').click(); await animated.waitForTimeout(160); const hit = await canvasFrame(animated);
          await animated.locator('#destroy-button').click(); const blastStarted = Date.now(), frames = [];
          for (const at of [120, 450, 1000, 2200]) {
            await animated.waitForTimeout(Math.max(1, at - (Date.now() - blastStarted)));
            const filename = `v4-blast-${persona}-${item.id}-${String(at).padStart(4, '0')}.png`;
            frames.push({ atMs: Date.now() - blastStarted, filename, hash: await canvasFrame(animated, filename) });
          }
          await completed(animated, item); const burst = await canvasFrame(animated);
          assert.notEqual(hit, before, `${persona}/${item.id} hit changes the drawing`);
          assert.ok(new Set(frames.map(frame => frame.hash)).size >= 3, `${persona}/${item.id} explosion changes over multiple time points`);
          assert.notEqual(burst, before, `${persona}/${item.id} burst changes the drawing`); imageChanges.push({ persona, mode: item.id, before, hit, frames, burst });
          await animated.locator('#hit-button').click(); assert.equal(await progress(animated), item.empty);
        }
      }
      await animated.close();
      const offline = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
      await offline.addInitScript(() => {
        const NativeImage = window.Image;
        window.__qaImages = [];
        window.Image = class extends NativeImage {
          constructor(...args) { super(...args); window.__qaImages.push(this); }
        };
      });
      observe(offline, 'offline-file'); await offline.goto(pathToFileURL(path.join(__dirname, '../dist/index.html')).href);
      for (const [persona, profile] of Object.entries(PERSONAS)) {
        await selectPersona(offline, persona);
        for (const contract of modeContracts) {
          await selectMode(offline, contract.id); await offline.locator('#hit-button').click();
          assert.ok(await score(offline) > 0); await offline.locator('#destroy-button').click();
          await completed(offline, { ...contract, title: profile.modes[contract.id].title });
          await offline.locator('#hit-button').click(); assert.equal(await progress(offline), contract.empty);
        }
      }
      await offline.waitForFunction(() => window.__qaImages.length > 0 && window.__qaImages.every(image => image.complete && image.naturalWidth > 0));
      const offlineImages = await offline.evaluate(() => window.__qaImages.map(image => ({ source: image.src.slice(0, 40), width: image.naturalWidth, height: image.naturalHeight })));
      assert.ok(offlineImages.every(image => image.source.startsWith('data:image/')), 'the character image is embedded in the offline file');
      loadedOfflineImages.push(...offlineImages);
      await offline.locator('#game-area').screenshot({ path: path.join(__dirname, 'v4-offline-teacher.png') });
      await offline.close();
    });
    await verify('fresh desktop, mobile and four scene screenshots are saved for review', async () => {
      const visual = await newPage('screenshots'); await visual.screenshot({ path: path.join(__dirname, 'v4-hero.png') });
      await visual.screenshot({ path: path.join(__dirname, 'v4-desktop.png'), fullPage: true });
      for (const item of modes) {
        await selectMode(visual, item.id); await visual.locator('#game-area').scrollIntoViewIfNeeded();
        await visual.locator('#game-area').screenshot({ path: path.join(__dirname, `v4-mode-${item.id}.png`) });
      }
      for (const persona of Object.keys(PERSONAS)) {
        for (const width of [1440, 390, 320]) {
          // Keep each full-page capture independent of earlier desktop or phone
          // viewport changes, which produced duplicate tiles in Chromium captures.
          const capture = await newPage(`${persona}-page-${width}`, { viewport: { width, height: 900 }, hasTouch: width < 600, isMobile: width < 600 });
          await selectPersona(capture, persona); await selectMode(capture, 'lab');
          await capture.evaluate(() => { window.scrollTo(0, 0); });
          await capture.waitForTimeout(250);
          await capture.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await capture.screenshot({ path: path.join(__dirname, `v4-${persona}-page-${width}.png`), fullPage: true });
          await capture.close();
        }
      }
      await visual.close();
      const mobileVisual = await newPage('mobile-screenshot', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await mobileVisual.screenshot({ path: path.join(__dirname, 'v4-mobile.png'), fullPage: true }); await mobileVisual.close();
    });
    await verify('zero browser errors, unexpected dialogs or failed asset requests', async () => {
      assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(httpErrors, []); assert.deepEqual(unexpectedDialogs, []);
    });
    const report = { date: new Date().toISOString(), base, version: 4, passedCount: checks.length, passed: checks,
      coverage: { personas: Object.keys(PERSONAS), interactiveScenes: personaScenes.length, offlineScenes: Object.keys(PERSONAS).length * modeContracts.length,
        animatedScenes: imageChanges.length, responsiveRoleWidthPairs: 21, responsiveWidths: [320, 375, 390, 600, 768, 1024, 1440] },
      personaScenes, targetedInteractions, loadedOfflineImages, imageChanges, fragmentMotion, errors, failedRequests, httpErrors, unexpectedDialogs, all_passed: true };
    await fs.writeFile(path.join(__dirname, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ base, passed: checks, errors, failedRequests, httpErrors, unexpectedDialogs }, null, 2)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
