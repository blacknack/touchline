import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
const shot = async (n, clip) => { await page.screenshot({ path: `/home/claude/touchline/shots/${n}.png`, clip }); console.log('shot', n); };
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
await page.click('text=Kick off');
await page.waitForTimeout(400);
await page.click('text=2D pitch');
await page.click(process.argv[2] ?? 'text=4×');
const box = await (await page.$('canvas')).boundingBox();
const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
for (let i = 0; i < 16; i++) { await page.waitForTimeout(900); await shot(`v${String(i).padStart(2, '0')}`, clip); }
await shot('v-full');
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
