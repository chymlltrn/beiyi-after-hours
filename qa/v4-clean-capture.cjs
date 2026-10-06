const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const records = [], errors = [];
  try {
    for (const persona of ['phd', 'doctor']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`${persona}: ${error.message}`));
      page.on('requestfailed', request => errors.push(`${persona}: ${request.url()}`));
      await page.goto(process.env.SITE_URL || 'http://127.0.0.1:8087/', { waitUntil: 'networkidle' });
      await page.locator(`#persona-picker button[data-persona="${persona}"]`).click();
      await page.locator('.mode-card[data-mode="lab"]').click();
      await page.waitForFunction(() => document.fonts.status === 'loaded');
      await page.evaluate(() => { window.scrollTo(0, 0); });
      await page.waitForTimeout(250);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const dom = await page.evaluate(() => ({
        hero: document.querySelectorAll('section.hero').length,
        game: document.querySelectorAll('#game-area').length,
        canvas: document.querySelectorAll('#universe').length,
        header: document.querySelectorAll('header.header').length,
        footer: document.querySelectorAll('footer.footer').length,
        role: document.body.dataset.persona,
        phase: document.querySelector('#game-area').dataset.phase,
        mode: document.querySelector('#game-area').dataset.mode,
        width: innerWidth, height: innerHeight, pageHeight: document.documentElement.scrollHeight,
        landmarks: ['header.header', '.hero', '#persona-picker', '#game-area', '#rest', 'footer.footer'].map(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { selector, top: rect.top + scrollY, height: rect.height };
        }),
      }));
      for (const key of ['hero', 'game', 'canvas', 'header', 'footer']) assert.equal(dom[key], 1, `${persona}: ${key} appears only once in the DOM`);
      assert.equal(dom.role, persona); assert.equal(dom.phase, 'ready'); assert.equal(dom.mode, 'lab');
      const files = [`v4-${persona}-page-390.png`, `v4-${persona}-viewport-top-390.png`, `v4-${persona}-viewport-game-390.png`, `v4-${persona}-viewport-rest-390.png`];
      await page.screenshot({ path: path.join(__dirname, files[0]), fullPage: true, animations: 'disabled' });
      await page.screenshot({ path: path.join(__dirname, files[1]), animations: 'disabled' });
      await page.locator('#game-area').scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(__dirname, files[2]), animations: 'disabled' });
      await page.locator('#rest').scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(__dirname, files[3]), animations: 'disabled' });
      records.push({ persona, dom, files }); await context.close();
    }
    assert.deepEqual(errors, []);
    const report = { date: new Date().toISOString(), freshContextPerPersona: true, width: 390, records, errors, passed: true };
    await fs.writeFile(path.join(__dirname, 'v4-clean-capture.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
