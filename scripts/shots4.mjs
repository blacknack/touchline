import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
const shot = async (n) => { await page.screenshot({ path: `/home/claude/touchline/shots/${n}.png` }); console.log('shot', n); };
await page.goto('http://localhost:5173');
await page.waitForTimeout(2500);
await page.click('text=New career');
await page.waitForTimeout(400);
await page.click('text=Serie A');
await page.click('text=Inter');
await page.fill('input[placeholder="Manager name"]', 'Nacho');
await page.click('text=Manage INT');
await page.waitForTimeout(4000);
await page.click('.sidebar >> text=Home');
await page.waitForTimeout(300);
for (let i = 0; i < 12; i++) {
  if (await page.$('text=Kick off')) break;
  await page.waitForFunction(() => { const el = document.querySelector('.topbar button.primary'); return el && !el.hasAttribute('disabled'); }, null, { timeout: 60000 });
  await page.click('.topbar button.primary');
  await page.waitForTimeout(1200);
}
if (!(await page.$('text=Kick off'))) await page.click('.topbar button.primary');
await page.waitForTimeout(600);
await page.click('label:has-text("assistant") input, text=assistant').catch(() => {});
await page.click('text=Kick off');
await page.waitForTimeout(400);
await page.click('text=2D pitch');
await page.click('text=8×');
// sample the scoreboard vs feed consistency a few times
let samples = 0, mismatches = 0;
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  await page.waitForTimeout(1500);
  if (await page.$('text=Start second half')) { await shot('40-ht'); await page.click('text=Start second half'); continue; }
  if (await page.$('text=Restart ▸')) { await page.click('text=Restart ▸'); continue; }
  if (await page.$('text=Start the shoot-out')) { await page.click('text=Start the shoot-out'); continue; }
  const sub = await page.$('text=Make substitution'); if (sub) { await page.click('text=Done'); continue; }
  const info = await page.evaluate(() => {
    const score = document.querySelector('.score')?.textContent ?? '';
    const feed = [...document.querySelectorAll('.feed .ev')].map((e) => e.textContent ?? '');
    const goalsInFeed = feed.filter((t) => t.includes('⚽')).length;
    return { score, goalsInFeed, clock: document.querySelector('.clock')?.textContent ?? '' };
  });
  samples++;
  const [hs, as] = info.score.split('–').map((x) => Number(x.trim()));
  if (Number.isFinite(hs) && Number.isFinite(as) && info.goalsInFeed > hs + as) mismatches++;
  if (await page.$('text=see report')) break;
}
console.log('samples', samples, 'mismatches', mismatches);
await shot('41-ft');
const ft = await page.$('text=see report'); console.log('fulltime button:', !!ft);
if (ft) { await ft.click(); await page.waitForTimeout(600); await shot('42-report'); }
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
