import { chromium } from 'playwright';
import fs from 'fs';

const out = '/home/claude/touchline/shots';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };

await page.goto('http://localhost:5173');
await page.waitForTimeout(2500);
await shot('01-start');
await page.click('text=New career');
await page.waitForTimeout(500);
await shot('02-pick');
await page.click('text=Arsenal');
await page.fill('input[placeholder="Manager name"]', 'Nacho');
await page.waitForTimeout(300);
await page.click('text=Manage ARS');
await page.waitForTimeout(4000);
await shot('03-home');
await page.click('text=Squad');
await page.waitForTimeout(500);
await shot('04-squad');
await page.click('text=Tactics');
await page.waitForTimeout(500);
await shot('05-tactics');
await page.click('text=Competitions');
await page.waitForTimeout(500);
await shot('06-competitions');
await page.click('text=Transfers');
await page.waitForTimeout(500);
await page.click('text=Player search');
await page.waitForTimeout(800);
await shot('07-transfers');
// continue to first match
await page.click('text=Home');
await page.waitForTimeout(300);
for (let i = 0; i < 12; i++) {
  if (await page.$('text=Kick off')) break;
  const b = page.locator('.topbar button.primary');
  await page.waitForFunction(() => { const el = document.querySelector('.topbar button.primary'); return el && !el.hasAttribute('disabled'); }, null, { timeout: 60000 });
  await b.click();
  await page.waitForTimeout(1500);
  if (i === 0) await shot('08-after-continue');
}
if (await page.$('text=Kick off')) {
  await shot('09-prematch');
  await page.click('text=Kick off');
  await page.waitForTimeout(500);
  await page.click('text=8×');
  await page.waitForTimeout(9000);
  await shot('10-live');
  const skip = await page.$('text=Skip to end');
  if (skip) await skip.click();
  await page.waitForTimeout(800);
  const ft = await page.$('text=see report');
  if (ft) await ft.click();
  await page.waitForTimeout(800);
  await shot('11-post');
  await page.click('text=Line-ups');
  await page.waitForTimeout(400);
  await shot('11b-ratings');
  const cont = await page.$('text=Continue');
  if (cont) await cont.click();
  await page.waitForTimeout(2500);
  await shot('12-home-after');
}
await page.click('text=Fixtures');
await page.waitForTimeout(600);
await shot('13-fixtures');
// mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.click('.bottomnav >> text=Home');
await page.waitForTimeout(600);
await shot('14-mobile-home');
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
