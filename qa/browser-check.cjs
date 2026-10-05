const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const base = process.env.SITE_URL || 'http://127.0.0.1:8087/';
const modes = [
  { id: 'lab', empty: '0 / 6', complete: '6 / 6', title: '实验室，已发射。', tools: ['hammer', 'gravity', 'rainbow'] },
  { id: 'mentor', empty: '0 / 5', complete: '5 / 5', title: '您已退出加班群聊。', tools: ['shred', 'mute', 'reply'] },
  { id: 'earth', empty: '0%', complete: '100%', title: '新地球，安装完成。', tools: ['meteor', 'laser', 'blackhole'] },
  { id: 'mice', empty: '0 / 12', complete: '12 / 12', title: '鼠鼠宣布：全员下班！', tools: ['disco', 'bubbles', 'snacks'] },
];
const digest = buffer => createHash('sha256').update(buffer).digest('hex');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    ...(process.env.BROWSER_PROXY ? { proxy: { server: process.env.BROWSER_PROXY } } : {}),
  });
  const checks = [], errors = [], failedRequests = [], unexpectedDialogs = [], imageChanges = [];
  const observe = (page, label) => {
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    page.on('requestfailed', request => failedRequests.push(`${label}: ${request.url()}`));
    page.on('dialog', async dialog => { unexpectedDialogs.push(`${label}: ${dialog.message()}`); await dialog.dismiss(); });
  };
  const verify = async (name, action) => { await action(); checks.push(name); console.log(`PASS ${name}`); };
  const newPage = async (label, options = {}) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
    observe(page, label); await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('#scene-name').filter({ hasText: '实验室' }).waitFor(); return page;
  };
  const selectMode = async (page, id) => {
    await page.locator(`.mode-card[data-mode="${id}"]`).click();
    assert.equal(await page.locator(`.mode-card[data-mode="${id}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#game-area').getAttribute('data-mode'), id);
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
      assert.equal(await progress(page), '3 / 12'); assert.match(await page.locator('#impact-text').textContent(), /PERFECT/);
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
    await verify('four animated scenes react and burst, and the offline file plays every mode', async () => {
      const animated = await newPage('normal-motion', { reducedMotion: 'no-preference' });
      for (const item of modes) {
        await selectMode(animated, item.id); const before = digest(await animated.locator('#universe').screenshot());
        await animated.locator('#hit-button').click(); await animated.waitForTimeout(160); const hit = digest(await animated.locator('#universe').screenshot());
        await animated.locator('#destroy-button').click(); await animated.waitForTimeout(2100); await completed(animated, item);
        const burst = digest(await animated.locator('#universe').screenshot()); assert.notEqual(hit, before, `${item.id} hit changes the drawing`);
        assert.notEqual(burst, before, `${item.id} burst changes the drawing`); imageChanges.push({ mode: item.id, before, hit, burst });
        await animated.locator('#hit-button').click(); assert.equal(await progress(animated), item.empty);
      }
      await animated.close();
      const offline = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
      observe(offline, 'offline-file'); await offline.goto(pathToFileURL(path.join(__dirname, '../dist/index.html')).href);
      for (const item of modes) {
        await selectMode(offline, item.id); await offline.locator('#hit-button').click();
        assert.ok(await score(offline) > 0); await offline.locator('#destroy-button').click(); await completed(offline, item);
        await offline.locator('#hit-button').click(); assert.equal(await progress(offline), item.empty);
      }
      await offline.close();
    });
    await verify('fresh desktop, mobile and four scene screenshots are saved for review', async () => {
      const visual = await newPage('screenshots'); await visual.screenshot({ path: path.join(__dirname, 'v2-hero.png') });
      await visual.screenshot({ path: path.join(__dirname, 'v2-desktop.png'), fullPage: true });
      for (const item of modes) {
        await selectMode(visual, item.id); await visual.locator('#game-area').scrollIntoViewIfNeeded();
        await visual.locator('#game-area').screenshot({ path: path.join(__dirname, `v2-mode-${item.id}.png`) });
      }
      await visual.close();
      const mobileVisual = await newPage('mobile-screenshot', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await mobileVisual.screenshot({ path: path.join(__dirname, 'v2-mobile.png'), fullPage: true }); await mobileVisual.close();
    });
    await verify('zero browser errors, unexpected dialogs or failed asset requests', async () => {
      assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(unexpectedDialogs, []);
    });
    const report = { date: new Date().toISOString(), base, version: 2, passed: checks, imageChanges, errors, failedRequests, unexpectedDialogs, all_passed: true };
    await fs.writeFile(path.join(__dirname, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ base, passed: checks, errors, failedRequests, unexpectedDialogs }, null, 2)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
