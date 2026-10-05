const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), ...(process.env.BROWSER_PROXY ? { proxy: { server: process.env.BROWSER_PROXY } } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  const failedRequests = [];
  const checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(request.url()));
  const base = process.env.SITE_URL || 'http://127.0.0.1:8087/';
  const verify = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await verify('page initializes and renders canvas', async () => {
      await page.locator('#hit-button').click();
      await page.waitForFunction(() => document.querySelector('#pressure-value').textContent === '10%');
      assert.equal(await page.locator('#total-release').textContent(), '01');
      assert.ok(await page.locator('#universe').evaluate(el => el.width > 300 && el.height > 200));
    });
    await page.locator('#reset-button').click();
    for (const [mode, title] of [['lab', '实验室已飞出太阳系。'], ['mentor', '导师语录已进入黑洞。'], ['earth', '地球重启成功。'], ['mice', '鼠鼠宣布：全员下班！']]) {
      await verify(mode + ': select, play, destroy, restore', async () => {
        await page.locator(`[data-mode="${mode}"]`).click();
        assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'), 'true');
        await page.locator('#universe').focus();
        await page.keyboard.press('Space');
        assert.equal(await page.locator('#pressure-value').textContent(), '10%');
        await page.locator('#destroy-button').click();
        await page.locator('#completion-dialog').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#completion-title').textContent(), title);
        await page.locator('#again-button').click();
        assert.equal(await page.locator('#pressure-value').textContent(), '0%');
        assert.equal(await page.locator('#hit-button').isEnabled(), true);
      });
    }
    await verify('ten clicks automatically complete a session', async () => {
      for (let i = 0; i < 10; i++) await page.locator('#hit-button').click();
      await page.locator('#completion-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#pressure-value').textContent(), '100%');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#completion-dialog').isVisible(), false);
      await page.locator('#reset-button').click();
    });
    await verify('empty vent validation and shred clears input safely', async () => {
      await page.locator('.shred-button').click();
      assert.equal(await page.locator('#vent-input').evaluate(el => el === document.activeElement), true);
      await page.locator('#vent-input').fill('<img src=x onerror="alert(1)"> 为什么又要补实验？');
      await page.locator('.shred-button').click();
      await page.waitForFunction(() => document.querySelector('#shredder-output').textContent.includes('已粉碎'));
      assert.equal(await page.locator('#vent-input').inputValue(), '');
      assert.equal(await page.locator('#shredder-output img').count(), 0);
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    });
    await verify('preset vent works', async () => {
      await page.locator('[data-prompt]').first().click();
      assert.match(await page.locator('#vent-input').inputValue(), /再补一组/);
      await page.locator('#vent-input').fill('');
    });
    await verify('sound toggles explicitly', async () => {
      assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
      await page.locator('#sound-toggle').click();
      assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
      await page.locator('#sound-toggle').click();
    });
    await verify('breathing starts, follows phases, completes and cancels', async () => {
      await page.clock.install();
      await page.locator('#breathing-button').click();
      assert.equal(await page.locator('#breathing-instruction').textContent(), '轻轻吸气');
      await page.clock.fastForward(4250);
      assert.equal(await page.locator('#breathing-instruction').textContent(), '慢慢呼气');
      await page.clock.fastForward(57000);
      assert.equal(await page.locator('#breathing-instruction').textContent(), '做得很好');
      assert.equal(await page.locator('#breathing-button').getAttribute('aria-pressed'), 'false');
      await page.locator('#breathing-button').click();
      await page.locator('#breathing-button').click();
      assert.equal(await page.locator('#breathing-button').getAttribute('aria-pressed'), 'false');
      await page.clock.resume();
    });
    // Keep screenshot capture separate from the clock-manipulated test page.
    const visual = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await visual.goto(base, { waitUntil: 'networkidle' });
    await visual.screenshot({ path: path.join(__dirname, 'desktop.png'), fullPage: true });
    await visual.screenshot({ path: path.join(__dirname, 'desktop-hero.png') });
    await verify('responsive sizes have no horizontal overflow', async () => {
      for (const width of [320, 375, 390, 600, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
      }
    });
    await visual.setViewportSize({ width: 390, height: 844 });
    await visual.reload({ waitUntil: 'networkidle' });
    await visual.screenshot({ path: path.join(__dirname, 'mobile.png'), fullPage: true });
    await visual.close();
    await verify('mobile touch and keyboard do not overflow', async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
      const mobile = await context.newPage();
      mobile.on('pageerror', error => errors.push(error.message));
      await mobile.goto(base, { waitUntil: 'networkidle' });
      await mobile.locator('#universe').tap();
      assert.equal(await mobile.locator('#pressure-value').textContent(), '10%');
      await mobile.locator('[data-mode=earth]').tap();
      await mobile.locator('#destroy-button').tap();
      await mobile.locator('#completion-dialog').waitFor({ state: 'visible' });
      await mobile.locator('#rest-button').tap();
      assert.equal(await mobile.locator('#breathing-button').evaluate(el => el === document.activeElement), true);
      await context.close();
    });
    await verify('zero browser errors or failed asset requests', async () => { assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); });
    const report = { date: new Date().toISOString(), base, passed: checks, errors, failedRequests, all_passed: true };
    await fs.writeFile(path.join(__dirname, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
