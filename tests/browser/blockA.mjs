// Real-browser integration check. Test data lives only in an isolated Chrome profile.
// Requires Node 22+ and Chrome/Chromium (override path with MFF_BROWSER).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const root = process.cwd();
const cache = resolve(root, 'node_modules/.cache');
const artifacts = resolve(root, 'tests/browser/artifacts');
await mkdir(cache, { recursive: true });
await mkdir(artifacts, { recursive: true });
const binary = [process.env.MFF_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(path => path && existsSync(path));
assert.ok(binary, 'Install Chrome/Chromium or set MFF_BROWSER.');
const url = 'http://127.0.0.1:4179';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4179', '--strictPort'], { cwd: root, windowsHide: true, stdio: 'pipe' });
let serverOutput = '';
server.stderr.on('data', chunk => { serverOutput += chunk; });
let browser;
let socket;
let page;
const runtimeErrors = [];
const checks = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function start(profile) {
  browser = spawn(binary, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const websocket = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    browser.once('error', error => { clearTimeout(timeout); reject(error); });
  });
  socket = new WebSocket(websocket);
  await once(socket, 'open');
  const pending = new Map();
  let counter = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails);
    if (message.id && pending.has(message.id)) {
      const callback = pending.get(message.id); pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error))); else callback.resolve(message.result);
    }
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++counter;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params) => call(method, params, sessionId);
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Page.navigate', { url });
  return {
    command,
    evaluate: async expression => {
      const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    },
    close: async () => {
      const closed = once(browser, 'exit');
      // Chrome can exit before acknowledging Browser.close over CDP.
      await Promise.race([call('Browser.close'), closed]);
      await closed;
      socket.close();
    },
  };
}
async function waitFor(expression, message = expression) {
  for (let attempt = 0; attempt < 100; attempt++) { if (await page.evaluate(`Boolean(${expression})`)) return; await sleep(100); }
  throw new Error(`Timed out: ${message}`);
}
async function click(text) {
  const expression = `(() => { const el = [...document.querySelectorAll('button,a')].find(el => el.innerText.trim().replace(/\\s+/g, ' ') === ${JSON.stringify(text)} || el.getAttribute('aria-label') === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`;
  assert.ok(await page.evaluate(expression), `Missing control: ${text}`);
  await sleep(80);
}
async function fill(label, value) {
  assert.ok(await page.evaluate(`(() => { const label = [...document.querySelectorAll('label')].find(el => el.querySelector(':scope > span')?.textContent === ${JSON.stringify(label)}); const input = label?.querySelector('input'); if (!input) return false; input.focus(); input.select(); return true; })()`), `Missing field: ${label}`);
  await page.command('Input.insertText', { text: value });
  await sleep(60);
}
async function capture(name) {
  await page.evaluate('window.scrollTo(0,0)');
  const { cssContentSize } = await page.command('Page.getLayoutMetrics');
  const result = await page.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } });
  await writeFile(join(artifacts, `${name}.png`), Buffer.from(result.data, 'base64'));
}
async function available(expected) {
  await waitFor(`document.querySelector('[data-testid="available"]')?.textContent === ${JSON.stringify(expected)}`, `available = ${expected}`);
}

try {
  for (let retry = 0; retry < 100; retry++) {
    if (server.exitCode !== null) throw new Error(`Vite failed: ${serverOutput}`);
    try { if ((await fetch(url)).ok) break; } catch { /* Wait for local Vite. */ }
    if (retry === 99) throw new Error('Vite startup timed out');
    await sleep(100);
  }
  const profile = await mkdtemp(join(cache, 'block-a-chrome-'));
  page = await start(profile);
  await waitFor('document.querySelector(".splash")');
  await capture('01-splash');
  await click('Comenzar →');
  await click('Continuar');
  assert.equal(await page.evaluate('document.querySelector("h1").textContent'), '¿Cuánto dinero entra a tu hogar cada mes?');
  await fill('Ingreso mensual total', '2370000');
  assert.equal(await page.evaluate('document.querySelector("input").value'), '2.370.000');
  await capture('02-ingreso');
  await click('Continuar');
  await click('Agregar Energía');
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor('!document.querySelector("dialog[open]")');
  for (const [name, amount] of [['Energía', '123000'], ['Internet', '87000'], ['Alimentación', '410000']]) {
    await click(`Agregar ${name}`);
    await fill('Valor mensual', amount);
    await click('Guardar gasto');
  }
  assert.equal(await page.evaluate('document.querySelector(".selection-total b").textContent'), '$620.000');
  await capture('03-gastos');
  await click('Continuar');
  await click('Sí tengo Registraré mis deudas');
  await fill('Nombre de la deuda', 'Crédito de prueba');
  await fill('Acreedor', 'Entidad de prueba');
  await fill('Monto original', '800000');
  await fill('Saldo pendiente', '640000');
  await fill('Cuota mínima mensual', '80000');
  await fill('Tasa de interés anual (%)', '18');
  await fill('Día de vencimiento', '15');
  await click('Guardar deuda');
  await capture('04-deudas');
  await click('Continuar');
  await fill('Meta de ahorro mensual', '190000');
  await page.evaluate('document.querySelector("input[type=checkbox]").click()');
  await capture('05-ahorro');
  await click('Guardar y ver resumen');
  await waitFor('location.pathname === "/onboarding/summary"');
  await available('$1.560.000');
  await capture('06-resumen');
  await click('Ir a mi Dashboard');
  await waitFor('location.pathname === "/dashboard"');
  await available('$1.560.000');
  assert.equal(await page.evaluate(`document.querySelector('progress[aria-label="Deuda pagada"]').value`), 20);
  assert.ok(await page.evaluate('document.querySelector(".stat-card:last-child").textContent.includes("$190.000")'));
  await capture('07-dashboard-mobile');
  checks.push('UI entry → services → persisted summary → dashboard with actual values and debt progress');

  for (const width of [320, 390, 430, 768, 1280]) {
    await page.command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
    await sleep(100);
    assert.ok(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), `Horizontal overflow at ${width}px`);
    if (width === 320) await capture('08-dashboard-small');
    if (width === 1280) await capture('09-dashboard-desktop');
  }
  checks.push('No horizontal overflow at 320, 390, 430, 768 and 1280 px');
  await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('Activar tema oscuro');
  await capture('10-dashboard-dark');
  await page.command('Page.reload');
  await waitFor('document.documentElement.dataset.theme === "dark" && document.querySelector(".summary-card")');
  await available('$1.560.000');
  await click('Activar tema claro');
  await click('Más: próximamente');
  assert.equal(await page.evaluate('location.pathname'), '/dashboard');
  assert.ok(await page.evaluate('document.querySelector("[role=status]").textContent.includes("próxima entrega")'));
  await click('Cerrar aviso');
  checks.push('Theme persistence and navigation constrained to block A');

  await page.evaluate(`(async () => {
    const { FinanceDatabase } = await import('/src/infrastructure/storage/FinanceDatabase.ts');
    const { createFinanceApplication } = await import('/src/app/services/createFinanceApplication.ts');
    const { findFamily } = await import('/src/app/services/financeWorkspace.ts');
    const db = new FinanceDatabase(); const family = await findFamily(db);
    const app = createFinanceApplication(family.id, db);
    const expense = (await app.services.expenses.list()).find(item => item.name === 'Alimentación');
    await app.services.expenses.update(expense.id, { amount: 450000 }); db.close();
  })()`);
  await available('$1.520.000');
  checks.push('Dashboard reacts to an expense service update without reloading');
  await page.close();
  page = await start(profile);
  await waitFor('location.pathname === "/dashboard" && document.querySelector(".summary-card")');
  await available('$1.520.000');
  assert.ok(await page.evaluate('document.querySelector(".stat-card:nth-child(3)").textContent.includes("$640.000")'));
  checks.push('Full browser restart preserves records and skips completed onboarding');
  await page.close();

  page = await start(await mkdtemp(join(cache, 'block-a-empty-')));
  await waitFor('document.querySelector(".splash")');
  await click('Comenzar →');
  await click('Por ahora no tengo ingresos');
  await click('Continuar');
  await click('Continuar');
  await click('No tengo ¡Qué bien!');
  await click('Continuar');
  await click('Por ahora no reservaré dinero');
  await click('Guardar y ver resumen');
  await waitFor('location.pathname === "/onboarding/summary"');
  await click('Ir a mi Dashboard');
  await available('$0');
  const emptyText = await page.evaluate('document.body.textContent');
  for (const text of ['Agrega tu primer ingreso para comenzar.', 'No tienes deudas registradas.', 'Aún no tienes metas de ahorro.', 'Todavía no tienes gastos registrados este mes.']) assert.ok(emptyText.includes(text), text);
  assert.ok(!/NaN|Infinity|undefined/.test(emptyText));
  await capture('11-dashboard-empty');
  checks.push('Empty onboarding produces real empty states without mock records');
  assert.deepEqual(runtimeErrors, []);
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ checks, runtimeErrors }, null, 2));
  console.log(`PASS: ${checks.length} browser scenarios`);
  checks.forEach(check => console.log(`  ✓ ${check}`));
  await page.close();
} catch (error) {
  if (page) { try { await capture('failure'); console.error(await page.evaluate('document.body.innerText')); } catch { /* Keep original failure. */ } }
  throw error;
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) browser.kill();
  server.kill();
}
