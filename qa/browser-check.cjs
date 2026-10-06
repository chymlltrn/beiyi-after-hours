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
  const checks = [], errors = [], failedRequests = [], unexpectedDialogs = [], imageChanges = [], personaScenes = [], fragmentMotion = [];
  const observe = (page, label) => {
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    page.on('requestfailed', request => failedRequests.push(`${label}: ${request.url()}`));
    page.on('dialog', async dialog => { unexpectedDialogs.push(`${label}: ${dialog.message()}`); await dialog.dismiss(); });
  };
  const verify = async (name, action) => { await action(); checks.push(name); console.log(`PASS ${name}`); };
  const newPage = async (label, options = {}) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
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
            canvas: await canvasFrame(page, `v3-${persona}-${contract.id}.png`) });
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
      await selectMode(page, 'earth'); const p = await canvasPoint(page, .5, .45); await page.mouse.click(p.x, p.y);
      assert.equal(await progress(page), '8%'); await mouseHold(page, '#universe', 2520, [.5, .45]); await completed(page, modes[2]);
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
      for (const width of [320, 375, 390, 600, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(80);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow at ${width}px`);
      }
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
      await mobile.locator('#universe').tap(); assert.equal(await progress(mobile), '1 / 6');
      await mobile.locator('.mode-card[data-mode="mentor"]').tap(); await mobile.locator('[data-tool="reply"]').tap(); await mobile.locator('#universe').tap();
      assert.equal(await progress(mobile), '1 / 5'); await mobile.locator('.mode-card[data-mode="earth"]').tap(); await mobile.locator('#universe').tap(); assert.equal(await progress(mobile), '8%');
      const touchPoint = await canvasPoint(mobile, .5, .45);
      const cdp = await mobile.context().newCDPSession(mobile);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchPoint.x, y: touchPoint.y, id: 11 }] });
      await mobile.waitForTimeout(2520);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await completed(mobile, modes[2]); await cdp.detach();
      await mobile.locator('#result-button').tap(); await mobile.locator('#rest-button').tap();
      assert.equal(await mobile.locator('#breathing-button').evaluate(el => el === document.activeElement), true);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await mobile.close();
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
    await verify('four animated scenes show a multi-stage blast and the offline file plays all roles', async () => {
      const animated = await newPage('normal-motion', { reducedMotion: 'no-preference' });
      for (const item of modes) {
        await selectMode(animated, item.id); const before = await canvasFrame(animated);
        await animated.locator('#hit-button').click(); await animated.waitForTimeout(160); const hit = await canvasFrame(animated);
        await animated.locator('#destroy-button').click(); const blastStarted = Date.now(), frames = [];
        for (const at of [120, 450, 1000, 2200]) {
          await animated.waitForTimeout(Math.max(1, at - (Date.now() - blastStarted)));
          const filename = `v3-blast-${item.id}-${String(at).padStart(4, '0')}.png`;
          frames.push({ atMs: Date.now() - blastStarted, filename, hash: await canvasFrame(animated, filename) });
        }
        await completed(animated, item); const burst = await canvasFrame(animated);
        assert.notEqual(hit, before, `${item.id} hit changes the drawing`);
        assert.ok(new Set(frames.map(frame => frame.hash)).size >= 3, `${item.id} explosion changes over multiple time points`);
        assert.notEqual(burst, before, `${item.id} burst changes the drawing`); imageChanges.push({ mode: item.id, before, hit, frames, burst });
        await animated.locator('#hit-button').click(); assert.equal(await progress(animated), item.empty);
      }
      await animated.close();
      const offline = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
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
      await offline.close();
    });
    await verify('fresh desktop, mobile and four scene screenshots are saved for review', async () => {
      const visual = await newPage('screenshots'); await visual.screenshot({ path: path.join(__dirname, 'v3-hero.png') });
      await visual.screenshot({ path: path.join(__dirname, 'v3-desktop.png'), fullPage: true });
      for (const item of modes) {
        await selectMode(visual, item.id); await visual.locator('#game-area').scrollIntoViewIfNeeded();
        await visual.locator('#game-area').screenshot({ path: path.join(__dirname, `v3-mode-${item.id}.png`) });
      }
      await visual.close();
      const mobileVisual = await newPage('mobile-screenshot', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await mobileVisual.screenshot({ path: path.join(__dirname, 'v3-mobile.png'), fullPage: true }); await mobileVisual.close();
    });
    await verify('zero browser errors, unexpected dialogs or failed asset requests', async () => {
      assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(unexpectedDialogs, []);
    });
    const report = { date: new Date().toISOString(), base, version: 3, passedCount: checks.length, passed: checks,
      coverage: { personas: Object.keys(PERSONAS), interactiveScenes: personaScenes.length, offlineScenes: Object.keys(PERSONAS).length * modeContracts.length,
        responsiveWidths: [320, 375, 390, 600, 768, 1024, 1440] },
      personaScenes, imageChanges, fragmentMotion, errors, failedRequests, unexpectedDialogs, all_passed: true };
    await fs.writeFile(path.join(__dirname, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ base, passed: checks, errors, failedRequests, unexpectedDialogs }, null, 2)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
